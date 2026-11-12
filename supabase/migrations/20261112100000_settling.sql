-- A closed game stays open for settling until everyone has paid.
--
-- Closing the table (public.end_game) still ends the GAME: results are stored
-- and count in everyone's stats right away (status = 'ended'). What's new:
--   poker_tables.settled_at: null = "פתוח להתחשבנות" (transfers still to pay),
--   set = fully closed. It's set by itself when the last transfer is marked
--   "שולם ✓" (a trigger), or by the manager by hand at any time
--   (settled_manually = true). Undoing a mark opens an automatically closed
--   settling again; a manual close stays closed. Reopening the game clears both.
--   A game with no transfers (everyone even, or closed the old way) is settled
--   right away. Every game closed before this migration counts as settled.
-- Only the manager closes the settling by hand (guard). Logged as game_settled /
-- settling_reopened.
-- Privacy, tighter: a phone number for Bit is visible only while the transfer
-- to its owner is still unpaid and the settling is open.

alter table public.poker_tables
  add column settled_at timestamptz,
  add column settled_manually boolean not null default false;

update public.poker_tables set settled_at = coalesce(ended_at, now()) where status = 'ended';

alter table public.poker_tables
  add constraint poker_tables_settled_only_when_ended check (status = 'ended' or settled_at is null);

-- ---------------------------------------------------------------------------
-- Guard: as in 20261111100000_settlement_transfers.sql, plus the settling
-- (only the manager closes it by hand; it starts open when there are transfers).
-- ---------------------------------------------------------------------------
create or replace function private.guard_table_update()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.manager_id is distinct from old.manager_id then
    raise exception 'The table manager cannot be changed' using errcode = '42501';
  end if;
  if (select auth.uid()) is distinct from old.manager_id then
    if new.status = 'ended' and old.status <> 'ended' then
      raise exception 'Only the table manager can end the game' using errcode = '42501';
    end if;
    if old.status = 'ended' and new.status <> 'ended' then
      raise exception 'Only the table manager can reopen the game' using errcode = '42501';
    end if;
    if new.buy_in_mode is distinct from old.buy_in_mode then
      raise exception 'Only the table manager can change who adds buy-ins' using errcode = '42501';
    end if;
    if new.invite_code is distinct from old.invite_code then
      raise exception 'Only the table manager can change the invite code' using errcode = '42501';
    end if;
    if new.name is distinct from old.name then
      raise exception 'Only the table manager can rename the table' using errcode = '42501';
    end if;
    if new.rounding is distinct from old.rounding then
      raise exception 'Only the table manager can change the rounding' using errcode = '42501';
    end if;
    -- Closing (or reopening) the settling by hand. The database does it by itself
    -- when the last transfer is marked paid: that comes from a trigger (depth > 1).
    if (new.settled_at, new.settled_manually) is distinct from (old.settled_at, old.settled_manually)
       and pg_trigger_depth() <= 1 then
      raise exception 'Only the table manager can close the settling' using errcode = '42501';
    end if;
  end if;

  if new.status = 'ended' and old.status <> 'ended' then
    if not private.results_balanced(new.id) then
      raise exception 'Every player needs a final result, and the results must add up to 0' using errcode = '23514';
    end if;
    if not private.transfers_valid(new.id) then
      raise exception 'The transfers don''t match the results' using errcode = '23514';
    end if;
    new.ended_at := now();
    -- Who pays whom stays open ("פתוח להתחשבנות") while there are transfers to pay.
    new.settled_at := case when exists (select 1 from public.settlement_transfers t where t.table_id = new.id) then null else now() end;
    new.settled_manually := false;
  elsif old.status = 'ended' and new.status <> 'ended' then
    new.ended_at := null;
    new.settled_at := null;
    new.settled_manually := false;
  elsif old.status = 'ended' and (
    new.initial_buy_in, new.rebuy_amounts, new.rounding, new.chip_value, new.buy_in_mode, new.end_mode, new.invite_code, new.ended_at
  ) is distinct from (
    old.initial_buy_in, old.rebuy_amounts, old.rounding, old.chip_value, old.buy_in_mode, old.end_mode, old.invite_code, old.ended_at
  ) then
    raise exception 'The game has ended; reopen it to make changes' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Log: as in 20261110100000_chip_value_absent.sql, plus game_settled /
-- settling_reopened.
-- ---------------------------------------------------------------------------
create or replace function private.log_poker_tables()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    perform private.write_log(new.id,
      case new.status when 'playing' then 'game_started' when 'ended' then 'game_ended' else 'game_reset' end,
      '{}'::jsonb);
  end if;
  -- The settling closed (by itself or by the manager) or opened again.
  if new.settled_at is distinct from old.settled_at and new.status = 'ended' and old.status = 'ended' then
    perform private.write_log(new.id, case when new.settled_at is null then 'settling_reopened' else 'game_settled' end,
      jsonb_build_object('manual', new.settled_manually));
  end if;
  if new.buy_in_mode is distinct from old.buy_in_mode then
    perform private.write_log(new.id, 'mode_changed', jsonb_build_object('mode', new.buy_in_mode));
  end if;
  if new.initial_buy_in is distinct from old.initial_buy_in or new.rebuy_amounts is distinct from old.rebuy_amounts then
    perform private.write_log(new.id, 'settings_changed', jsonb_build_object(
      'initial_buy_in', new.initial_buy_in, 'rebuy_amounts', to_jsonb(new.rebuy_amounts)));
  end if;
  if new.name is distinct from old.name then
    perform private.write_log(new.id, 'table_renamed', jsonb_build_object('old', old.name, 'new', new.name));
  end if;
  if new.rounding is distinct from old.rounding then
    perform private.write_log(new.id, 'rounding_changed', jsonb_build_object('old', old.rounding, 'new', new.rounding));
  end if;
  if new.chip_value is distinct from old.chip_value then
    perform private.write_log(new.id, 'chip_value_changed', jsonb_build_object('old', old.chip_value, 'new', new.chip_value));
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- The last "שולם ✓" closes the settling by itself; undoing a mark opens an
-- automatically closed one again (a manual close stays closed).
-- ---------------------------------------------------------------------------
create function private.settle_when_all_paid()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (new.paid_at is null) = (old.paid_at is null) then
    return null;
  end if;
  if not exists (select 1 from public.settlement_transfers t where t.table_id = new.table_id and t.paid_at is null) then
    update public.poker_tables set settled_at = now()
     where id = new.table_id and status = 'ended' and settled_at is null;
  else
    update public.poker_tables set settled_at = null
     where id = new.table_id and settled_at is not null and not settled_manually;
  end if;
  return null;
end;
$$;
revoke all on function private.settle_when_all_paid() from public, anon, authenticated;

create trigger settle_when_all_paid after update of paid_at on public.settlement_transfers
  for each row execute function private.settle_when_all_paid();

-- ---------------------------------------------------------------------------
-- Phones: as in 20261111110000_profile_phones.sql, but only while there is
-- still something to pay (the transfer is unpaid and the settling is open).
-- ---------------------------------------------------------------------------
create or replace function private.pays_by_transfer_to(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.settlement_transfers t
    join public.poker_tables pt on pt.id = t.table_id
    join public.table_players payer on payer.id = t.from_player
    join public.table_players receiver on receiver.id = t.to_player
    where pt.status = 'ended'
      and pt.settled_at is null
      and t.paid_at is null
      and payer.user_id = (select auth.uid())
      and receiver.user_id = p_user
      and t.amount > t.cash
  );
$$;
