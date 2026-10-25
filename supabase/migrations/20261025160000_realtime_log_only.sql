-- Live tables: the app subscribes only to new table_log rows (every change at a
-- table writes one, in the same transaction) and then reloads through the
-- normal RLS reads. So only table_log needs to be in the Realtime publication.
--
-- Removing the other tables also closes a small leak: Realtime can't apply RLS
-- to DELETE events, so anyone subscribed to them would get the ids of rows
-- deleted at any table. table_log rows are never deleted on their own (only
-- with their table).
alter publication supabase_realtime
  drop table public.poker_tables, public.table_members, public.table_players, public.buy_ins;
