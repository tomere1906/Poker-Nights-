-- Stats: "my games" and "החבר'ה שלי".
--
-- Two read-only views, both SECURITY INVOKER: they run with the viewer's own
-- rights, so the existing RLS decides what they can see (only tables they're
-- in). Nothing here uses elevated privileges.
--
-- What counts:
--   * only closed online games (status 'ended'); a reopened game drops out
--     until it's closed again (final_net stays, but status isn't 'ended');
--   * only games the viewer actually played in (has a seat). Watching a
--     table as a member, or managing it without a seat, doesn't count;
--   * both views are about the viewer only (auth.uid()), so nobody can ask
--     for someone else's stats.

-- ---------------------------------------------------------------------------
-- My closed games, one row each.
-- ---------------------------------------------------------------------------
create view public.my_games
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
  and p.final_net is not null;

-- ---------------------------------------------------------------------------
-- Everyone I played with, counted only over my closed games.
-- Accounts are grouped by user_id (shown with their profile name, so renames
-- never split history); guests are grouped by their name.
-- ---------------------------------------------------------------------------
create view public.my_tablemates
with (security_invoker = true)
as
with mine as (
  select t.id as table_id
  from public.table_players p
  join public.poker_tables t on t.id = p.table_id
  where p.user_id = (select auth.uid()) and t.status = 'ended'
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

-- Signed-in users may read; nobody writes; anon gets nothing.
revoke all on public.my_games, public.my_tablemates from public, anon, authenticated;
grant select on public.my_games, public.my_tablemates to authenticated;
