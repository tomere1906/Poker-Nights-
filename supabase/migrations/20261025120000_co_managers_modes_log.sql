-- Co-managers, the buy-in edit mode, and a per-table change log.
--
-- Who may do what inside a table:
--   manager (poker_tables.manager_id) — everything, and is the ONLY one who can
--       appoint/remove co-managers, end the game, change the buy-in mode,
--       change the invite code, and delete the table.
--   co-manager (table_members.is_co_manager) — everything else the manager does:
--       buy-ins, seating, per-table names/colors, results, starting the game, amounts.
--   player — read-only, except in buy_in_mode 'self_add': may ADD buy-ins for
--       their own seat (never change/delete, never for anyone else).
--
-- table_log is written only by triggers (no write grants at all), so nobody can
-- forge, edit or delete history. Everyone in the table can read it.

-- ---------------------------------------------------------------------------
-- New columns
-- ---------------------------------------------------------------------------
alter table public.poker_tables
  add column buy_in_mode text not null default 'managers' check (buy_in_mode in ('managers', 'self_add'));

alter table public.table_members
  add column is_co_manager boolean not null default false;

-- Who recorded each buy-in (can't be spoofed: the insert policy pins it to auth.uid()).
alter table public.buy_ins
  add column created_by uuid default auth.uid() references public.profiles (id) on delete set null;
create index buy_ins_created_by_idx on public.buy_ins (created_by);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Manager or co-manager of the table.
create function private.can_manage_table(p_table uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_table_manager(p_table)
      or exists (
        select 1 from public.table_members m
        where m.table_id = p_table and m.user_id = (select auth.uid()) and m.is_co_manager
      );
$$;

-- 'self_add' mode: the current user may add a buy-in for THEIR OWN seat while the game is on.
create function private.can_self_add_buy_in(p_table uuid, p_player uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.poker_tables t
    join public.table_players p on p.table_id = t.id
    where t.id = p_table
      and t.buy_in_mode = 'self_add'
      and t.status <> 'ended'
      and p.id = p_player
      and p.user_id = (select auth.uid())
  );
$$;

revoke all on function private.can_manage_table(uuid) from public;
revoke all on function private.can_self_add_buy_in(uuid, uuid) from public;
grant execute on function private.can_manage_table(uuid) to authenticated;
grant execute on function private.can_self_add_buy_in(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- poker_tables: co-managers may update, but some changes are manager-only
-- ---------------------------------------------------------------------------
drop policy "tables: manager updates" on public.poker_tables;

create policy "tables: managers and co-managers update" on public.poker_tables
  for update to authenticated
  using (private.can_manage_table(id))
  with check (private.can_manage_table(id));

-- RLS can't compare old and new values, so a trigger guards the manager-only changes.
create function private.guard_table_update()
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
  end if;
  return new;
end;
$$;

create trigger guard_table_update
  before update on public.poker_tables
  for each row execute function private.guard_table_update();

-- ---------------------------------------------------------------------------
-- table_members: only the manager appoints/removes co-managers
-- ---------------------------------------------------------------------------
grant update (is_co_manager) on public.table_members to authenticated;

create policy "members: manager appoints co-managers" on public.table_members
  for update to authenticated
  using (private.is_table_manager(table_id))
  with check (private.is_table_manager(table_id));

-- Joining always starts as a plain member.
drop policy "members: join yourself with a valid invite" on public.table_members;
create policy "members: join yourself with a valid invite" on public.table_members
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not is_co_manager
    and private.invite_is_valid(table_id, invite_code)
  );

-- Managers and co-managers may remove plain members; only the manager removes a co-manager.
drop policy "members: manager removes" on public.table_members;
create policy "members: managers remove members" on public.table_members
  for delete to authenticated
  using (
    private.is_table_manager(table_id)
    or (private.can_manage_table(table_id) and not is_co_manager)
  );

-- ---------------------------------------------------------------------------
-- table_players: managers and co-managers
-- ---------------------------------------------------------------------------
drop policy "players: manager seats guests or people in the table" on public.table_players;
drop policy "players: manager updates" on public.table_players;
drop policy "players: manager removes" on public.table_players;

create policy "players: managers seat guests or people in the table" on public.table_players
  for insert to authenticated
  with check (
    private.can_manage_table(table_id)
    and (user_id is null or private.user_in_table(table_id, user_id))
  );

create policy "players: managers update" on public.table_players
  for update to authenticated
  using (private.can_manage_table(table_id))
  with check (
    private.can_manage_table(table_id)
    and (user_id is null or private.user_in_table(table_id, user_id))
  );

create policy "players: managers remove" on public.table_players
  for delete to authenticated
  using (private.can_manage_table(table_id));

-- ---------------------------------------------------------------------------
-- buy_ins: managers and co-managers; players add their own in 'self_add' mode
-- ---------------------------------------------------------------------------
drop policy "buy-ins: manager adds" on public.buy_ins;
drop policy "buy-ins: manager updates" on public.buy_ins;
drop policy "buy-ins: manager removes" on public.buy_ins;

create policy "buy-ins: managers add, players add their own in self-add mode" on public.buy_ins
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      private.can_manage_table(table_id)
      or private.can_self_add_buy_in(table_id, player_id)
    )
  );

