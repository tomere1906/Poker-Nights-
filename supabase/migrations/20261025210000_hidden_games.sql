-- Hiding games from your own stats (e.g. test games).
--
-- hidden_games is a per-user list. A hidden game disappears from that user's
-- my_games and my_tablemates only: nothing is deleted, nothing changes for
-- anyone else. Each user reads, adds and removes only their own rows, and can
-- only hide tables they belong to. Rows are never updated (hide / unhide only).

create table public.hidden_games (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  table_id uuid not null references public.poker_tables (id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (user_id, table_id)
);
-- (user_id is covered by the primary key.)
create index hidden_games_table_id_idx on public.hidden_games (table_id);

alter table public.hidden_games enable row level security;

create policy "hidden: read your own list" on public.hidden_games
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "hidden: hide a table you belong to" on public.hidden_games
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_in_table(table_id));

create policy "hidden: unhide your own" on public.hidden_games
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.hidden_games from public, anon, authenticated;
grant select, insert, delete on public.hidden_games to authenticated;

-- ---------------------------------------------------------------------------
-- Stats views skip the viewer's hidden games (same columns as before).
-- ---------------------------------------------------------------------------
create or replace view public.my_games
with (security_invoker = true)
as
select
  t.id as table_id,
  t.name as table_name,
  t.ended_at,
  p.id as player_id,
  p.final_net,
  coalesce(b.total, 0) as buy_in_total,
  coalesce(b.count, 0) as buy_in_count,
  (select count(*)::integer from public.table_players o where o.table_id = t.id) as player_count
from public.table_players p
join public.poker_tables t on t.id = p.table_id
left join lateral (
  select sum(x.amount)::integer as total, count(*)::integer as count
  from public.buy_ins x
  where x.player_id = p.id
) b on true
where p.user_id = (select auth.uid())
  and t.status = 'ended'
  and p.final_net is not null
  and not exists (
    select 1 from public.hidden_games h
    where h.user_id = (select auth.uid()) and h.table_id = t.id
  );

create or replace view public.my_tablemates
with (security_invoker = true)
as
with mine as (
  select t.id as table_id
  from public.table_players p
  join public.poker_tables t on t.id = p.table_id
  where p.user_id = (select auth.uid())
    and t.status = 'ended'
    and not exists (
      select 1 from public.hidden_games h
      where h.user_id = (select auth.uid()) and h.table_id = t.id
    )
)
select
  coalesce(o.user_id::text, 'guest:' || lower(btrim(o.nickname))) as mate_key,
  o.user_id,
  o.user_id is null as is_guest,
  coalesce(min(pr.display_name), min(o.nickname)) as name,
  coalesce(min(pr.color), min(o.color)) as color,
  count(*)::integer as games,
  sum(o.final_net)::integer as total_net,
  max(t.ended_at) as last_played
from public.table_players o
join mine on mine.table_id = o.table_id
join public.poker_tables t on t.id = o.table_id
left join public.profiles pr on pr.id = o.user_id
where o.user_id is distinct from (select auth.uid())
  and o.final_net is not null
group by coalesce(o.user_id::text, 'guest:' || lower(btrim(o.nickname))), o.user_id;

-- ---------------------------------------------------------------------------
-- The "משחקים מוסתרים" screen: my hidden games, with what's needed to show them.
-- ---------------------------------------------------------------------------
create view public.my_hidden_games
with (security_invoker = true)
as
select
  h.table_id,
  t.name as table_name,
  t.status,
  t.ended_at,
  h.hidden_at,
  p.final_net
from public.hidden_games h
join public.poker_tables t on t.id = h.table_id
left join public.table_players p on p.table_id = t.id and p.user_id = h.user_id
where h.user_id = (select auth.uid());

revoke all on public.my_games, public.my_tablemates, public.my_hidden_games from public, anon, authenticated;
grant select on public.my_games, public.my_tablemates, public.my_hidden_games to authenticated;
