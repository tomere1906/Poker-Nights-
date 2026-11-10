-- Two settings from a real game:
--
-- "שווי צ'יפ" (poker_tables.chip_value): how many ₪ one chip is worth (default 1,
--   e.g. 0.5). Buy-ins stay in ₪; the app converts the chip counts typed at the
--   end to ₪, so final_value stays whole shekels. Managers and co-managers change
--   it (like the buy-in amounts), it's locked once the game ended, and logged.
--
-- "לא כאן" (table_players.absent): marked on the settlement screen. null = not
--   marked (the app treats a player who left mid-game as absent), true / false =
--   marked by hand. Cash is handed only to winners who are present. Written like
--   any seat field (managers and co-managers, not after the game ended), logged.
--   A member seating themselves can't set it.

alter table public.poker_tables
  add column chip_value numeric(7, 2) not null default 1
    constraint poker_tables_chip_value check (chip_value >= 0.01 and chip_value <= 1000);

alter table public.table_players
  add column absent boolean;

-- ---------------------------------------------------------------------------
-- Guard: as in 20261030160000_drop_sheep.sql, plus chip_value in the ended lock.
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
-- Log: as in 20261030160000_drop_sheep.sql, plus chip_value_changed.
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
-- Log: as in 20261025180000_exits_name_end_game.sql, plus presence_changed.
-- ---------------------------------------------------------------------------
create or replace function private.log_table_players()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  label text;
begin
  if tg_op = 'INSERT' then
    perform private.write_log(new.table_id, 'player_seated', jsonb_build_object(
      'player_id', new.id, 'name', private.player_label(new.id), 'seat', new.seat, 'guest', new.user_id is null));
    return null;
  end if;

  if tg_op = 'DELETE' then
    label := coalesce(old.nickname, (select display_name from public.profiles where id = old.user_id));
    perform private.write_log(old.table_id, 'player_removed', jsonb_build_object('player_id', old.id, 'name', label));
    return null;
  end if;

  label := private.player_label(new.id);
  if new.seat is distinct from old.seat then
    perform private.write_log(new.table_id, 'player_moved', jsonb_build_object(
      'player_id', new.id, 'name', label, 'from', old.seat, 'to', new.seat));
  end if;
  if new.nickname is distinct from old.nickname then
    perform private.write_log(new.table_id, 'player_renamed', jsonb_build_object(
      'player_id', new.id, 'name', label, 'old', old.nickname, 'new', new.nickname));
  end if;
  if new.color is distinct from old.color then
    perform private.write_log(new.table_id, 'player_recolored', jsonb_build_object(
      'player_id', new.id, 'name', label, 'old', old.color, 'new', new.color));
  end if;
  if (new.out_kind, new.out_chips) is distinct from (old.out_kind, old.out_chips) then
    if new.out_kind is null then
      perform private.write_log(new.table_id, 'player_back', jsonb_build_object('player_id', new.id, 'name', label));
    else
      perform private.write_log(new.table_id, 'player_out', jsonb_build_object(
        'player_id', new.id, 'name', label, 'kind', new.out_kind, 'chips', new.out_chips));
    end if;
  end if;
  if new.final_value is distinct from old.final_value then
    perform private.write_log(new.table_id, 'result_set', jsonb_build_object(
      'player_id', new.id, 'name', label, 'value', new.final_value));
  end if;
  if new.absent is distinct from old.absent and new.absent is not null then
    perform private.write_log(new.table_id, 'presence_changed', jsonb_build_object(
      'player_id', new.id, 'name', label, 'absent', new.absent));
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seats: as in 20261025180000_exits_name_end_game.sql; a member seating
-- themselves also can't set "לא כאן".
-- ---------------------------------------------------------------------------
drop policy "players: managers seat anyone in the table, members seat themselves" on public.table_players;

create policy "players: managers seat anyone in the table, members seat themselves" on public.table_players
  for insert to authenticated
  with check (
    private.table_not_ended(table_id)
    and (
      (
        private.can_manage_table(table_id)
        and (user_id is null or private.user_in_table(table_id, user_id))
      )
      or (
        -- Their own seat only, once (unique table_id+user_id), in a free seat
        -- (unique table_id+seat), with no overrides, exit, presence mark or results.
        user_id = (select auth.uid())
        and private.is_in_table(table_id)
        and nickname is null
        and color is null
        and out_kind is null
        and absent is null
        and final_value is null
        and final_net is null
      )
    )
  );
