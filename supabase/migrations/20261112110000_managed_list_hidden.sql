-- "משחקים שניהלתי" (stats screen): "הסר מהרשימה" hides a game from that
-- user's own list of games they managed. Nothing else changes: the game, its
-- results and everyone's stats stay. (Deleting the whole game is the existing
-- "tables: manager deletes" policy: the original manager only.)
--
-- Each user reads, adds and removes only their own rows, and only for a table
-- they manage or co-manage. Rows are never updated.

create table public.managed_list_hidden (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  table_id uuid not null references public.poker_tables (id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (user_id, table_id)
);
-- (user_id is covered by the primary key.)
create index managed_list_hidden_table_id_idx on public.managed_list_hidden (table_id);

alter table public.managed_list_hidden enable row level security;

create policy "managed list: read your own" on public.managed_list_hidden
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "managed list: hide a table you manage" on public.managed_list_hidden
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_manage_table(table_id));

create policy "managed list: show it again" on public.managed_list_hidden
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.managed_list_hidden from public, anon, authenticated;
grant select, insert, delete on public.managed_list_hidden to authenticated;
