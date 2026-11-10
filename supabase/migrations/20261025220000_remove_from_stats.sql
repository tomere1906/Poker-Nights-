-- "מחק" in the stats: remove a game from YOUR OWN stats for good.
--
-- It's a hidden_games row marked permanent: like hiding, but it can't be
-- brought back and doesn't show in the hidden list. It never deletes the game
-- itself and never changes anything for other players (only the table's
-- manager deletes a whole table, as before, in table management).

alter table public.hidden_games add column permanent boolean not null default false;

-- Unhiding works only for rows that aren't permanent.
drop policy "hidden: unhide your own" on public.hidden_games;
create policy "hidden: unhide your own (unless removed for good)" on public.hidden_games
  for delete to authenticated
  using (user_id = (select auth.uid()) and not permanent);

-- A hidden game can be turned into a permanent removal; never the other way.
-- Only this column may change (column-level grant).
grant update (permanent) on public.hidden_games to authenticated;
create policy "hidden: remove a hidden game for good" on public.hidden_games
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and permanent);

-- The "משחקים מוסתרים" screen shows only games that can still come back.
-- (my_games and my_tablemates already skip every hidden_games row.)
create or replace view public.my_hidden_games
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
where h.user_id = (select auth.uid())
  and not h.permanent;
