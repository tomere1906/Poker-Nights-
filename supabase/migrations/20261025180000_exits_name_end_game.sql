-- Players leaving mid-game, table names, and ending the game online.
--
-- Exits: a manager/co-manager marks a seat as out with how it left:
--   lost_all ("הפסיד הכל", 0 chips) · even ("מאוזן", what they put in) · amount ("יצא עם סכום").
--   The seat stays; out_chips prefills the end-game screen. Bringing the
--   player back clears both. A player who is out gets no buy-ins until back.
--
-- Results: final_value = the chips a player left with (whole shekels), however
--   the results were typed in (end_mode is only the input style). final_net =
--   the settled whole-shekel result, written when the game ends (stats).
--
-- Ending: public.end_game writes every final_net and ends the table in one
--   transaction. Only the manager may end it, and only when every player has a
--   result and they add up to exactly 0. An ended table is locked: no buy-ins,
--   seats or results change until the manager reopens it (only its name may change).

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.poker_tables
  add column name text constraint poker_tables_name_length check (name is null or length(btrim(name)) between 1 and 30);

alter table public.table_players
  add column out_kind text constraint table_players_out_kind check (out_kind in ('lost_all', 'even', 'amount')),
  add column out_chips integer constraint table_players_out_chips check (out_chips >= 0),
  add constraint table_players_out_complete check ((out_kind is null) = (out_chips is null)),
  add constraint table_players_out_lost_all check (out_kind is distinct from 'lost_all' or out_chips = 0);

comment on column public.table_players.final_value is
  'Chips the player left with (whole shekels). end_mode is only how results are typed in.';
comment on column public.table_players.final_net is
  'Settled whole-shekel result, written by public.end_game. Used for stats.';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Every player has a final_net and together they add up to 0.
create function private.results_balanced(p_table uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(bool_and(p.final_net is not null), true) and coalesce(sum(p.final_net), 0) = 0
  from public.table_players p
  where p.table_id = p_table;
$$;
revoke all on function private.results_balanced(uuid) from public;
grant execute on function private.results_balanced(uuid) to authenticated;

-- A buy-in may be added for this seat: the game isn't over and the player isn't out.
create function private.player_can_buy_in(p_table uuid, p_player uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.table_players p
    join public.poker_tables t on t.id = p.table_id
    where p.id = p_player and p.table_id = p_table and p.out_kind is null and t.status <> 'ended'
  );
$$;
revoke all on function private.player_can_buy_in(uuid, uuid) from public;
grant execute on function private.player_can_buy_in(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- poker_tables guard: manager-only changes, ending rules, ended = locked
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
  end if;

  if new.status = 'ended' and old.status <> 'ended' then
    if not private.results_balanced(new.id) then
      raise exception 'Every player needs a final result, and the results must add up to 0' using errcode = '23514';
    end if;
    new.ended_at := now();
  elsif old.status = 'ended' and new.status <> 'ended' then
    new.ended_at := null;
  elsif old.status = 'ended' and (
    new.initial_buy_in, new.rebuy_amounts, new.buy_in_mode, new.end_mode, new.invite_code, new.ended_at
  ) is distinct from (
    old.initial_buy_in, old.rebuy_amounts, old.buy_in_mode, old.end_mode, old.invite_code, old.ended_at
  ) then
    raise exception 'The game has ended; reopen it to make changes' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- End the game: all final_net values + status, atomically.
-- SECURITY INVOKER: RLS and the guard above decide (only the manager, only balanced).
-- p_nets: {"<player id>": <whole shekels>, ...}
-- ---------------------------------------------------------------------------
create function public.end_game(p_table uuid, p_nets jsonb)
returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.table_players p
     set final_net = (p_nets ->> p.id::text)::integer
   where p.table_id = p_table;
  update public.poker_tables set status = 'ended' where id = p_table;
  if not found then
    raise exception 'Table not found' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.end_game(uuid, jsonb) from public, anon;
grant execute on function public.end_game(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Seats: managers write only while the game isn't over
-- ---------------------------------------------------------------------------
drop policy "players: managers seat anyone in the table, members seat themselves" on public.table_players;
drop policy "players: managers update" on public.table_players;
drop policy "players: managers remove" on public.table_players;

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
        -- (unique table_id+seat), with no overrides, exit or results.
        user_id = (select auth.uid())
        and private.is_in_table(table_id)
        and nickname is null
        and color is null
        and out_kind is null
        and final_value is null
        and final_net is null
      )
    )
  );

create policy "players: managers update" on public.table_players
  for update to authenticated
  using (private.can_manage_table(table_id) and private.table_not_ended(table_id))
  with check (
    private.can_manage_table(table_id)
    and private.table_not_ended(table_id)
    and (user_id is null or private.user_in_table(table_id, user_id))
  );

create policy "players: managers remove" on public.table_players
  for delete to authenticated
  using (private.can_manage_table(table_id) and private.table_not_ended(table_id));

-- ---------------------------------------------------------------------------
-- Buy-ins: none for a player who is out, none after the game ended
-- ---------------------------------------------------------------------------
drop policy "buy-ins: managers add, players add their own in self-add mode" on public.buy_ins;
drop policy "buy-ins: managers update" on public.buy_ins;
drop policy "buy-ins: managers remove" on public.buy_ins;

create policy "buy-ins: managers add, players add their own in self-add mode" on public.buy_ins
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.player_can_buy_in(table_id, player_id)
    and (
      private.can_manage_table(table_id)
      or private.can_self_add_buy_in(table_id, player_id)
    )
  );

create policy "buy-ins: managers update" on public.buy_ins
  for update to authenticated
  using (private.can_manage_table(table_id) and private.table_not_ended(table_id))
  with check (private.can_manage_table(table_id) and private.table_not_ended(table_id));

create policy "buy-ins: managers remove" on public.buy_ins
  for delete to authenticated
  using (private.can_manage_table(table_id) and private.table_not_ended(table_id));

-- ---------------------------------------------------------------------------
-- Change log: exits/returns and table renames
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
  return null;
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
  return null;
end;
$$;
