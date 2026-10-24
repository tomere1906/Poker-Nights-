-- Poker Nights: profiles, shared tables, players, buy-ins.
--
-- The project does NOT expose new tables automatically and turns RLS on
-- automatically, so every table below gets explicit GRANTs (Data API roles)
-- AND explicit RLS policies. `anon` gets nothing: everything needs sign-in.
--
-- Roles in a table:
--   manager  = poker_tables.manager_id. The only one who writes game data.
--   member   = joined via the invite link (table_members). Read-only.
--   player   = a seat at the table (table_players): a user OR a guest by name.

-- ---------------------------------------------------------------------------
-- Private schema for helpers. Not exposed through the Data API, so these
-- SECURITY DEFINER functions can't be called from the outside.
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- What we keep from Google: display name + picture. The email stays only in
-- auth.users (never copied here, so other players can't read it).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.poker_tables (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- 122 random bits; part of the invite link.
  invite_code text not null unique default replace(gen_random_uuid()::text, '-', ''),
  status text not null default 'seating' check (status in ('seating', 'playing', 'ended')),
  initial_buy_in integer not null default 50 check (initial_buy_in > 0),
  rebuy_amounts integer[] not null default '{50,100,200}'
    check (cardinality(rebuy_amounts) between 2 and 4 and 0 < all (rebuy_amounts)),
  end_mode text not null default 'net' check (end_mode in ('net', 'chips')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

-- Users who opened the invite link: they can watch the table.
create table public.table_members (
  table_id uuid not null references public.poker_tables (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- The code used to join; checked by the insert policy.
  invite_code text not null,
  joined_at timestamptz not null default now(),
  primary key (table_id, user_id)
);

-- Seats. user_id null = guest (name only). Linking a guest to an account later
-- is just setting user_id on the row, so their history moves with them.
create table public.table_players (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.poker_tables (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 40),
  seat smallint not null check (seat between 0 and 8),
  color smallint not null default 0 check (color between 0 and 9),
  -- Entered at the end, in the table's end_mode (net or chips).
  final_value integer,
  -- Settled whole-shekel result, written when the game ends (used for stats).
  final_net integer,
  created_at timestamptz not null default now(),
  unique (table_id, user_id),
  unique (id, table_id)
);

create table public.buy_ins (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.poker_tables (id) on delete cascade,
  player_id uuid not null,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now(),
  -- A buy-in's player must sit at the same table.
  foreign key (player_id, table_id) references public.table_players (id, table_id) on delete cascade
);

-- Indexes for foreign keys and RLS lookups.
create index poker_tables_manager_id_idx on public.poker_tables (manager_id);
create index table_members_user_id_idx on public.table_members (user_id);
create index table_players_table_id_idx on public.table_players (table_id);
create index table_players_user_id_idx on public.table_players (user_id);
create index buy_ins_table_id_idx on public.buy_ins (table_id);
create index buy_ins_player_id_table_id_idx on public.buy_ins (player_id, table_id);

-- ---------------------------------------------------------------------------
-- Helpers used by the policies (SECURITY DEFINER to avoid policy recursion).
-- ---------------------------------------------------------------------------

create function private.is_table_manager(p_table uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.poker_tables t
    where t.id = p_table and t.manager_id = (select auth.uid())
  );
$$;

-- Manager or member of the table.
create function private.is_in_table(p_table uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_table_manager(p_table)
      or exists (
        select 1 from public.table_members m
        where m.table_id = p_table and m.user_id = (select auth.uid())
      );
$$;

-- Is p_user the manager or a member of p_table? (Who may be seated as a player.)
create function private.user_in_table(p_table uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.poker_tables t where t.id = p_table and t.manager_id = p_user)
      or exists (select 1 from public.table_members m where m.table_id = p_table and m.user_id = p_user);
$$;

-- A valid invite: the code matches and the game hasn't ended.
create function private.invite_is_valid(p_table uuid, p_code text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.poker_tables t
    where t.id = p_table and t.invite_code = p_code and t.status <> 'ended'
  );
$$;

-- Do the current user and p_user share at least one table?
create function private.shares_table_with(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  with mine as (
    select t.id from public.poker_tables t where t.manager_id = (select auth.uid())
    union
    select m.table_id from public.table_members m where m.user_id = (select auth.uid())
  ), theirs as (
    select t.id from public.poker_tables t where t.manager_id = p_user
    union
    select m.table_id from public.table_members m where m.user_id = p_user
  )
  select exists (select 1 from mine join theirs using (id));
$$;

revoke all on function private.is_table_manager(uuid) from public;
revoke all on function private.is_in_table(uuid) from public;
revoke all on function private.user_in_table(uuid, uuid) from public;
revoke all on function private.invite_is_valid(uuid, text) from public;
revoke all on function private.shares_table_with(uuid) from public;
grant execute on function private.is_table_manager(uuid) to authenticated;
grant execute on function private.is_in_table(uuid) to authenticated;
grant execute on function private.user_in_table(uuid, uuid) to authenticated;
grant execute on function private.invite_is_valid(uuid, text) to authenticated;
grant execute on function private.shares_table_with(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Profiles are created/updated from the Google sign-in data.
-- ---------------------------------------------------------------------------
create function private.sync_profile()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do update
    set display_name = excluded.display_name,
        avatar_url = excluded.avatar_url;
  return new;
end;
$$;

revoke all on function private.sync_profile() from public, anon, authenticated;
-- Supabase Auth inserts/updates auth.users as supabase_auth_admin.
grant usage on schema private to supabase_auth_admin;
grant execute on function private.sync_profile() to supabase_auth_admin;

create trigger on_auth_user_saved
  after insert or update of raw_user_meta_data on auth.users
  for each row execute function private.sync_profile();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.poker_tables enable row level security;
alter table public.table_members enable row level security;
alter table public.table_players enable row level security;
alter table public.buy_ins enable row level security;

-- profiles: yourself, and people you share a table with. Written only by the trigger.
create policy "profiles: read self and tablemates" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_table_with(id));

-- poker_tables
create policy "tables: manager and members read" on public.poker_tables
  for select to authenticated
  using (manager_id = (select auth.uid()) or private.is_in_table(id));

create policy "tables: anyone signed in opens a table as its manager" on public.poker_tables
  for insert to authenticated
  with check (manager_id = (select auth.uid()));

create policy "tables: manager updates" on public.poker_tables
  for update to authenticated
  using (manager_id = (select auth.uid()))
  with check (manager_id = (select auth.uid()));

create policy "tables: manager deletes" on public.poker_tables
  for delete to authenticated
  using (manager_id = (select auth.uid()));

-- table_members
create policy "members: people in the table read" on public.table_members
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_in_table(table_id));

create policy "members: join yourself with a valid invite" on public.table_members
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.invite_is_valid(table_id, invite_code));

create policy "members: manager removes" on public.table_members
  for delete to authenticated
  using (private.is_table_manager(table_id));

-- table_players
create policy "players: people in the table read" on public.table_players
  for select to authenticated
  using (private.is_in_table(table_id));

create policy "players: manager seats guests or people in the table" on public.table_players
  for insert to authenticated
  with check (
    private.is_table_manager(table_id)
    and (user_id is null or private.user_in_table(table_id, user_id))
  );

create policy "players: manager updates" on public.table_players
  for update to authenticated
  using (private.is_table_manager(table_id))
  with check (
    private.is_table_manager(table_id)
    and (user_id is null or private.user_in_table(table_id, user_id))
  );

create policy "players: manager removes" on public.table_players
  for delete to authenticated
  using (private.is_table_manager(table_id));

-- buy_ins
create policy "buy-ins: people in the table read" on public.buy_ins
  for select to authenticated
  using (private.is_in_table(table_id));

create policy "buy-ins: manager adds" on public.buy_ins
  for insert to authenticated
  with check (private.is_table_manager(table_id));

create policy "buy-ins: manager updates" on public.buy_ins
  for update to authenticated
  using (private.is_table_manager(table_id))
  with check (private.is_table_manager(table_id));

create policy "buy-ins: manager removes" on public.buy_ins
  for delete to authenticated
  using (private.is_table_manager(table_id));

-- ---------------------------------------------------------------------------
-- Grants for the Data API roles (nothing is exposed automatically).
-- RLS above decides which rows; these decide which operations exist at all.
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.poker_tables, public.table_members, public.table_players, public.buy_ins
  from anon, authenticated;

grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.poker_tables to authenticated;
grant select, insert, delete on public.table_members to authenticated;
grant select, insert, update, delete on public.table_players to authenticated;
grant select, insert, update, delete on public.buy_ins to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: players see the manager's changes live (RLS applies to reads).
-- ---------------------------------------------------------------------------
alter publication supabase_realtime
  add table public.poker_tables, public.table_members, public.table_players, public.buy_ins;
