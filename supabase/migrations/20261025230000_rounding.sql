-- "עיגול סכומים": each table's results are rounded to 1 / 5 / 10 / 50 ₪.
--
-- Existing tables get 1 (exactly how they were settled), so closed games and
-- their stats don't change; new tables default to 10. Only the manager changes
-- it (like the buy-in mode), it's locked once the game ended, and it's logged.

alter table public.poker_tables
  add column rounding smallint not null default 1
    constraint poker_tables_rounding check (rounding in (1, 5, 10, 50));
alter table public.poker_tables alter column rounding set default 10;

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
    new.ended_at := now();
  elsif old.status = 'ended' and new.status <> 'ended' then
    new.ended_at := null;
  elsif old.status = 'ended' and (
    new.initial_buy_in, new.rebuy_amounts, new.rounding, new.buy_in_mode, new.end_mode, new.invite_code, new.ended_at
  ) is distinct from (
    old.initial_buy_in, old.rebuy_amounts, old.rounding, old.buy_in_mode, old.end_mode, old.invite_code, old.ended_at
  ) then
    raise exception 'The game has ended; reopen it to make changes' using errcode = '42501';
  end if;
  return new;
end;
$$;

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
  return null;
end;
$$;