create policy "buy-ins: managers update" on public.buy_ins
  for update to authenticated
  using (private.can_manage_table(table_id))
  with check (private.can_manage_table(table_id));

create policy "buy-ins: managers remove" on public.buy_ins
  for delete to authenticated
  using (private.can_manage_table(table_id));

-- ---------------------------------------------------------------------------
-- Change log
-- ---------------------------------------------------------------------------
create table public.table_log (
  id bigint generated always as identity primary key,
  table_id uuid not null references public.poker_tables (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index table_log_table_id_created_at_idx on public.table_log (table_id, created_at);
create index table_log_actor_id_idx on public.table_log (actor_id);

alter table public.table_log enable row level security;

create policy "log: people in the table read" on public.table_log
  for select to authenticated
  using (private.is_in_table(table_id));

revoke all on public.table_log from anon, authenticated;
grant select on public.table_log to authenticated;

-- Shown name of a seat right now (per-table nickname, else profile name).
create function private.player_label(p_player uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(p.nickname, pr.display_name)
  from public.table_players p
  left join public.profiles pr on pr.id = p.user_id
  where p.id = p_player;
$$;
revoke all on function private.player_label(uuid) from public;

-- Writes one log row, unless the table itself is being deleted.
create function private.write_log(p_table uuid, p_action text, p_details jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.poker_tables where id = p_table) then
    insert into public.table_log (table_id, actor_id, action, details)
    values (p_table, (select auth.uid()), p_action, p_details);
  end if;
end;
$$;
revoke all on function private.write_log(uuid, text, jsonb) from public;

create function private.log_buy_ins()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.write_log(new.table_id, 'buy_in_added', jsonb_build_object(
      'player_id', new.player_id, 'name', private.player_label(new.player_id), 'amount', new.amount,
      'self', exists (select 1 from public.table_players p where p.id = new.player_id and p.user_id = new.created_by)));
  elsif tg_op = 'UPDATE' and new.amount is distinct from old.amount then
    perform private.write_log(new.table_id, 'buy_in_changed', jsonb_build_object(
      'player_id', new.player_id, 'name', private.player_label(new.player_id),
      'old_amount', old.amount, 'amount', new.amount));
  elsif tg_op = 'DELETE' then
    -- Skip when the whole seat is being removed (logged once as player_removed).
    if exists (select 1 from public.table_players p where p.id = old.player_id) then
      perform private.write_log(old.table_id, 'buy_in_removed', jsonb_build_object(
        'player_id', old.player_id, 'name', private.player_label(old.player_id), 'amount', old.amount));
    end if;
  end if;
  return null;
end;
$$;

create function private.log_table_players()
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
  if new.final_value is distinct from old.final_value then
    perform private.write_log(new.table_id, 'result_set', jsonb_build_object(
      'player_id', new.id, 'name', label, 'value', new.final_value));
  end if;
  return null;
end;
$$;

create function private.log_table_members()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  label text;
begin
  label := (select display_name from public.profiles where id = coalesce(new.user_id, old.user_id));
  if tg_op = 'INSERT' then
    perform private.write_log(new.table_id, 'member_joined', jsonb_build_object('user_id', new.user_id, 'name', label));
  elsif tg_op = 'UPDATE' and new.is_co_manager is distinct from old.is_co_manager then
    perform private.write_log(new.table_id,
      case when new.is_co_manager then 'co_manager_added' else 'co_manager_removed' end,
      jsonb_build_object('user_id', new.user_id, 'name', label));
  elsif tg_op = 'DELETE' then
    perform private.write_log(old.table_id, 'member_removed', jsonb_build_object('user_id', old.user_id, 'name', label));
  end if;
  return null;
end;
$$;

create function private.log_poker_tables()
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
  return null;
end;
$$;

revoke all on function private.log_buy_ins() from public, anon, authenticated;
revoke all on function private.log_table_players() from public, anon, authenticated;
revoke all on function private.log_table_members() from public, anon, authenticated;
revoke all on function private.log_poker_tables() from public, anon, authenticated;
revoke all on function private.guard_table_update() from public, anon, authenticated;

create trigger log_buy_ins after insert or update or delete on public.buy_ins
  for each row execute function private.log_buy_ins();
create trigger log_table_players after insert or update or delete on public.table_players
  for each row execute function private.log_table_players();
create trigger log_table_members after insert or update or delete on public.table_members
  for each row execute function private.log_table_members();
create trigger log_poker_tables after update on public.poker_tables
  for each row execute function private.log_poker_tables();

-- Live log for everyone at the table.
alter publication supabase_realtime add table public.table_log;
