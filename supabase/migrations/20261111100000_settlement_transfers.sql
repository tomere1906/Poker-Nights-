-- Who pays whom, stored when the game is closed, and "שולם ✓" marks.
--
-- Until now every phone recomputed the settlement from the stored results. Now
-- public.end_game (a new 3-argument version) also stores the transfers the
-- manager saw ("מי מעביר למי"), in the same transaction that ends the table.
-- The database checks they match the results, so they can't be made up:
--   - for every player: what they receive − what they pay = their final_net;
--   - a bank transfer (the part of a row that isn't cash) goes only to a
--     winner, and never more than their win;
--   - nobody pays more cash than was recorded for them (cash_payments).
-- (A player who carries cash for an absent winner receives it as cash and
-- passes it on, so that still adds up.)
-- These rows are what the phone number for Bit depends on (next migration):
-- you see someone's number only if you have to transfer money to them.
--
-- "שולם ✓": the payer, the receiver, the manager or a co-manager may mark a row
-- as paid (and undo it), only on a closed table. Only paid_at can be written;
-- the database sets the time and who marked it. Every change is logged.
-- Reopening the table for corrections deletes the stored transfers (and the
-- marks): closing it again stores the new ones.
--
-- The old 2-argument public.end_game stays, so the version of the app that is
-- live right now keeps working; it stores no transfers.

create table public.settlement_transfers (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.poker_tables (id) on delete cascade,
  position smallint not null constraint settlement_transfers_position check (position >= 0),
  from_player uuid not null,
  to_player uuid not null,
  amount integer not null constraint settlement_transfers_amount check (amount between 1 and 10000000),
  -- The part of the amount paid in cash (0 = all by transfer).
  cash integer not null default 0,
  paid_at timestamptz,
  paid_by uuid references public.profiles (id) on delete set null,
  constraint settlement_transfers_two_people check (from_player <> to_player),
  constraint settlement_transfers_cash check (cash between 0 and amount),
  constraint settlement_transfers_position_unique unique (table_id, position),
  -- Both seats must be at the same table (and go away with the seat).
  foreign key (from_player, table_id) references public.table_players (id, table_id) on delete cascade,
  foreign key (to_player, table_id) references public.table_players (id, table_id) on delete cascade
);

create index settlement_transfers_from_idx on public.settlement_transfers (from_player, table_id);
create index settlement_transfers_to_idx on public.settlement_transfers (to_player, table_id);
create index settlement_transfers_paid_by_idx on public.settlement_transfers (paid_by);

alter table public.settlement_transfers enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The stored transfers match the results (see the top of this file).
-- No transfers at all is valid too (tables closed by the old end_game).
create function private.transfers_valid(p_table uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  with flows as (
    select
      p.final_net,
      coalesce((select sum(t.amount) from public.settlement_transfers t where t.to_player = p.id), 0) as received,
      coalesce((select sum(t.amount) from public.settlement_transfers t where t.from_player = p.id), 0) as paid,
      coalesce((select sum(t.amount - t.cash) from public.settlement_transfers t where t.to_player = p.id), 0) as received_by_transfer,
      coalesce((select sum(t.cash) from public.settlement_transfers t where t.from_player = p.id), 0) as paid_in_cash,
      coalesce((select sum(c.amount) from public.cash_payments c where c.payer_id = p.id), 0) as cash_recorded
    from public.table_players p
    where p.table_id = p_table
  )
  select not exists (select 1 from public.settlement_transfers t where t.table_id = p_table)
      or coalesce(bool_and(
           received - paid = coalesce(final_net, 0)
           and received_by_transfer <= greatest(coalesce(final_net, 0), 0)
           and paid_in_cash <= cash_recorded
         ), true)
  from flows;
$$;
revoke all on function private.transfers_valid(uuid) from public;
grant execute on function private.transfers_valid(uuid) to authenticated;

-- The signed-in user sits in one of the two seats of this transfer.
create function private.is_transfer_party(p_from uuid, p_to uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.table_players p
    where p.id in (p_from, p_to) and p.user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_transfer_party(uuid, uuid) from public;
grant execute on function private.is_transfer_party(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Policies + grants
-- ---------------------------------------------------------------------------
create policy "transfers: people in the table read" on public.settlement_transfers
  for select to authenticated
  using (private.is_in_table(table_id));

-- Written by public.end_game (as the manager), just before the table ends.
create policy "transfers: the manager stores them while closing" on public.settlement_transfers
  for insert to authenticated
  with check (private.is_table_manager(table_id) and private.table_not_ended(table_id));

create policy "transfers: the manager clears them while closing" on public.settlement_transfers
  for delete to authenticated
  using (private.is_table_manager(table_id) and private.table_not_ended(table_id));

-- "שולם ✓": payer, receiver, manager or co-manager, only on a closed table.
create policy "transfers: payer, receiver or managers mark paid" on public.settlement_transfers
  for update to authenticated
  using (
    not private.table_not_ended(table_id)
    and (private.can_manage_table(table_id) or private.is_transfer_party(from_player, to_player))
  )
  with check (
    not private.table_not_ended(table_id)
    and (private.can_manage_table(table_id) or private.is_transfer_party(from_player, to_player))
  );

revoke all on public.settlement_transfers from public, anon, authenticated;
grant select, delete on public.settlement_transfers to authenticated;
grant insert (table_id, position, from_player, to_player, amount, cash) on public.settlement_transfers to authenticated;
grant update (paid_at) on public.settlement_transfers to authenticated;

-- ---------------------------------------------------------------------------
-- "שולם ✓": the database sets the time and who marked it.
-- ---------------------------------------------------------------------------
create function private.stamp_transfer_paid()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (new.paid_at is null) = (old.paid_at is null) then
    -- No change of status: keep the original mark.
    new.paid_at := old.paid_at;
    new.paid_by := old.paid_by;
  elsif new.paid_at is null then
    new.paid_by := null;
  else
    new.paid_at := now();
    new.paid_by := (select auth.uid());
  end if;
  return new;
end;
$$;
revoke all on function private.stamp_transfer_paid() from public, anon, authenticated;

create trigger stamp_transfer_paid before update on public.settlement_transfers
  for each row execute function private.stamp_transfer_paid();

create function private.log_settlement_transfers()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (new.paid_at is null) <> (old.paid_at is null) then
    perform private.write_log(new.table_id,
      case when new.paid_at is null then 'transfer_unpaid' else 'transfer_paid' end,
      jsonb_build_object(
        'from_id', new.from_player, 'name', private.player_label(new.from_player),
        'to_id', new.to_player, 'to', private.player_label(new.to_player),
        'amount', new.amount));
  end if;
  return null;
end;
$$;
revoke all on function private.log_settlement_transfers() from public, anon, authenticated;

create trigger log_settlement_transfers after update on public.settlement_transfers
  for each row execute function private.log_settlement_transfers();

-- Reopening for corrections clears the stored transfers (closing again stores new ones).
create function private.clear_transfers_on_reopen()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.status = 'ended' and new.status <> 'ended' then
    delete from public.settlement_transfers where table_id = new.id;
  end if;
  return null;
end;
$$;
revoke all on function private.clear_transfers_on_reopen() from public, anon, authenticated;

create trigger clear_transfers_on_reopen after update of status on public.poker_tables
  for each row execute function private.clear_transfers_on_reopen();

-- ---------------------------------------------------------------------------
-- Guard: as in 20261110100000_chip_value_absent.sql, plus: ending needs the
-- stored transfers (if any) to match the results.
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
  end if;

  if new.status = 'ended' and old.status <> 'ended' then
    if not private.results_balanced(new.id) then
      raise exception 'Every player needs a final result, and the results must add up to 0' using errcode = '23514';
    end if;
    if not private.transfers_valid(new.id) then
      raise exception 'The transfers don''t match the results' using errcode = '23514';
    end if;
    new.ended_at := now();
  elsif old.status = 'ended' and new.status <> 'ended' then
    new.ended_at := null;
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
-- End the game: final_net values + the transfers + status, atomically.
-- SECURITY INVOKER: RLS and the guard decide (only the manager, only balanced,
-- transfers must match).
-- p_nets: {"<player id>": <whole shekels>, ...}
-- p_transfers: [{"from": "<player id>", "to": "<player id>", "amount": 150, "cash": 0}, ...] in display order
-- ---------------------------------------------------------------------------
create function public.end_game(p_table uuid, p_nets jsonb, p_transfers jsonb)
returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  delete from public.settlement_transfers where table_id = p_table;
  update public.table_players p
     set final_net = (p_nets ->> p.id::text)::integer
   where p.table_id = p_table;
  insert into public.settlement_transfers (table_id, position, from_player, to_player, amount, cash)
  select p_table, (x.ord - 1)::smallint, (x.v ->> 'from')::uuid, (x.v ->> 'to')::uuid,
         (x.v ->> 'amount')::integer, coalesce((x.v ->> 'cash')::integer, 0)
  from jsonb_array_elements(coalesce(p_transfers, '[]'::jsonb)) with ordinality as x(v, ord);
  update public.poker_tables set status = 'ended' where id = p_table;
  if not found then
    raise exception 'Table not found' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.end_game(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.end_game(uuid, jsonb, jsonb) to authenticated;
