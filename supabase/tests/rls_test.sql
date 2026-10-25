-- Security tests: try to break the RLS rules.
--
-- Run in the Supabase SQL Editor AFTER the migrations. Everything happens in
-- one DO block that ends by raising an error ON PURPOSE, which rolls back
-- every row it created (test users, tables, buy-ins). The error message IS
-- the report: "ALL n TESTS PASSED" or the list of failures.
--
-- Users:  M = manager of T1 and T3 · P = player in T1, T2, T3 · S = stranger · Q = manager of T2
--         C = co-manager candidate in T3 (co-managers, buy-in modes and the change log run on T3)
--         T4: invites, members picking their own seat, unique seats, swap_seats, 12 colors
-- Each case runs as a real Data API role (authenticated/anon) with that user's JWT.
-- 'postgres' cases simulate the system itself (e.g. Supabase Auth updating auth.users).
--
-- Expectations:
--   ok          must succeed
--   deny        must be blocked by permissions/RLS (SQLSTATE 42501)
--   rows:N      UPDATE/DELETE must affect exactly N rows (0 = silently filtered by RLS)
--   count:N     SELECT count(*) must return N
--   error:CODE  must fail with that SQLSTATE (e.g. 23503 foreign key)

do $test$
declare
  m constant uuid := '11111111-1111-4111-8111-111111111111';
  p constant uuid := '22222222-2222-4222-8222-222222222222';
  s constant uuid := '33333333-3333-4333-8333-333333333333';
  q constant uuid := '44444444-4444-4444-8444-444444444444';
  cm constant uuid := '55555555-5555-4555-8555-555555555555';
  c record;
  n bigint;
  ok boolean;
  detail text;
  total int := 0;
  failed int := 0;
  report text := '';
begin
  -- Test users (as postgres). The trigger creates their profiles.
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values
    (m, 'm@test.local', 'authenticated', 'authenticated', '{"full_name":"Manager Test","avatar_url":"https://x/m.png"}'),
    (p, 'p@test.local', 'authenticated', 'authenticated', '{"full_name":"Player Test"}'),
    (s, 's@test.local', 'authenticated', 'authenticated', '{"full_name":"Stranger Test"}'),
    (q, 'q@test.local', 'authenticated', 'authenticated', '{"full_name":"Other Manager"}'),
    (cm, 'c@test.local', 'authenticated', 'authenticated', '{"full_name":"Co Manager"}');

  for c in
    select * from (values
      -- ---------------- setup through the real rules (all must pass) ----------------
      (1,  'M opens table T1',                         'M', $$insert into public.poker_tables (id, invite_code) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'code-t1')$$, 'ok'),
      (2,  'M seats himself in T1',                    'M', $$insert into public.table_players (id, table_id, user_id, nickname, seat) values ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'מנהל', 0)$$, 'ok'),
      (3,  'M seats a guest (name only) in T1',        'M', $$insert into public.table_players (id, table_id, nickname, color, seat) values ('a0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'אורח', 3, 1)$$, 'ok'),
      (4,  'M adds buy-ins in T1',                     'M', $$insert into public.buy_ins (table_id, player_id, amount) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001', 50), ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000002', 50)$$, 'ok'),
      (5,  'P joins T1 with the invite code',          'P', $$insert into public.table_members (table_id, invite_code) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'code-t1')$$, 'ok'),
      (6,  'M seats P (a member) in T1',               'M', $$insert into public.table_players (id, table_id, user_id, nickname, seat) values ('a0000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'שחקן', 2)$$, 'ok'),
      (7,  'Q opens table T2',                         'Q', $$insert into public.poker_tables (id, invite_code) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'code-t2')$$, 'ok'),
      (8,  'P joins T2',                               'P', $$insert into public.table_members (table_id, invite_code) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'code-t2')$$, 'ok'),
      (9,  'Q seats Q and P in T2',                    'Q', $$insert into public.table_players (id, table_id, user_id, nickname, seat) values ('b0000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '44444444-4444-4444-8444-444444444444', 'מנהל 2', 0), ('b0000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'שחקן', 1)$$, 'ok'),
      (10, 'Q adds a buy-in for P in T2',              'Q', $$insert into public.buy_ins (table_id, player_id, amount) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b0000000-0000-4000-8000-000000000002', 100)$$, 'ok'),
      (11, 'M enters P''s result in T1',               'M', $$update public.table_players set final_value = -50, final_net = -50 where id = 'a0000000-0000-4000-8000-000000000003'$$, 'rows:1'),
      (12, 'Q enters P''s result in T2',               'Q', $$update public.table_players set final_value = 30, final_net = 30 where id = 'b0000000-0000-4000-8000-000000000002'$$, 'rows:1'),

      -- ---------------- what members (players) can see ----------------
      (20, 'P sees table T1',                          'P', $$select count(*) from public.poker_tables where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'count:1'),
      (21, 'P sees all 3 seats in T1',                 'P', $$select count(*) from public.table_players where table_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'count:3'),
      (22, 'P sees all buy-ins in T1',                 'P', $$select count(*) from public.buy_ins where table_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'count:2'),
      (23, 'P sees own results in both games',         'P', $$select count(*) from public.table_players where user_id = '22222222-2222-4222-8222-222222222222'$$, 'count:2'),
      (24, 'P sees the manager''s profile (tablemate)', 'P', $$select count(*) from public.profiles where id = '11111111-1111-4111-8111-111111111111'$$, 'count:1'),
      (25, 'Profile name comes from Google data',      'M', $$select count(*) from public.profiles where id = '11111111-1111-4111-8111-111111111111' and display_name = 'Manager' and avatar_url = 'https://x/m.png'$$, 'count:1'),

      -- ---------------- players are passive: every write must fail ----------------
      (30, 'P cannot add a buy-in',                    'P', $$insert into public.buy_ins (table_id, player_id, amount) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000003', 500)$$, 'deny'),
      (31, 'P cannot change a buy-in amount',          'P', $$update public.buy_ins set amount = 1 where table_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'rows:0'),
      (32, 'P cannot delete buy-ins',                  'P', $$delete from public.buy_ins where table_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'rows:0'),
      (33, 'P cannot add a player',                    'P', $$insert into public.table_players (table_id, nickname, color, seat) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'פולש', 1, 5)$$, 'deny'),
      (34, 'P cannot change own final result',         'P', $$update public.table_players set final_net = 9999 where user_id = '22222222-2222-4222-8222-222222222222'$$, 'rows:0'),
      (35, 'P cannot remove a player',                 'P', $$delete from public.table_players where table_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'rows:0'),
      (36, 'P cannot change table settings / end game', 'P', $$update public.poker_tables set status = 'ended', initial_buy_in = 1 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'rows:0'),
      (37, 'P cannot delete the table',                'P', $$delete from public.poker_tables where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'rows:0'),
      (38, 'P cannot kick members',                    'P', $$delete from public.table_members where table_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'rows:0'),
      (39, 'P cannot write other people''s profiles',  'P', $$update public.profiles set display_name = 'hacked' where id <> '22222222-2222-4222-8222-222222222222'$$, 'rows:0'),

      -- ---------------- strangers see nothing and can't get in ----------------
      (40, 'S cannot see table T1',                    'S', $$select count(*) from public.poker_tables$$, 'count:0'),
      (41, 'S cannot see players',                     'S', $$select count(*) from public.table_players$$, 'count:0'),
      (42, 'S cannot see buy-ins',                     'S', $$select count(*) from public.buy_ins$$, 'count:0'),
      (43, 'S cannot see members',                     'S', $$select count(*) from public.table_members$$, 'count:0'),
      (44, 'S cannot see other people''s profiles',    'S', $$select count(*) from public.profiles where id <> '33333333-3333-4333-8333-333333333333'$$, 'count:0'),
      (45, 'S cannot join with a wrong invite code',   'S', $$insert into public.table_members (table_id, invite_code) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'guess')$$, 'deny'),
      (46, 'S cannot join on behalf of someone else',  'S', $$insert into public.table_members (table_id, user_id, invite_code) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'code-t1')$$, 'deny'),
      (47, 'S cannot add a buy-in to T1',              'S', $$insert into public.buy_ins (table_id, player_id, amount) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000002', 50)$$, 'deny'),
      (48, 'S cannot open a table as someone else',    'S', $$insert into public.poker_tables (manager_id) values ('11111111-1111-4111-8111-111111111111')$$, 'deny'),
      (49, 'S cannot change T1',                       'S', $$update public.poker_tables set status = 'ended'$$, 'rows:0'),

      -- ---------------- managers only control their own table ----------------
      (50, 'M cannot see table T2',                    'M', $$select count(*) from public.poker_tables where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$, 'count:0'),
      (51, 'M cannot change T2',                       'M', $$update public.poker_tables set status = 'ended' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$, 'rows:0'),
      (52, 'M cannot add a buy-in to T2',              'M', $$insert into public.buy_ins (table_id, player_id, amount) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b0000000-0000-4000-8000-000000000002', 50)$$, 'deny'),
      (53, 'M cannot seat a non-member account',       'M', $$insert into public.table_players (table_id, user_id, nickname, seat) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'זר', 4)$$, 'deny'),
      (54, 'M cannot hand the table to someone else',  'M', $$update public.poker_tables set manager_id = '22222222-2222-4222-8222-222222222222' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'deny'),
      (55, 'Buy-in must belong to a player of that table', 'Q', $$insert into public.buy_ins (table_id, player_id, amount) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'a0000000-0000-4000-8000-000000000002', 50)$$, 'error:23503'),

      -- ---------------- stats isolation: only games the viewer attended ----------------
      (60, 'M sees P''s game in T1 only, not T2',      'M', $$select count(*) from public.table_players where user_id = '22222222-2222-4222-8222-222222222222'$$, 'count:1'),
      (61, 'M cannot sum P''s results from T2',        'M', $$select count(*) from public.table_players where user_id = '22222222-2222-4222-8222-222222222222' and final_net = 30$$, 'count:0'),
      (62, 'M cannot see Q''s profile (never met)',    'M', $$select count(*) from public.profiles where id = '44444444-4444-4444-8444-444444444444'$$, 'count:0'),
      (63, 'Q cannot see T1 buy-ins via P',            'Q', $$select count(*) from public.buy_ins where table_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'count:0'),

      -- ---------------- invites stop working once the game ended ----------------
      (70, 'M ends T1',                                'M', $$update public.poker_tables set status = 'ended', ended_at = now() where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'rows:1'),
      (71, 'S cannot join an ended table',             'S', $$insert into public.table_members (table_id, invite_code) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'code-t1')$$, 'deny'),

      -- ---------------- signed-out visitors (anon) get nothing ----------------
      (80, 'Anon cannot read tables',                  'anon', $$select count(*) from public.poker_tables$$, 'deny'),
      (81, 'Anon cannot read profiles',                'anon', $$select count(*) from public.profiles$$, 'deny'),
      (82, 'Anon cannot read buy-ins',                 'anon', $$select count(*) from public.buy_ins$$, 'deny'),
      (83, 'Anon cannot open a table',                 'anon', $$insert into public.poker_tables (manager_id) values ('11111111-1111-4111-8111-111111111111')$$, 'deny'),

      -- ---------------- display names + colors: users edit only their own ----------------
      (100, 'P changes own display name',                'P', $$update public.profiles set display_name = 'פי החדש', name_confirmed_at = now() where id = '22222222-2222-4222-8222-222222222222'$$, 'rows:1'),
      (101, 'P picks own color',                         'P', $$update public.profiles set color = 4 where id = '22222222-2222-4222-8222-222222222222'$$, 'rows:1'),
      (102, 'P cannot rename the manager',               'P', $$update public.profiles set display_name = 'hacked' where id = '11111111-1111-4111-8111-111111111111'$$, 'rows:0'),
      (103, 'Q (tablemate) cannot change P''s color',    'Q', $$update public.profiles set color = 0 where id = '22222222-2222-4222-8222-222222222222'$$, 'rows:0'),
      (104, 'P cannot change own picture (trigger only)', 'P', $$update public.profiles set avatar_url = 'https://evil/x.png' where id = '22222222-2222-4222-8222-222222222222'$$, 'deny'),
      (105, 'Empty display name is rejected',            'P', $$update public.profiles set display_name = '   ' where id = '22222222-2222-4222-8222-222222222222'$$, 'error:23514'),
      (106, 'Display name over 30 chars is rejected',    'P', $$update public.profiles set display_name = repeat('א', 31) where id = '22222222-2222-4222-8222-222222222222'$$, 'error:23514'),
      (107, 'Color outside the palette is rejected',     'P', $$update public.profiles set color = 99 where id = '22222222-2222-4222-8222-222222222222'$$, 'error:23514'),
      (108, 'Google sign-in again (meta update)',        'postgres', $$update auth.users set raw_user_meta_data = '{"full_name":"Google Overwrite","avatar_url":"https://x/new.png"}' where id = '22222222-2222-4222-8222-222222222222'$$, 'rows:1'),
      (109, '…keeps the chosen name, updates the picture', 'P', $$select count(*) from public.profiles where id = '22222222-2222-4222-8222-222222222222' and display_name = 'פי החדש' and color = 4 and avatar_url = 'https://x/new.png'$$, 'count:1'),
      (110, 'New users get their Google first name',     'M', $$select count(*) from public.profiles where id = '11111111-1111-4111-8111-111111111111' and display_name = 'Manager'$$, 'count:1'),
      (111, 'S still cannot see P''s profile',           'S', $$select count(*) from public.profiles where id = '22222222-2222-4222-8222-222222222222'$$, 'count:0'),
      (112, 'Anon cannot change profiles',               'anon', $$update public.profiles set display_name = 'x'$$, 'deny'),

      -- ---------------- per-table nickname + color: manager only ----------------
      (120, 'M sets a per-table nickname for P in T1',   'M', $$update public.table_players set nickname = 'פי הגדול' where id = 'a0000000-0000-4000-8000-000000000003'$$, 'rows:1'),
      (121, 'M sets a per-table color for P in T1',      'M', $$update public.table_players set color = 6 where id = 'a0000000-0000-4000-8000-000000000003'$$, 'rows:1'),
      (122, '…which doesn''t change P''s profile',       'P', $$select count(*) from public.profiles where id = '22222222-2222-4222-8222-222222222222' and display_name = 'פי החדש' and color = 4$$, 'count:1'),
      (123, 'P cannot set own per-table nickname',       'P', $$update public.table_players set nickname = 'אני המלך' where user_id = '22222222-2222-4222-8222-222222222222'$$, 'rows:0'),
      (124, 'P cannot set own per-table color',          'P', $$update public.table_players set color = 0 where user_id = '22222222-2222-4222-8222-222222222222'$$, 'rows:0'),
      (125, 'Q cannot rename players in T1',             'Q', $$update public.table_players set nickname = 'x' where table_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'rows:0'),
      (126, 'M''s nickname for P stays in T1 only',      'P', $$select count(*) from public.table_players where user_id = '22222222-2222-4222-8222-222222222222' and nickname = 'פי הגדול'$$, 'count:1'),
      (127, 'Guest without a color is rejected',         'Q', $$insert into public.table_players (table_id, nickname, seat) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'אורח', 5)$$, 'error:23514'),
      (128, 'Guest without a name is rejected',          'Q', $$insert into public.table_players (table_id, color, seat) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 2, 5)$$, 'error:23514'),
      (129, 'Per-table color outside the palette is rejected', 'Q', $$update public.table_players set color = 12 where id = 'b0000000-0000-4000-8000-000000000002'$$, 'error:23514'),

      -- ---------------- co-managers (table T3) ----------------
      (140, 'M opens table T3',                          'M', $$insert into public.poker_tables (id, invite_code) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'code-t3')$$, 'ok'),
      (141, 'P joins T3',                                'P', $$insert into public.table_members (table_id, invite_code) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'code-t3')$$, 'ok'),
      (142, 'C joins T3',                                'C', $$insert into public.table_members (table_id, invite_code) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'code-t3')$$, 'ok'),
      (143, 'M seats P, a guest and C in T3',            'M', $$insert into public.table_players (id, table_id, user_id, nickname, color, seat) values ('c0000000-0000-4000-8000-000000000001', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222', null, null, 0), ('c0000000-0000-4000-8000-000000000002', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', null, 'אורח', 5, 1), ('c0000000-0000-4000-8000-000000000003', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '55555555-5555-4555-8555-555555555555', null, null, 2)$$, 'ok'),
      (144, 'S cannot join as a co-manager',             'S', $$insert into public.table_members (table_id, invite_code, is_co_manager) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'code-t3', true)$$, 'deny'),
      (145, 'C (plain member) cannot add buy-ins',       'C', $$insert into public.buy_ins (table_id, player_id, amount) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c0000000-0000-4000-8000-000000000002', 50)$$, 'deny'),
      (146, 'C cannot make himself co-manager',          'C', $$update public.table_members set is_co_manager = true where user_id = '55555555-5555-4555-8555-555555555555'$$, 'rows:0'),
      (147, 'P cannot appoint C',                        'P', $$update public.table_members set is_co_manager = true where user_id = '55555555-5555-4555-8555-555555555555'$$, 'rows:0'),
      (148, 'M appoints C as co-manager',                'M', $$update public.table_members set is_co_manager = true where table_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and user_id = '55555555-5555-4555-8555-555555555555'$$, 'rows:1'),
      (149, 'Co-manager C adds a buy-in for the guest',  'C', $$insert into public.buy_ins (table_id, player_id, amount) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c0000000-0000-4000-8000-000000000002', 50)$$, 'ok'),
      (150, 'Co-manager C seats another guest',          'C', $$insert into public.table_players (id, table_id, nickname, color, seat) values ('c0000000-0000-4000-8000-000000000004', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'אורח 2', 6, 4)$$, 'ok'),
      (151, 'Co-manager C sets a per-table name',        'C', $$update public.table_players set nickname = 'פי' where id = 'c0000000-0000-4000-8000-000000000001'$$, 'rows:1'),
      (152, 'Co-manager C enters a result',              'C', $$update public.table_players set final_value = 20 where id = 'c0000000-0000-4000-8000-000000000002'$$, 'rows:1'),
      (153, 'Co-manager C starts the game',              'C', $$update public.poker_tables set status = 'playing' where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$, 'rows:1'),
      (154, 'Co-manager C cannot end the game',          'C', $$update public.poker_tables set status = 'ended' where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$, 'deny'),
      (155, 'Co-manager C cannot change the buy-in mode', 'C', $$update public.poker_tables set buy_in_mode = 'self_add' where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$, 'deny'),
      (156, 'Co-manager C cannot appoint co-managers',   'C', $$update public.table_members set is_co_manager = true where user_id = '22222222-2222-4222-8222-222222222222' and table_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$, 'rows:0'),
      (157, 'Co-manager C cannot change the invite code', 'C', $$update public.poker_tables set invite_code = 'new' where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$, 'deny'),
      (158, 'Nobody can record a buy-in in someone else''s name', 'C', $$insert into public.buy_ins (table_id, player_id, amount, created_by) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c0000000-0000-4000-8000-000000000002', 50, '11111111-1111-4111-8111-111111111111')$$, 'deny'),
      (159, 'Co-manager C cannot delete the table',      'C', $$delete from public.poker_tables where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$, 'rows:0'),

      -- ---------------- buy-in mode "כל אחד את שלו" (self_add) ----------------
      (160, 'In "managers only" P cannot add own buy-in', 'P', $$insert into public.buy_ins (table_id, player_id, amount) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c0000000-0000-4000-8000-000000000001', 50)$$, 'deny'),
      (161, 'M switches T3 to self-add',                 'M', $$update public.poker_tables set buy_in_mode = 'self_add' where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$, 'rows:1'),
      (162, 'P adds a buy-in for himself',               'P', $$insert into public.buy_ins (id, table_id, player_id, amount) values ('d0000000-0000-4000-8000-000000000001', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c0000000-0000-4000-8000-000000000001', 50)$$, 'ok'),
      (163, 'P cannot add a buy-in for the guest',       'P', $$insert into public.buy_ins (table_id, player_id, amount) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c0000000-0000-4000-8000-000000000002', 50)$$, 'deny'),
      (164, 'P cannot add a buy-in for another user',    'P', $$insert into public.buy_ins (table_id, player_id, amount) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c0000000-0000-4000-8000-000000000003', 50)$$, 'deny'),
      (165, 'P cannot change his own buy-in',            'P', $$update public.buy_ins set amount = 500 where id = 'd0000000-0000-4000-8000-000000000001'$$, 'rows:0'),
      (166, 'P cannot delete his own buy-in',            'P', $$delete from public.buy_ins where id = 'd0000000-0000-4000-8000-000000000001'$$, 'rows:0'),
      (167, 'P cannot record his buy-in as the manager', 'P', $$insert into public.buy_ins (table_id, player_id, amount, created_by) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c0000000-0000-4000-8000-000000000001', 50, '11111111-1111-4111-8111-111111111111')$$, 'deny'),
      (168, 'S cannot add buy-ins even in self-add mode', 'S', $$insert into public.buy_ins (table_id, player_id, amount) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c0000000-0000-4000-8000-000000000001', 50)$$, 'deny'),

      -- ---------------- removing a co-manager ----------------
      (170, 'M removes C as co-manager',                 'M', $$update public.table_members set is_co_manager = false where table_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and user_id = '55555555-5555-4555-8555-555555555555'$$, 'rows:1'),
      (171, 'C can no longer add buy-ins for others',    'C', $$insert into public.buy_ins (table_id, player_id, amount) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c0000000-0000-4000-8000-000000000002', 50)$$, 'deny'),
      (172, 'C can no longer rename players',            'C', $$update public.table_players set nickname = 'x' where table_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$, 'rows:0'),

      -- ---------------- change log ----------------
      (180, 'Log: P''s self-added buy-in, by P',         'P', $$select count(*) from public.table_log where table_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and action = 'buy_in_added' and actor_id = '22222222-2222-4222-8222-222222222222' and details ->> 'self' = 'true' and (details ->> 'amount')::int = 50$$, 'count:1'),
      (181, 'Log: C''s buy-in for the guest, by C',      'P', $$select count(*) from public.table_log where table_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and action = 'buy_in_added' and actor_id = '55555555-5555-4555-8555-555555555555' and details ->> 'name' = 'אורח'$$, 'count:1'),
      (182, 'Log: M appointed and removed C',            'P', $$select count(*) from public.table_log where table_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and actor_id = '11111111-1111-4111-8111-111111111111' and action in ('co_manager_added', 'co_manager_removed')$$, 'count:2'),
      (183, 'Log: C renamed P and started the game',     'P', $$select count(*) from public.table_log where table_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and actor_id = '55555555-5555-4555-8555-555555555555' and action in ('player_renamed', 'game_started')$$, 'count:2'),
      (184, 'Log: blocked attempts leave no entries',    'P', $$select count(*) from public.table_log where table_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and action = 'game_ended'$$, 'count:0'),
      (185, 'S cannot read T3''s log',                   'S', $$select count(*) from public.table_log$$, 'count:0'),
      (186, 'P cannot write to the log',                 'P', $$insert into public.table_log (table_id, action) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'fake')$$, 'deny'),
      (187, 'The manager cannot edit the log',           'M', $$update public.table_log set action = 'fake' where table_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$, 'deny'),
      (188, 'The manager cannot delete from the log',    'M', $$delete from public.table_log where table_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$, 'deny'),
      (189, 'Anon cannot read the log',                  'anon', $$select count(*) from public.table_log$$, 'deny'),
      (190, 'M ends T3',                                 'M', $$update public.poker_tables set status = 'ended' where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$, 'rows:1'),
      (191, 'P cannot self-add after the game ended',    'P', $$insert into public.buy_ins (table_id, player_id, amount) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c0000000-0000-4000-8000-000000000001', 50)$$, 'deny'),
      (192, 'Log: M ended the game',                     'P', $$select count(*) from public.table_log where table_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and action = 'game_ended' and actor_id = '11111111-1111-4111-8111-111111111111'$$, 'count:1'),
      (193, 'M can still delete the table (log cascades)', 'M', $$delete from public.poker_tables where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$, 'rows:1'),

      -- ---------------- 12 colors ----------------
      (200, 'Color 11 (lime) is accepted for a profile',   'P', $$update public.profiles set color = 11 where id = '22222222-2222-4222-8222-222222222222'$$, 'rows:1'),
      (201, 'Color 12 is rejected for a profile',          'P', $$update public.profiles set color = 12 where id = '22222222-2222-4222-8222-222222222222'$$, 'error:23514'),

      -- ---------------- invites + members picking their own seat (table T4) ----------------
      (202, 'M opens table T4',                            'M', $$insert into public.poker_tables (id, invite_code) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'code-t4')$$, 'ok'),
      (203, 'M seats a guest in seat 1 (index 0), color 11',         'M', $$insert into public.table_players (id, table_id, nickname, color, seat) values ('e0000000-0000-4000-8000-000000000001', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'אורח', 11, 0)$$, 'ok'),
      (204, 'P joins T4 with the invite',                  'P', $$insert into public.table_members (table_id, invite_code) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'code-t4')$$, 'ok'),
      (205, 'Q joins T4 with the invite',                  'Q', $$insert into public.table_members (table_id, invite_code) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'code-t4')$$, 'ok'),
      (206, 'P takes his own free seat (seat 4 = index 3)',          'P', $$insert into public.table_players (id, table_id, user_id, seat) values ('e0000000-0000-4000-8000-000000000002', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', '22222222-2222-4222-8222-222222222222', 3)$$, 'ok'),
      (207, 'P cannot take a second seat',                 'P', $$insert into public.table_players (table_id, user_id, seat) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '22222222-2222-4222-8222-222222222222', 5)$$, 'error:23505'),
      (208, 'P cannot seat a guest',                       'P', $$insert into public.table_players (table_id, nickname, color, seat) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'חבר', 1, 5)$$, 'deny'),
      (209, 'P cannot seat another user (Q)',              'P', $$insert into public.table_players (table_id, user_id, seat) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '44444444-4444-4444-8444-444444444444', 5)$$, 'deny'),
      (210, 'Q cannot take an occupied seat',              'Q', $$insert into public.table_players (table_id, user_id, seat) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '44444444-4444-4444-8444-444444444444', 0)$$, 'error:23505'),
      (211, 'Q cannot sit with a per-table name',          'Q', $$insert into public.table_players (table_id, user_id, nickname, seat) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '44444444-4444-4444-8444-444444444444', 'המלך', 6)$$, 'deny'),
      (212, 'Q cannot sit with a color override',          'Q', $$insert into public.table_players (table_id, user_id, color, seat) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '44444444-4444-4444-8444-444444444444', 3, 6)$$, 'deny'),
      (213, 'Q cannot sit with a result already set',      'Q', $$insert into public.table_players (table_id, user_id, final_value, seat) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '44444444-4444-4444-8444-444444444444', 500, 6)$$, 'deny'),
      (214, 'S (not invited) cannot take a seat',          'S', $$insert into public.table_players (table_id, user_id, seat) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '33333333-3333-4333-8333-333333333333', 6)$$, 'deny'),
      (215, 'P cannot move himself afterwards',            'P', $$update public.table_players set seat = 7 where id = 'e0000000-0000-4000-8000-000000000002'$$, 'rows:0'),
      (216, 'P calling swap_seats changes nothing',        'P', $$select public.swap_seats('e0000000-0000-4000-8000-000000000002', 0)$$, 'ok'),
      (217, '…seats are unchanged',                        'M', $$select count(*) from public.table_players where (id = 'e0000000-0000-4000-8000-000000000001' and seat = 0) or (id = 'e0000000-0000-4000-8000-000000000002' and seat = 3)$$, 'count:2'),
      (218, 'M swaps P and the guest via swap_seats',      'M', $$select public.swap_seats('e0000000-0000-4000-8000-000000000002', 0)$$, 'ok'),
      (219, '…they swapped seats',                         'M', $$select count(*) from public.table_players where (id = 'e0000000-0000-4000-8000-000000000001' and seat = 3) or (id = 'e0000000-0000-4000-8000-000000000002' and seat = 0)$$, 'count:2'),
      (220, 'Two players can never share a seat',          'M', $$update public.table_players set seat = 0 where id = 'e0000000-0000-4000-8000-000000000001'$$, 'error:23505'),
      (221, 'Anon cannot call swap_seats',                 'anon', $$select public.swap_seats('e0000000-0000-4000-8000-000000000002', 5)$$, 'deny'),
      (222, 'Log: P seated himself',                       'M', $$select count(*) from public.table_log where table_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' and action = 'player_seated' and actor_id = '22222222-2222-4222-8222-222222222222'$$, 'count:1'),
      (223, 'M ends T4',                                   'M', $$update public.poker_tables set status = 'ended' where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'$$, 'rows:1'),
      (224, 'Q cannot take a seat after the game ended',   'Q', $$insert into public.table_players (table_id, user_id, seat) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '44444444-4444-4444-8444-444444444444', 6)$$, 'deny'),

      -- ---------------- every table has RLS on ----------------
      (90, 'RLS is enabled on all 6 tables',           'M', $$select count(*) from pg_tables where schemaname = 'public' and tablename in ('profiles','poker_tables','table_members','table_players','buy_ins','table_log') and rowsecurity$$, 'count:6')
    ) as t(i, name, who, sql, expect)
    order by i
  loop
    total := total + 1;
    ok := false;
    detail := null;
    begin
      perform set_config('role', case c.who when 'anon' then 'anon' when 'postgres' then 'postgres' else 'authenticated' end, true);
      perform set_config(
        'request.jwt.claims',
        case c.who
          when 'M' then json_build_object('sub', m, 'role', 'authenticated')::text
          when 'P' then json_build_object('sub', p, 'role', 'authenticated')::text
          when 'S' then json_build_object('sub', s, 'role', 'authenticated')::text
          when 'Q' then json_build_object('sub', q, 'role', 'authenticated')::text
          when 'C' then json_build_object('sub', cm, 'role', 'authenticated')::text
          else json_build_object('role', 'anon')::text
        end,
        true
      );

      if c.expect like 'count:%' then
        execute c.sql into n;
        ok := n = split_part(c.expect, ':', 2)::bigint;
        detail := 'saw ' || n;
      else
        execute c.sql;
        get diagnostics n = row_count;
        if c.expect = 'ok' then
          ok := true;
        elsif c.expect like 'rows:%' then
          ok := n = split_part(c.expect, ':', 2)::bigint;
          detail := n || ' rows changed';
        else
          detail := 'succeeded but should have been blocked';
        end if;
      end if;
    exception when others then
      ok := (c.expect = 'deny' and sqlstate = '42501') or c.expect = 'error:' || sqlstate;
      detail := sqlstate || ': ' || sqlerrm;
    end;

    if not ok then
      failed := failed + 1;
    end if;
    report := report || format(E'%s %s. %s%s\n',
      case when ok then '✅' else '❌' end, c.i, c.name,
      case when ok then '' else ' → ' || coalesce(detail, '') end);
  end loop;

  -- Raising rolls back EVERYTHING above (users, tables, buy-ins).
  raise exception E'%\n\n%',
    case when failed = 0
      then format('ALL %s TESTS PASSED ✅ (test data rolled back)', total)
      else format('%s OF %s TESTS FAILED ❌ (test data rolled back)', failed, total)
    end,
    report;
end
$test$;
