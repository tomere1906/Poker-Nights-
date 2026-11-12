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
--         T5: table name, players leaving mid-game (exits), ending the game (end_game), ended = locked
--         300+: stats views (my_games, my_tablemates) over all of the above; 330+: hiding games (hidden_games); 350+: removing from your own stats for good; 370+: rounding; 380+: cash paid into the pot; 410+: chip value and "לא כאן"; 430+: hidden characters in names
--         T6 (450+): stored transfers, phone numbers for Bit (who may see them), "שולם ✓" marks
--         T7 (516+): a player who leaves mid-game gives up their seat
--         T8 (540+): a closed game stays open for settling until everyone has paid
--         T9 (570+): cleaning "משחקים שניהלתי": hiding a game from your own list, deleting a closed game (original manager only)
--         T10 (600+): imported game history: only the owner reads, adds and deletes
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
      -- Blocked by RLS (player_can_buy_in checks the seat is in that table); the FK is a second layer.
      (55, 'Buy-in must belong to a player of that table', 'Q', $$insert into public.buy_ins (table_id, player_id, amount) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'a0000000-0000-4000-8000-000000000002', 50)$$, 'deny'),

      -- ---------------- stats isolation: only games the viewer attended ----------------
      (60, 'M sees P''s game in T1 only, not T2',      'M', $$select count(*) from public.table_players where user_id = '22222222-2222-4222-8222-222222222222'$$, 'count:1'),
      (61, 'M cannot sum P''s results from T2',        'M', $$select count(*) from public.table_players where user_id = '22222222-2222-4222-8222-222222222222' and final_net = 30$$, 'count:0'),
      (62, 'M cannot see Q''s profile (never met)',    'M', $$select count(*) from public.profiles where id = '44444444-4444-4444-8444-444444444444'$$, 'count:0'),
      (63, 'Q cannot see T1 buy-ins via P',            'Q', $$select count(*) from public.buy_ins where table_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'count:0'),

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

      -- ---------------- an ended table: invites stop, everything is locked ----------------
      (130, 'M ends T1 (balanced results)',              'M', $$select public.end_game('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '{"a0000000-0000-4000-8000-000000000001": 30, "a0000000-0000-4000-8000-000000000002": 20, "a0000000-0000-4000-8000-000000000003": -50}')$$, 'ok'),
      (131, 'S cannot join an ended table',              'S', $$insert into public.table_members (table_id, invite_code) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'code-t1')$$, 'deny'),
      (132, 'M cannot add a buy-in after the end',       'M', $$insert into public.buy_ins (table_id, player_id, amount) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001', 50)$$, 'deny'),
      (133, 'M cannot change a buy-in after the end',    'M', $$update public.buy_ins set amount = 1 where table_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'rows:0'),
      (134, 'M cannot change a result after the end',    'M', $$update public.table_players set final_net = 999 where table_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'rows:0'),
      (135, 'M cannot seat a guest after the end',       'M', $$insert into public.table_players (table_id, nickname, color, seat) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'מאחר', 1, 5)$$, 'deny'),
      (136, 'M cannot remove a player after the end',    'M', $$delete from public.table_players where table_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'rows:0'),
      (137, 'M cannot change amounts after the end',     'M', $$update public.poker_tables set initial_buy_in = 1 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'deny'),
      (138, 'The settled results are stored and balance', 'P', $$select count(*) from public.table_players where table_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' having sum(final_net) = 0 and count(final_net) = 3$$, 'count:3'),
      (139, 'M can still rename the ended table',        'M', $$update public.poker_tables set name = 'ערב ראשון' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'rows:1'),

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
      (169, 'Co-manager C cannot end via end_game',      'C', $$select public.end_game('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '{"c0000000-0000-4000-8000-000000000001": 10, "c0000000-0000-4000-8000-000000000002": 20, "c0000000-0000-4000-8000-000000000003": -30, "c0000000-0000-4000-8000-000000000004": 0}')$$, 'deny'),

      -- ---------------- removing a co-manager ----------------
      (170, 'M removes C as co-manager',                 'M', $$update public.table_members set is_co_manager = false where table_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and user_id = '55555555-5555-4555-8555-555555555555'$$, 'rows:1'),
      (171, 'C can no longer add buy-ins for others',    'C', $$insert into public.buy_ins (table_id, player_id, amount) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c0000000-0000-4000-8000-000000000002', 50)$$, 'deny'),
      (172, 'C can no longer rename players',            'C', $$update public.table_players set nickname = 'x' where table_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$, 'rows:0'),
      (173, '…and C''s end_game attempt wrote nothing',   'M', $$select count(*) from public.table_players where table_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and final_net is not null$$, 'count:0'),
      (174, 'M cannot end with results that don''t add up', 'M', $$select public.end_game('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '{"c0000000-0000-4000-8000-000000000001": 10, "c0000000-0000-4000-8000-000000000002": 20, "c0000000-0000-4000-8000-000000000003": -30, "c0000000-0000-4000-8000-000000000004": 5}')$$, 'error:23514'),
      (175, 'M cannot end with a player missing',        'M', $$select public.end_game('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '{"c0000000-0000-4000-8000-000000000001": 10, "c0000000-0000-4000-8000-000000000002": 20, "c0000000-0000-4000-8000-000000000003": -30}')$$, 'error:23514'),
      (176, 'Plain status=ended without results is rejected', 'M', $$update public.poker_tables set status = 'ended' where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'$$, 'error:23514'),

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
      (190, 'M ends T3',                                 'M', $$select public.end_game('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '{"c0000000-0000-4000-8000-000000000001": 10, "c0000000-0000-4000-8000-000000000002": 20, "c0000000-0000-4000-8000-000000000003": -30, "c0000000-0000-4000-8000-000000000004": 0}')$$, 'ok'),
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
      (223, 'M ends T4',                                   'M', $$select public.end_game('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '{"e0000000-0000-4000-8000-000000000001": 10, "e0000000-0000-4000-8000-000000000002": -10}')$$, 'ok'),
      (224, 'Q cannot take a seat after the game ended',   'Q', $$insert into public.table_players (table_id, user_id, seat) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '44444444-4444-4444-8444-444444444444', 6)$$, 'deny'),

      -- ---------------- table name (T5) ----------------
      (230, 'M opens T5 with a name',                      'M', $$insert into public.poker_tables (id, invite_code, name) values ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'code-t5', 'שישי אצל אסף')$$, 'ok'),
      (231, 'P joins T5',                                  'P', $$insert into public.table_members (table_id, invite_code) values ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'code-t5')$$, 'ok'),
      (232, 'C joins T5',                                  'C', $$insert into public.table_members (table_id, invite_code) values ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'code-t5')$$, 'ok'),
      (233, 'M appoints C as co-manager of T5',            'M', $$update public.table_members set is_co_manager = true where table_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff' and user_id = '55555555-5555-4555-8555-555555555555'$$, 'rows:1'),
      (234, 'M seats M, P and a guest in T5',              'M', $$insert into public.table_players (id, table_id, user_id, nickname, color, seat) values ('f0000000-0000-4000-8000-000000000001', 'ffffffff-ffff-4fff-8fff-ffffffffffff', '11111111-1111-4111-8111-111111111111', null, null, 0), ('f0000000-0000-4000-8000-000000000002', 'ffffffff-ffff-4fff-8fff-ffffffffffff', '22222222-2222-4222-8222-222222222222', null, null, 1), ('f0000000-0000-4000-8000-000000000003', 'ffffffff-ffff-4fff-8fff-ffffffffffff', null, 'אורח', 2, 2)$$, 'ok'),
      (235, 'M adds buy-ins in T5',                        'M', $$insert into public.buy_ins (table_id, player_id, amount) values ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'f0000000-0000-4000-8000-000000000001', 100), ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'f0000000-0000-4000-8000-000000000002', 50), ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'f0000000-0000-4000-8000-000000000003', 50)$$, 'ok'),
      (236, 'P sees the table name',                       'P', $$select count(*) from public.poker_tables where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff' and name = 'שישי אצל אסף'$$, 'count:1'),
      (237, 'M renames T5',                                'M', $$update public.poker_tables set name = 'שישי אצל תומר' where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'$$, 'rows:1'),
      (238, 'Co-manager C cannot rename the table',        'C', $$update public.poker_tables set name = 'של C' where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'$$, 'deny'),
      (239, 'P cannot rename the table',                   'P', $$update public.poker_tables set name = 'של P' where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'$$, 'rows:0'),
      (240, 'A name over 30 characters is rejected',       'M', $$update public.poker_tables set name = repeat('א', 31) where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'$$, 'error:23514'),
      (241, 'A blank name is rejected',                    'M', $$update public.poker_tables set name = '   ' where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'$$, 'error:23514'),
      (242, 'M removes the name (optional)',               'M', $$update public.poker_tables set name = null where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'$$, 'rows:1'),
      (243, 'M names it again',                            'M', $$update public.poker_tables set name = 'שישי' where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'$$, 'rows:1'),
      (244, 'Log: 3 renames, all by M',                    'P', $$select count(*) from public.table_log where table_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff' and action = 'table_renamed' and actor_id = '11111111-1111-4111-8111-111111111111'$$, 'count:3'),
      (245, 'S cannot see the table or its name',          'S', $$select count(*) from public.poker_tables where name is not null$$, 'count:0'),

      -- ---------------- players leaving mid-game (T5) ----------------
      (250, 'M starts T5',                                 'M', $$update public.poker_tables set status = 'playing' where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'$$, 'rows:1'),
      (251, 'Co-manager C marks the guest out: lost all',  'C', $$update public.table_players set out_kind = 'lost_all', out_chips = 0 where id = 'f0000000-0000-4000-8000-000000000003'$$, 'rows:1'),
      (252, '"Lost all" with chips left is rejected',      'M', $$update public.table_players set out_chips = 5 where id = 'f0000000-0000-4000-8000-000000000003'$$, 'error:23514'),
      (253, 'An exit without an amount is rejected',       'M', $$update public.table_players set out_kind = 'amount' where id = 'f0000000-0000-4000-8000-000000000002'$$, 'error:23514'),
      (254, 'A negative exit amount is rejected',          'M', $$update public.table_players set out_kind = 'amount', out_chips = -1 where id = 'f0000000-0000-4000-8000-000000000002'$$, 'error:23514'),
      (255, 'An unknown exit kind is rejected',            'M', $$update public.table_players set out_kind = 'flew', out_chips = 1 where id = 'f0000000-0000-4000-8000-000000000002'$$, 'error:23514'),
      (256, 'P cannot mark himself out',                   'P', $$update public.table_players set out_kind = 'even', out_chips = 50 where id = 'f0000000-0000-4000-8000-000000000002'$$, 'rows:0'),
      (257, 'P cannot bring the guest back',               'P', $$update public.table_players set out_kind = null, out_chips = null where id = 'f0000000-0000-4000-8000-000000000003'$$, 'rows:0'),
      (258, 'No buy-ins for a player who is out',          'M', $$insert into public.buy_ins (table_id, player_id, amount) values ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'f0000000-0000-4000-8000-000000000003', 50)$$, 'deny'),
      (259, 'M marks P out with an amount (80)',           'M', $$update public.table_players set out_kind = 'amount', out_chips = 80 where id = 'f0000000-0000-4000-8000-000000000002'$$, 'rows:1'),
      (260, 'P sees his exit and amount',                  'P', $$select count(*) from public.table_players where id = 'f0000000-0000-4000-8000-000000000002' and out_kind = 'amount' and out_chips = 80$$, 'count:1'),
      (261, 'M switches T5 to self-add',                   'M', $$update public.poker_tables set buy_in_mode = 'self_add' where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'$$, 'rows:1'),
      (262, 'P cannot self-add while out',                 'P', $$insert into public.buy_ins (table_id, player_id, amount) values ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'f0000000-0000-4000-8000-000000000002', 50)$$, 'deny'),
      (263, 'C brings the guest back ("חזר לשחק")',        'C', $$update public.table_players set out_kind = null, out_chips = null where id = 'f0000000-0000-4000-8000-000000000003'$$, 'rows:1'),
      (264, '…and adds a re-buy for the guest',            'C', $$insert into public.buy_ins (table_id, player_id, amount) values ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'f0000000-0000-4000-8000-000000000003', 50)$$, 'ok'),
      (265, 'Log: 2 exits and 1 return',                   'P', $$select count(*) from public.table_log where table_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff' and ((action = 'player_out' and details ->> 'kind' in ('lost_all', 'amount')) or action = 'player_back')$$, 'count:3'),
      (266, 'Log: the exit amount is recorded',            'P', $$select count(*) from public.table_log where table_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff' and action = 'player_out' and (details ->> 'chips')::int = 80 and actor_id = '11111111-1111-4111-8111-111111111111'$$, 'count:1'),

      -- ---------------- ending the game online (T5) ----------------
      (270, 'Co-manager C enters the guest''s final chips', 'C', $$update public.table_players set final_value = 120 where id = 'f0000000-0000-4000-8000-000000000003'$$, 'rows:1'),
      (271, 'P cannot enter results',                      'P', $$update public.table_players set final_value = 500 where id = 'f0000000-0000-4000-8000-000000000002'$$, 'rows:0'),
      (272, 'S cannot end T5',                             'S', $$select public.end_game('ffffffff-ffff-4fff-8fff-ffffffffffff', '{"f0000000-0000-4000-8000-000000000001": -50, "f0000000-0000-4000-8000-000000000002": 30, "f0000000-0000-4000-8000-000000000003": 20}')$$, 'deny'),
      (273, 'Anon cannot call end_game',                   'anon', $$select public.end_game('ffffffff-ffff-4fff-8fff-ffffffffffff', '{}')$$, 'deny'),
      (274, 'Fractional results are rejected',             'M', $$select public.end_game('ffffffff-ffff-4fff-8fff-ffffffffffff', '{"f0000000-0000-4000-8000-000000000001": -50.5, "f0000000-0000-4000-8000-000000000002": 30.5, "f0000000-0000-4000-8000-000000000003": 20}')$$, 'error:22P02'),
      (275, 'M ends T5',                                   'M', $$select public.end_game('ffffffff-ffff-4fff-8fff-ffffffffffff', '{"f0000000-0000-4000-8000-000000000001": -50, "f0000000-0000-4000-8000-000000000002": 30, "f0000000-0000-4000-8000-000000000003": 20}')$$, 'ok'),
      (276, '…T5 is ended, with the time',                 'P', $$select count(*) from public.poker_tables where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff' and status = 'ended' and ended_at is not null$$, 'count:1'),
      (277, '…every player''s net is stored',              'P', $$select count(*) from public.table_players where table_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff' and final_net is not null$$, 'count:3'),
      (278, '…and P sees his own result (+30)',            'P', $$select count(*) from public.table_players where id = 'f0000000-0000-4000-8000-000000000002' and final_net = 30$$, 'count:1'),
      (279, 'Log: M ended T5',                             'P', $$select count(*) from public.table_log where table_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff' and action = 'game_ended' and actor_id = '11111111-1111-4111-8111-111111111111'$$, 'count:1'),
      (280, 'C cannot mark anyone out after the end',      'C', $$update public.table_players set out_kind = 'even', out_chips = 100 where id = 'f0000000-0000-4000-8000-000000000001'$$, 'rows:0'),
      (281, 'C cannot change results after the end',       'C', $$update public.table_players set final_net = 0 where table_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'$$, 'rows:0'),
      (282, 'C cannot delete buy-ins after the end',       'C', $$delete from public.buy_ins where table_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'$$, 'rows:0'),
      (283, 'P cannot self-add after the end',             'P', $$insert into public.buy_ins (table_id, player_id, amount) values ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'f0000000-0000-4000-8000-000000000001', 50)$$, 'deny'),
      (284, 'C cannot reopen the game',                    'C', $$update public.poker_tables set status = 'playing' where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'$$, 'deny'),
      (285, 'M reopens the game',                          'M', $$update public.poker_tables set status = 'playing' where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'$$, 'rows:1'),
      (286, '…ended_at is cleared',                        'M', $$select count(*) from public.poker_tables where id = 'ffffffff-ffff-4fff-8fff-ffffffffffff' and ended_at is null$$, 'count:1'),
      (287, '…and buy-ins work again',                     'M', $$insert into public.buy_ins (table_id, player_id, amount) values ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'f0000000-0000-4000-8000-000000000001', 50)$$, 'ok'),
      (288, 'Log: started + reopened, both by M',          'P', $$select count(*) from public.table_log where table_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff' and action = 'game_started' and actor_id = '11111111-1111-4111-8111-111111111111'$$, 'count:2'),

      -- ---------------- stats: my_games / my_tablemates ----------------
      -- Now: T1 ended (M, guest, P seated) · T2 open · T4 ended (guest + P; M managed it without a seat)
      --      T5 reopened (M, P, guest) · Q is in T2 and watched T4 without a seat.
      (300, 'P: only closed games he played count (T1, T4)',  'P', $$select count(*) from public.my_games$$, 'count:2'),
      (301, 'P: the reopened T5 doesn''t count (yet)',        'P', $$select count(*) from public.my_games where table_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'$$, 'count:0'),
      (302, 'P: the open T2 doesn''t count',                  'P', $$select count(*) from public.my_games where table_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$, 'count:0'),
      (303, 'P: his own nets only (−50, −10)',                'P', $$select count(*) from public.my_games having sum(final_net) = -60$$, 'count:2'),
      (304, 'P: my_games never shows other players'' rows',  'P', $$select count(*) from public.my_games where player_id in ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001')$$, 'count:0'),
      (305, 'M: managing T4 without a seat doesn''t count',   'M', $$select count(*) from public.my_games where table_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'$$, 'count:0'),
      (306, 'M: only T1 counts',                              'M', $$select count(*) from public.my_games$$, 'count:1'),
      (307, 'Q: watching T4 without a seat gives no games',   'Q', $$select count(*) from public.my_games$$, 'count:0'),
      (308, '…and no tablemates',                             'Q', $$select count(*) from public.my_tablemates$$, 'count:0'),
      (309, 'S sees no games',                                'S', $$select count(*) from public.my_games$$, 'count:0'),
      (310, 'S sees no tablemates',                           'S', $$select count(*) from public.my_tablemates$$, 'count:0'),
      (311, 'Anon cannot read my_games',                      'anon', $$select count(*) from public.my_games$$, 'deny'),
      (312, 'Anon cannot read my_tablemates',                 'anon', $$select count(*) from public.my_tablemates$$, 'deny'),
      (313, 'M''s tablemates: P only from T1 (−50), not T2/T5', 'M', $$select count(*) from public.my_tablemates where user_id = '22222222-2222-4222-8222-222222222222' and games = 1 and total_net = -50$$, 'count:1'),
      (314, 'M''s tablemates: the guest by name, marked as guest', 'M', $$select count(*) from public.my_tablemates where is_guest and user_id is null and name = 'אורח' and games = 1 and total_net = 20$$, 'count:1'),
      (315, 'P''s tablemates: guest "אורח" merged over T1 + T4', 'P', $$select count(*) from public.my_tablemates where is_guest and name = 'אורח' and games = 2 and total_net = 30$$, 'count:1'),
      (316, 'P''s tablemates: M only from closed shared games', 'P', $$select count(*) from public.my_tablemates where user_id = '11111111-1111-4111-8111-111111111111' and games = 1 and total_net = 30$$, 'count:1'),
      (317, 'P''s tablemates: Q isn''t listed (no closed game together)', 'P', $$select count(*) from public.my_tablemates where user_id = '44444444-4444-4444-8444-444444444444'$$, 'count:0'),
      (318, 'Tablemates never include yourself',              'P', $$select count(*) from public.my_tablemates where user_id = '22222222-2222-4222-8222-222222222222'$$, 'count:0'),
      (319, 'Tablemates show the profile name, not the per-table nickname', 'M', $$select count(*) from public.my_tablemates where user_id = '22222222-2222-4222-8222-222222222222' and name = 'פי החדש'$$, 'count:1'),
      (320, 'M closes T5 again',                              'M', $$select public.end_game('ffffffff-ffff-4fff-8fff-ffffffffffff', '{"f0000000-0000-4000-8000-000000000001": -50, "f0000000-0000-4000-8000-000000000002": 30, "f0000000-0000-4000-8000-000000000003": 20}')$$, 'ok'),
      (321, 'P: the re-closed T5 counts again (3 games)',      'P', $$select count(*) from public.my_games$$, 'count:3'),
      (322, 'P''s tablemate M: now 2 games (+30 −50)',         'P', $$select count(*) from public.my_tablemates where user_id = '11111111-1111-4111-8111-111111111111' and games = 2 and total_net = -20$$, 'count:1'),
      (323, 'Buy-ins are summed per game (P in T5: one of 50)', 'P', $$select count(*) from public.my_games where table_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff' and buy_in_total = 50 and buy_in_count = 1 and player_count = 3$$, 'count:1'),
      (324, 'Stats views: read-only for users, nothing for anon', 'P', $$select count(*) from (values ('public.my_games'), ('public.my_tablemates'), ('public.my_hidden_games')) v(t) where has_table_privilege('authenticated', t, 'INSERT, UPDATE, DELETE, TRUNCATE') or has_table_privilege('anon', t, 'SELECT') or not has_table_privilege('authenticated', t, 'SELECT')$$, 'count:0'),
      (325, 'All stats views run with the viewer''s rights', 'M', $$select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname in ('my_games', 'my_tablemates', 'my_hidden_games') and 'security_invoker=true' = any(reloptions)$$, 'count:3'),

      -- ---------------- hiding games from your own stats ----------------
      -- Now P has 3 closed games (T1, T4, T5); M has 2 (T1, T5).
      (330, 'P hides T4 (a test game)',                       'P', $$insert into public.hidden_games (table_id) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd')$$, 'ok'),
      (331, 'P''s stats: T4 is gone (2 games left)',          'P', $$select count(*) from public.my_games$$, 'count:2'),
      (332, 'P''s hidden list shows T4',                      'P', $$select count(*) from public.my_hidden_games where table_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' and final_net = -10 and status = 'ended'$$, 'count:1'),
      (333, 'P''s tablemates skip T4 (guest: T1 + T5 only)',  'P', $$select count(*) from public.my_tablemates where is_guest and name = 'אורח' and games = 2 and total_net = 40$$, 'count:1'),
      (334, 'P hides T5 too',                                 'P', $$insert into public.hidden_games (table_id) values ('ffffffff-ffff-4fff-8fff-ffffffffffff')$$, 'ok'),
      (335, 'M still has T5 in his own stats',                'M', $$select count(*) from public.my_games$$, 'count:2'),
      (336, '…and still counts P from T5 (2 games, −20)',     'M', $$select count(*) from public.my_tablemates where user_id = '22222222-2222-4222-8222-222222222222' and games = 2 and total_net = -20$$, 'count:1'),
      (337, 'Hiding deletes nothing: P''s T5 seat is still there', 'P', $$select count(*) from public.table_players where id = 'f0000000-0000-4000-8000-000000000002' and final_net = 30$$, 'count:1'),
      (338, 'A game can''t be hidden twice',                  'P', $$insert into public.hidden_games (table_id) values ('ffffffff-ffff-4fff-8fff-ffffffffffff')$$, 'error:23505'),
      (339, 'M can''t see P''s hidden list',                  'M', $$select count(*) from public.hidden_games$$, 'count:0'),
      (340, '…not through the view either',                  'M', $$select count(*) from public.my_hidden_games$$, 'count:0'),
      (341, 'M can''t hide a game for P',                     'M', $$insert into public.hidden_games (user_id, table_id) values ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$, 'deny'),
      (342, 'M can''t unhide P''s games',                     'M', $$delete from public.hidden_games where user_id = '22222222-2222-4222-8222-222222222222'$$, 'rows:0'),
      (343, 'S can''t hide a table he isn''t in',             'S', $$insert into public.hidden_games (table_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$, 'deny'),
      (344, 'Anon can''t read hidden lists',                  'anon', $$select count(*) from public.hidden_games$$, 'deny'),
      (345, 'Hidden rows can''t be edited (hide/unhide only)', 'P', $$update public.hidden_games set table_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'deny'),
      (346, 'P unhides T4',                                   'P', $$delete from public.hidden_games where table_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'$$, 'rows:1'),
      (347, '…T4 is back in P''s stats (T5 still hidden)',    'P', $$select count(*) from public.my_games where table_id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')$$, 'count:2'),
      (348, 'P''s own list now holds just T5',                'P', $$select count(*) from public.hidden_games where table_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'$$, 'count:1'),

      -- ---------------- "מחק": removing a game from your own stats for good ----------------
      -- Now P's stats: T1 + T4; T5 is hidden (can still come back).
      (350, 'P removes the hidden T5 for good',               'P', $$update public.hidden_games set permanent = true where table_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'$$, 'rows:1'),
      (351, '…it leaves the hidden list',                     'P', $$select count(*) from public.my_hidden_games where table_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'$$, 'count:0'),
      (352, '…and stays out of P''s stats',                   'P', $$select count(*) from public.my_games where table_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'$$, 'count:0'),
      (353, 'P can''t bring it back (no unhide)',             'P', $$delete from public.hidden_games where table_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'$$, 'rows:0'),
      (354, 'P can''t turn it back into "hidden"',           'P', $$update public.hidden_games set permanent = false where table_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'$$, 'deny'),
      (355, 'P removes T1 for good straight away',            'P', $$insert into public.hidden_games (table_id, permanent) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true)$$, 'ok'),
      (356, 'P''s stats: only T4 is left',                    'P', $$select count(*) from public.my_games$$, 'count:1'),
      (357, 'P''s tablemates: only from T4 (guest +10, no M)', 'P', $$select count(*) from public.my_tablemates where (is_guest and games = 1 and total_net = 10) or user_id = '11111111-1111-4111-8111-111111111111'$$, 'count:1'),
      (358, 'Nothing changes for M: still 2 games',           'M', $$select count(*) from public.my_games$$, 'count:2'),
      (359, '…and M still counts P from T1 + T5',             'M', $$select count(*) from public.my_tablemates where user_id = '22222222-2222-4222-8222-222222222222' and games = 2 and total_net = -20$$, 'count:1'),
      (360, 'The game itself isn''t deleted (table + P''s seat)', 'P', $$select count(*) from public.table_players where id in ('a0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000002') and final_net is not null$$, 'count:2'),
      (361, 'M can''t remove games for P',                    'M', $$update public.hidden_games set permanent = true where user_id = '22222222-2222-4222-8222-222222222222'$$, 'rows:0'),
      (362, 'Only the permanent flag can change',             'P', $$update public.hidden_games set hidden_at = now() where table_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'deny'),

      -- ---------------- "עיגול סכומים" (rounding) ----------------
      -- T2 (Q's) is still open; T1 has ended.
      (370, 'New tables round to 10 ₪ by default',            'M', $$select count(*) from public.poker_tables where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and rounding = 10$$, 'count:1'),
      (371, 'The manager (Q) sets rounding to 50 ₪',          'Q', $$update public.poker_tables set rounding = 50 where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$, 'rows:1'),
      (372, 'Only 1 / 5 / 10 / 50 are allowed',               'Q', $$update public.poker_tables set rounding = 7 where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$, 'error:23514'),
      (373, 'A player can''t change the rounding',            'P', $$update public.poker_tables set rounding = 1 where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$, 'rows:0'),
      (374, 'Q makes P co-manager of T2',                     'Q', $$update public.table_members set is_co_manager = true where table_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and user_id = '22222222-2222-4222-8222-222222222222'$$, 'rows:1'),
      (375, 'A co-manager can''t change the rounding',        'P', $$update public.poker_tables set rounding = 1 where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$, 'deny'),
      (376, '…but can still change the buy-in amounts',       'P', $$update public.poker_tables set initial_buy_in = 80 where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$, 'rows:1'),
      (377, 'Rounding is locked after the game ended',        'M', $$update public.poker_tables set rounding = 50 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'deny'),
      (378, 'Log: Q changed the rounding to 50',              'P', $$select count(*) from public.table_log where table_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and action = 'rounding_changed' and actor_id = '44444444-4444-4444-8444-444444444444' and (details ->> 'new')::int = 50$$, 'count:1'),

      -- ---------------- cash paid into the pot (T2) ----------------
      -- T2 is open; Q manages it, P is its co-manager (374), seats: Q, P. Nobody holds the cash.
      (380, 'Q records cash: P paid 200 into the pot (T2)',          'Q', $$insert into public.cash_payments (id, table_id, payer_id, amount) values ('ca000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b0000000-0000-4000-8000-000000000002', 200)$$, 'ok'),
      (381, 'Co-manager P records cash too (Q paid 50)',             'P', $$insert into public.cash_payments (id, table_id, payer_id, amount) values ('ca000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b0000000-0000-4000-8000-000000000001', 50)$$, 'ok'),
      (382, 'C joins T2',                                            'C', $$insert into public.table_members (table_id, invite_code) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'code-t2')$$, 'ok'),
      (383, 'A plain member (C) cannot record cash',                 'C', $$insert into public.cash_payments (table_id, payer_id, amount) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b0000000-0000-4000-8000-000000000002', 30)$$, 'deny'),
      (384, 'Everyone at the table sees the cash (C)',               'C', $$select count(*) from public.cash_payments where table_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$, 'count:2'),
      (385, 'S cannot see any cash',                                 'S', $$select count(*) from public.cash_payments$$, 'count:0'),
      (386, 'Anon cannot read cash',                                 'anon', $$select count(*) from public.cash_payments$$, 'deny'),
      (387, 'Cash must be a positive amount',                        'Q', $$insert into public.cash_payments (table_id, payer_id, amount) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b0000000-0000-4000-8000-000000000002', 0)$$, 'error:23514'),
      (388, 'The payer must sit at the same table',                  'Q', $$insert into public.cash_payments (table_id, payer_id, amount) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'a0000000-0000-4000-8000-000000000001', 30)$$, 'error:23503'),
      (389, 'Nobody holds the cash: no holder column',               'M', $$select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'cash_payments' and column_name = 'holder_id'$$, 'count:0'),
      (390, 'Nobody records cash in someone else''s name',           'Q', $$insert into public.cash_payments (table_id, payer_id, amount, created_by) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b0000000-0000-4000-8000-000000000002', 30, '11111111-1111-4111-8111-111111111111')$$, 'deny'),
      (391, 'Cash can''t be edited (delete + add only)',             'Q', $$update public.cash_payments set amount = 1 where id = 'ca000000-0000-4000-8000-000000000001'$$, 'deny'),
      (392, 'C cannot delete cash',                                  'C', $$delete from public.cash_payments where table_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$, 'rows:0'),
      (393, 'No cash at an ended table (T1)',                        'M', $$insert into public.cash_payments (table_id, payer_id, amount) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000003', 30)$$, 'deny'),
      (394, 'Q deletes P''s 200',                                    'Q', $$delete from public.cash_payments where id = 'ca000000-0000-4000-8000-000000000001'$$, 'rows:1'),
      (395, 'Log: 2 cash entries added (Q, P) and 1 deleted (Q)',    'P', $$select count(*) from public.table_log where table_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and ((action = 'cash_added' and actor_id in ('44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222') and (details ->> 'amount')::int in (200, 50)) or (action = 'cash_removed' and actor_id = '44444444-4444-4444-8444-444444444444' and (details ->> 'amount')::int = 200))$$, 'count:3'),
      (396, 'The log never names a holder',                          'P', $$select count(*) from public.table_log where table_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and action like 'cash_%' and (details ? 'holder' or details ? 'holder_id')$$, 'count:0'),
      (397, 'Q records P paying 30 again',                           'Q', $$insert into public.cash_payments (id, table_id, payer_id, amount) values ('ca000000-0000-4000-8000-000000000003', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b0000000-0000-4000-8000-000000000002', 30)$$, 'ok'),
      (398, 'Q removes P''s seat',                                   'Q', $$delete from public.table_players where id = 'b0000000-0000-4000-8000-000000000002'$$, 'rows:1'),
      (399, '…P''s cash goes with it, logged once as the seat removal', 'Q', $$select (select count(*) from public.cash_payments where payer_id = 'b0000000-0000-4000-8000-000000000002') + (select count(*) from public.table_log where table_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and action = 'cash_removed')$$, 'count:1'),
      (400, 'cash_payments: no update for users, nothing for anon',  'M', $$select count(*) from (values (1)) v(x) where has_table_privilege('authenticated', 'public.cash_payments', 'UPDATE') or has_table_privilege('anon', 'public.cash_payments', 'SELECT') or not has_table_privilege('authenticated', 'public.cash_payments', 'SELECT')$$, 'count:0'),

      -- ---------------- "שווי צ'יפ" (chip value) and "לא כאן" (T2) ----------------
      -- T2 is open (Q manages it, P is its co-manager, C a plain member who isn't seated; Q's seat is left). T1 has ended.
      (410, 'Tables start with a chip worth 1 ₪',                    'Q', $$select count(*) from public.poker_tables where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and chip_value = 1$$, 'count:1'),
      (411, 'The manager (Q) sets a chip to 0.5 ₪',                  'Q', $$update public.poker_tables set chip_value = 0.5 where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$, 'rows:1'),
      (412, 'A co-manager (P) can change it too (0.25 ₪)',           'P', $$update public.poker_tables set chip_value = 0.25 where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$, 'rows:1'),
      (413, 'A chip is worth 0.01 to 1000 ₪',                        'Q', $$update public.poker_tables set chip_value = 0 where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$, 'error:23514'),
      (414, 'A plain member (C) can''t change the chip value',       'C', $$update public.poker_tables set chip_value = 2 where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$, 'rows:0'),
      (415, 'The chip value is locked after the game ended (T1)',    'M', $$update public.poker_tables set chip_value = 0.5 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'deny'),
      (416, 'Log: chip value changed twice (Q, then P)',             'C', $$select count(*) from public.table_log where table_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and action = 'chip_value_changed' and ((actor_id = '44444444-4444-4444-8444-444444444444' and (details ->> 'new')::numeric = 0.5) or (actor_id = '22222222-2222-4222-8222-222222222222' and (details ->> 'new')::numeric = 0.25))$$, 'count:2'),
      (417, 'Q marks his own seat "לא כאן"',                         'Q', $$update public.table_players set absent = true where id = 'b0000000-0000-4000-8000-000000000001'$$, 'rows:1'),
      (418, 'A plain member (C) can''t mark anyone',                 'C', $$update public.table_players set absent = false where id = 'b0000000-0000-4000-8000-000000000001'$$, 'rows:0'),
      (419, 'No "לא כאן" marks after the game ended (T1)',           'M', $$update public.table_players set absent = true where id = 'a0000000-0000-4000-8000-000000000003'$$, 'rows:0'),
      (420, 'Log: Q was marked "לא כאן"',                            'C', $$select count(*) from public.table_log where table_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and action = 'presence_changed' and (details ->> 'absent')::boolean$$, 'count:1'),
      (421, 'A member seating himself can''t set "לא כאן"',          'C', $$insert into public.table_players (table_id, user_id, seat, absent) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '55555555-5555-4555-8555-555555555555', 5, true)$$, 'deny'),
      (422, '…but can still take his own seat without it',           'C', $$insert into public.table_players (table_id, user_id, seat) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '55555555-5555-4555-8555-555555555555', 5)$$, 'ok'),

      -- ---------------- hidden characters in names ----------------
      -- chr(8238) = right-to-left override, chr(8203) = zero-width space, chr(8294) = isolate, chr(8205) = zero-width joiner (kept: emoji need it).
      (430, 'P''s name with a direction override is saved clean',    'P', $$update public.profiles set display_name = 'טו' || chr(8238) || 'מר' where id = '22222222-2222-4222-8222-222222222222'$$, 'rows:1'),
      (431, '…stored as plain "טומר"',                              'P', $$select count(*) from public.profiles where id = '22222222-2222-4222-8222-222222222222' and display_name = 'טומר'$$, 'count:1'),
      (440, 'A new user whose Google name is only hidden characters gets "שחקן"', 'postgres', $$insert into auth.users (id, email, aud, role, raw_user_meta_data) values ('66666666-6666-4666-8666-666666666666', 'h@test.local', 'authenticated', 'authenticated', json_build_object('full_name', chr(8238) || chr(8203))::jsonb)$$, 'ok'),
      (441, '…and can sign in (profile created as "שחקן")', 'postgres', $$select count(*) from public.profiles where id = '66666666-6666-4666-8666-666666666666' and display_name = 'שחקן'$$, 'count:1'),
      (432, 'A name made only of hidden characters is rejected (like a blank one)', 'P', $$update public.profiles set display_name = chr(8203) || chr(8238) where id = '22222222-2222-4222-8222-222222222222'$$, 'error:23514'),
      (433, 'Per-table names lose zero-width spaces',               'Q', $$update public.table_players set nickname = 'מנהל' || chr(8203) || ' 2' where id = 'b0000000-0000-4000-8000-000000000001'$$, 'rows:1'),
      (434, '…stored as "מנהל 2"',                                  'Q', $$select count(*) from public.table_players where id = 'b0000000-0000-4000-8000-000000000001' and nickname = 'מנהל 2'$$, 'count:1'),
      (435, 'A guest named only with hidden characters is rejected', 'Q', $$insert into public.table_players (table_id, nickname, color, seat) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', chr(8203) || chr(8294), 1, 7)$$, 'error:23514'),
      (436, 'Table names are cleaned too',                          'Q', $$update public.poker_tables set name = chr(8294) || 'שישי' || chr(8297) where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$, 'rows:1'),
      (437, '…stored as "שישי"',                                    'Q', $$select count(*) from public.poker_tables where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and name = 'שישי'$$, 'count:1'),
      (438, 'Emoji joined with ZWJ stay whole',                     'Q', $$update public.table_players set nickname = chr(128104) || chr(8205) || chr(128105) where id = 'b0000000-0000-4000-8000-000000000001'$$, 'rows:1'),
      (439, '…stored with the joiner',                              'Q', $$select count(*) from public.table_players where id = 'b0000000-0000-4000-8000-000000000001' and nickname = chr(128104) || chr(8205) || chr(128105)$$, 'count:1'),

      -- ---------------- T6: stored transfers, phone numbers for Bit, "שולם ✓" ----------------
      -- M manages T6. Results: M +100, Q +50, P −100, C −50 (C paid 50 in cash).
      -- Transfers: P → M 100 (bank transfer), C → Q 50 (all cash).
      (450, 'M opens T6',                                            'M', $$insert into public.poker_tables (id, invite_code) values ('76767676-7676-4676-8676-767676767676', 'code-t6')$$, 'ok'),
      (451, 'P joins T6',                                            'P', $$insert into public.table_members (table_id, invite_code) values ('76767676-7676-4676-8676-767676767676', 'code-t6')$$, 'ok'),
      (452, 'C joins T6',                                            'C', $$insert into public.table_members (table_id, invite_code) values ('76767676-7676-4676-8676-767676767676', 'code-t6')$$, 'ok'),
      (453, 'Q joins T6',                                            'Q', $$insert into public.table_members (table_id, invite_code) values ('76767676-7676-4676-8676-767676767676', 'code-t6')$$, 'ok'),
      (454, 'M seats M, P, C and Q in T6',                           'M', $$insert into public.table_players (id, table_id, user_id, seat) values ('76000000-0000-4000-8000-000000000001', '76767676-7676-4676-8676-767676767676', '11111111-1111-4111-8111-111111111111', 0), ('76000000-0000-4000-8000-000000000002', '76767676-7676-4676-8676-767676767676', '22222222-2222-4222-8222-222222222222', 1), ('76000000-0000-4000-8000-000000000003', '76767676-7676-4676-8676-767676767676', '55555555-5555-4555-8555-555555555555', 2), ('76000000-0000-4000-8000-000000000004', '76767676-7676-4676-8676-767676767676', '44444444-4444-4444-8444-444444444444', 3)$$, 'ok'),
      (455, 'M records that C paid 50 in cash',                      'M', $$insert into public.cash_payments (table_id, payer_id, amount) values ('76767676-7676-4676-8676-767676767676', '76000000-0000-4000-8000-000000000003', 50)$$, 'ok'),
      (456, 'M saves his phone for Bit',                             'M', $$insert into public.profile_phones (user_id, phone) values ('11111111-1111-4111-8111-111111111111', '0521234567')$$, 'ok'),
      (457, 'Q saves his phone',                                     'Q', $$insert into public.profile_phones (phone) values ('0547654321')$$, 'ok'),
      (458, 'P saves his phone',                                     'P', $$insert into public.profile_phones (phone) values ('0501112222')$$, 'ok'),
      (459, 'Only an Israeli mobile number is accepted',             'P', $$update public.profile_phones set phone = '031234567' where user_id = '22222222-2222-4222-8222-222222222222'$$, 'error:23514'),
      (460, 'P cannot save a phone in someone else''s name',         'P', $$insert into public.profile_phones (user_id, phone) values ('33333333-3333-4333-8333-333333333333', '0509999999')$$, 'deny'),
      (461, 'P cannot change M''s phone',                            'P', $$update public.profile_phones set phone = '0509999999' where user_id = '11111111-1111-4111-8111-111111111111'$$, 'rows:0'),
      (462, 'P cannot delete M''s phone',                            'P', $$delete from public.profile_phones where user_id = '11111111-1111-4111-8111-111111111111'$$, 'rows:0'),
      (463, 'Before the game is closed, P can''t see M''s phone',    'P', $$select count(*) from public.profile_phones where user_id = '11111111-1111-4111-8111-111111111111'$$, 'count:0'),
      (464, 'The manager can''t see the players'' phones',           'M', $$select count(*) from public.profile_phones where user_id <> '11111111-1111-4111-8111-111111111111'$$, 'count:0'),
      (465, 'The phone is not part of profiles',                     'M', $$select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name ilike '%phone%'$$, 'count:0'),

      (470, 'A player (P) can''t close T6 with transfers',           'P', $$select public.end_game('76767676-7676-4676-8676-767676767676', '{"76000000-0000-4000-8000-000000000001": 100, "76000000-0000-4000-8000-000000000002": -100, "76000000-0000-4000-8000-000000000003": -50, "76000000-0000-4000-8000-000000000004": 50}', '[{"from": "76000000-0000-4000-8000-000000000002", "to": "76000000-0000-4000-8000-000000000001", "amount": 100}]')$$, 'deny'),
      (471, 'Transfers that don''t add up are refused',              'M', $$select public.end_game('76767676-7676-4676-8676-767676767676', '{"76000000-0000-4000-8000-000000000001": 100, "76000000-0000-4000-8000-000000000002": -100, "76000000-0000-4000-8000-000000000003": -50, "76000000-0000-4000-8000-000000000004": 50}', '[{"from": "76000000-0000-4000-8000-000000000002", "to": "76000000-0000-4000-8000-000000000001", "amount": 60}, {"from": "76000000-0000-4000-8000-000000000003", "to": "76000000-0000-4000-8000-000000000004", "amount": 50, "cash": 50}]')$$, 'error:23514'),
      (472, 'A made-up transfer to a loser (to leak a phone) is refused', 'M', $$select public.end_game('76767676-7676-4676-8676-767676767676', '{"76000000-0000-4000-8000-000000000001": 100, "76000000-0000-4000-8000-000000000002": -100, "76000000-0000-4000-8000-000000000003": -50, "76000000-0000-4000-8000-000000000004": 50}', '[{"from": "76000000-0000-4000-8000-000000000002", "to": "76000000-0000-4000-8000-000000000001", "amount": 100}, {"from": "76000000-0000-4000-8000-000000000003", "to": "76000000-0000-4000-8000-000000000004", "amount": 70, "cash": 50}, {"from": "76000000-0000-4000-8000-000000000004", "to": "76000000-0000-4000-8000-000000000003", "amount": 20}]')$$, 'error:23514'),
      (473, 'More cash than was recorded is refused',                'M', $$select public.end_game('76767676-7676-4676-8676-767676767676', '{"76000000-0000-4000-8000-000000000001": 100, "76000000-0000-4000-8000-000000000002": -100, "76000000-0000-4000-8000-000000000003": -50, "76000000-0000-4000-8000-000000000004": 50}', '[{"from": "76000000-0000-4000-8000-000000000002", "to": "76000000-0000-4000-8000-000000000001", "amount": 100, "cash": 100}, {"from": "76000000-0000-4000-8000-000000000003", "to": "76000000-0000-4000-8000-000000000004", "amount": 50, "cash": 50}]')$$, 'error:23514'),
      (474, '…none of those left anything behind',                   'M', $$select (select count(*) from public.settlement_transfers where table_id = '76767676-7676-4676-8676-767676767676') + (select count(*) from public.poker_tables where id = '76767676-7676-4676-8676-767676767676' and status = 'ended')$$, 'count:0'),
      (475, 'M closes T6 with the real transfers',                   'M', $$select public.end_game('76767676-7676-4676-8676-767676767676', '{"76000000-0000-4000-8000-000000000001": 100, "76000000-0000-4000-8000-000000000002": -100, "76000000-0000-4000-8000-000000000003": -50, "76000000-0000-4000-8000-000000000004": 50}', '[{"from": "76000000-0000-4000-8000-000000000002", "to": "76000000-0000-4000-8000-000000000001", "amount": 100}, {"from": "76000000-0000-4000-8000-000000000003", "to": "76000000-0000-4000-8000-000000000004", "amount": 50, "cash": 50}]')$$, 'ok'),
      (476, 'Everyone at the table sees the 2 transfers (C)',        'C', $$select count(*) from public.settlement_transfers where table_id = '76767676-7676-4676-8676-767676767676'$$, 'count:2'),
      (477, 'S can''t see any transfers',                            'S', $$select count(*) from public.settlement_transfers$$, 'count:0'),
      (478, 'Anon can''t read transfers',                            'anon', $$select count(*) from public.settlement_transfers$$, 'deny'),
      (479, 'Nobody adds transfers to a closed table (M)',           'M', $$insert into public.settlement_transfers (table_id, position, from_player, to_player, amount) values ('76767676-7676-4676-8676-767676767676', 9, '76000000-0000-4000-8000-000000000003', '76000000-0000-4000-8000-000000000001', 20)$$, 'deny'),

      (480, 'P has to transfer 100 to M: P sees M''s phone',         'P', $$select count(*) from public.profile_phones where user_id = '11111111-1111-4111-8111-111111111111' and phone = '0521234567'$$, 'count:1'),
      (481, 'P doesn''t owe Q: P can''t see Q''s phone',             'P', $$select count(*) from public.profile_phones where user_id = '44444444-4444-4444-8444-444444444444'$$, 'count:0'),
      (482, 'C paid Q all in cash: C can''t see Q''s phone',         'C', $$select count(*) from public.profile_phones where user_id = '44444444-4444-4444-8444-444444444444'$$, 'count:0'),
      (483, 'C doesn''t owe M: C can''t see M''s phone',             'C', $$select count(*) from public.profile_phones where user_id = '11111111-1111-4111-8111-111111111111'$$, 'count:0'),
      (484, 'The receiver (M) can''t see the payer''s phone',        'M', $$select count(*) from public.profile_phones where user_id = '22222222-2222-4222-8222-222222222222'$$, 'count:0'),
      (485, 'Q sees only his own phone',                             'Q', $$select count(*) from public.profile_phones where user_id <> '44444444-4444-4444-8444-444444444444'$$, 'count:0'),
      (486, 'A player of another game (Q, with P in T2) can''t see P''s phone', 'Q', $$select count(*) from public.profile_phones where user_id = '22222222-2222-4222-8222-222222222222'$$, 'count:0'),
      (487, 'S (stranger) sees no phones',                           'S', $$select count(*) from public.profile_phones$$, 'count:0'),
      (488, 'Anon can''t read phones',                               'anon', $$select count(*) from public.profile_phones$$, 'deny'),
      (489, 'Phones never reach the change log',                     'postgres', $$select count(*) from public.table_log where details::text like '%0521234567%' or details::text like '%0547654321%' or details::text like '%0501112222%'$$, 'count:0'),

      (490, 'P (payer) marks P → M as paid',                         'P', $$update public.settlement_transfers set paid_at = now() where table_id = '76767676-7676-4676-8676-767676767676' and from_player = '76000000-0000-4000-8000-000000000002'$$, 'rows:1'),
      (491, '…the database recorded that P marked it',               'C', $$select count(*) from public.settlement_transfers where from_player = '76000000-0000-4000-8000-000000000002' and paid_at is not null and paid_by = '22222222-2222-4222-8222-222222222222'$$, 'count:1'),
      (492, 'C (not in that transfer) can''t change it',             'C', $$update public.settlement_transfers set paid_at = null where from_player = '76000000-0000-4000-8000-000000000002'$$, 'rows:0'),
      (493, 'S can''t change any transfer',                          'S', $$update public.settlement_transfers set paid_at = now()$$, 'rows:0'),
      (494, 'Nobody writes who marked it (P)',                       'P', $$update public.settlement_transfers set paid_by = '11111111-1111-4111-8111-111111111111' where from_player = '76000000-0000-4000-8000-000000000002'$$, 'deny'),
      (495, 'Nobody changes the amount (P)',                         'P', $$update public.settlement_transfers set amount = 1 where from_player = '76000000-0000-4000-8000-000000000002'$$, 'deny'),
      (496, 'A player can''t add a transfer',                        'P', $$insert into public.settlement_transfers (table_id, position, from_player, to_player, amount) values ('76767676-7676-4676-8676-767676767676', 8, '76000000-0000-4000-8000-000000000003', '76000000-0000-4000-8000-000000000002', 20)$$, 'deny'),
      (497, 'A player can''t delete transfers',                      'P', $$delete from public.settlement_transfers where table_id = '76767676-7676-4676-8676-767676767676'$$, 'rows:0'),
      (498, 'Q (receiver) marks C → Q as paid',                      'Q', $$update public.settlement_transfers set paid_at = now() where from_player = '76000000-0000-4000-8000-000000000003'$$, 'rows:1'),
      (499, 'M (manager) undoes P → M',                              'M', $$update public.settlement_transfers set paid_at = null where from_player = '76000000-0000-4000-8000-000000000002'$$, 'rows:1'),
      (500, '…and the mark is cleared',                              'P', $$select count(*) from public.settlement_transfers where from_player = '76000000-0000-4000-8000-000000000002' and (paid_at is not null or paid_by is not null)$$, 'count:0'),
      (501, 'Log: 2 marked paid (P, Q), 1 undone (M)',               'C', $$select count(*) from public.table_log where table_id = '76767676-7676-4676-8676-767676767676' and ((action = 'transfer_paid' and actor_id in ('22222222-2222-4222-8222-222222222222', '44444444-4444-4444-8444-444444444444')) or (action = 'transfer_unpaid' and actor_id = '11111111-1111-4111-8111-111111111111'))$$, 'count:3'),
      (502, 'transfers + phones: no anon access, no insert of paid marks', 'M', $$select count(*) from (values (1)) v(x) where has_table_privilege('anon', 'public.settlement_transfers', 'SELECT') or has_table_privilege('anon', 'public.profile_phones', 'SELECT') or has_column_privilege('authenticated', 'public.settlement_transfers', 'paid_at', 'INSERT') or has_column_privilege('authenticated', 'public.settlement_transfers', 'paid_by', 'UPDATE')$$, 'count:0'),
      (503, 'M reopens T6 for corrections',                          'M', $$update public.poker_tables set status = 'playing' where id = '76767676-7676-4676-8676-767676767676'$$, 'rows:1'),
      (504, '…the stored transfers are gone',                        'M', $$select count(*) from public.settlement_transfers where table_id = '76767676-7676-4676-8676-767676767676'$$, 'count:0'),
      (505, '…so P no longer sees M''s phone',                       'P', $$select count(*) from public.profile_phones where user_id = '11111111-1111-4111-8111-111111111111'$$, 'count:0'),
      (506, 'An old-style close (no transfers) still works',         'M', $$select public.end_game('76767676-7676-4676-8676-767676767676', '{"76000000-0000-4000-8000-000000000001": 100, "76000000-0000-4000-8000-000000000002": -100, "76000000-0000-4000-8000-000000000003": -50, "76000000-0000-4000-8000-000000000004": 50}')$$, 'ok'),
      (507, '…and shows no phones',                                  'P', $$select count(*) from public.profile_phones where user_id <> '22222222-2222-4222-8222-222222222222'$$, 'count:0'),
      (508, 'P deletes his own phone',                               'P', $$delete from public.profile_phones where user_id = '22222222-2222-4222-8222-222222222222'$$, 'rows:1'),

      -- ---------------- T7: a player who leaves gives up their seat ----------------
      -- M manages T7: M, P, C, Q in seats 0-3, game on. P leaves; a guest takes his seat; P comes back elsewhere.
      (516, 'M opens T7',                                            'M', $$insert into public.poker_tables (id, invite_code) values ('77777777-7777-4777-8777-777777777777', 'code-t7')$$, 'ok'),
      (517, 'P joins T7',                                            'P', $$insert into public.table_members (table_id, invite_code) values ('77777777-7777-4777-8777-777777777777', 'code-t7')$$, 'ok'),
      (518, 'C joins T7',                                           'C', $$insert into public.table_members (table_id, invite_code) values ('77777777-7777-4777-8777-777777777777', 'code-t7')$$, 'ok'),
      (519, 'Q joins T7',                                           'Q', $$insert into public.table_members (table_id, invite_code) values ('77777777-7777-4777-8777-777777777777', 'code-t7')$$, 'ok'),
      (522, 'M seats M, P, C, Q in seats 0-3',                       'M', $$insert into public.table_players (id, table_id, user_id, seat) values ('77000000-0000-4000-8000-000000000001', '77777777-7777-4777-8777-777777777777', '11111111-1111-4111-8111-111111111111', 0), ('77000000-0000-4000-8000-000000000002', '77777777-7777-4777-8777-777777777777', '22222222-2222-4222-8222-222222222222', 1), ('77000000-0000-4000-8000-000000000003', '77777777-7777-4777-8777-777777777777', '55555555-5555-4555-8555-555555555555', 2), ('77000000-0000-4000-8000-000000000004', '77777777-7777-4777-8777-777777777777', '44444444-4444-4444-8444-444444444444', 3)$$, 'ok'),
      (523, 'M starts the game',                                     'M', $$update public.poker_tables set status = 'playing' where id = '77777777-7777-4777-8777-777777777777'$$, 'rows:1'),
      (524, 'P leaves ("הפסיד הכל") and gives up seat 1',            'M', $$update public.table_players set out_kind = 'lost_all', out_chips = 0, seat = null where id = '77000000-0000-4000-8000-000000000002'$$, 'rows:1'),
      (525, 'A player who is still playing always has a seat',      'M', $$update public.table_players set seat = null where id = '77000000-0000-4000-8000-000000000003'$$, 'error:23514'),
      (526, 'A new player (guest) takes the free seat 1',            'M', $$insert into public.table_players (table_id, nickname, color, seat) values ('77777777-7777-4777-8777-777777777777', 'חדש', 4, 1)$$, 'ok'),
      (527, 'Leaving is logged as an exit, not as a seat move',      'P', $$select (select count(*) from public.table_log where table_id = '77777777-7777-4777-8777-777777777777' and action = 'player_out' and details ->> 'player_id' = '77000000-0000-4000-8000-000000000002') * 10 + (select count(*) from public.table_log where table_id = '77777777-7777-4777-8777-777777777777' and action = 'player_moved')$$, 'count:10'),
      (528, 'P can''t take a seat back by himself',                  'P', $$update public.table_players set out_kind = null, out_chips = null, seat = 4 where id = '77000000-0000-4000-8000-000000000002'$$, 'rows:0'),
      (529, 'Coming back needs a seat',                              'M', $$update public.table_players set out_kind = null, out_chips = null where id = '77000000-0000-4000-8000-000000000002'$$, 'error:23514'),
      (530, 'Coming back can''t take a seat that''s taken',          'M', $$update public.table_players set out_kind = null, out_chips = null, seat = 1 where id = '77000000-0000-4000-8000-000000000002'$$, 'error:23505'),
      (531, 'M brings P back in the free seat 4',                    'M', $$update public.table_players set out_kind = null, out_chips = null, seat = 4 where id = '77000000-0000-4000-8000-000000000002'$$, 'rows:1'),
      (532, '…logged as back in the game',                           'C', $$select count(*) from public.table_log where table_id = '77777777-7777-4777-8777-777777777777' and action = 'player_back' and details ->> 'player_id' = '77000000-0000-4000-8000-000000000002'$$, 'count:1'),
      (533, 'A member can''t seat himself with no seat',             'S', $$insert into public.table_players (table_id, user_id, seat) values ('77777777-7777-4777-8777-777777777777', '33333333-3333-4333-8333-333333333333', null)$$, 'deny'),

      -- ---------------- T8: a closed game stays open for settling until everyone paid ----------------
      -- M manages T8: M +100, P −60, Q −40. Transfers: P → M 60, Q → M 40. M's phone was saved in T6.
      (540, 'M opens T8',                                            'M', $$insert into public.poker_tables (id, invite_code) values ('88888888-8888-4888-8888-888888888888', 'code-t8')$$, 'ok'),
      (541, 'P joins T8',                                            'P', $$insert into public.table_members (table_id, invite_code) values ('88888888-8888-4888-8888-888888888888', 'code-t8')$$, 'ok'),
      (542, 'Q joins T8',                                            'Q', $$insert into public.table_members (table_id, invite_code) values ('88888888-8888-4888-8888-888888888888', 'code-t8')$$, 'ok'),
      (543, 'M seats M, P, Q',                                       'M', $$insert into public.table_players (id, table_id, user_id, seat) values ('88000000-0000-4000-8000-000000000001', '88888888-8888-4888-8888-888888888888', '11111111-1111-4111-8111-111111111111', 0), ('88000000-0000-4000-8000-000000000002', '88888888-8888-4888-8888-888888888888', '22222222-2222-4222-8222-222222222222', 1), ('88000000-0000-4000-8000-000000000003', '88888888-8888-4888-8888-888888888888', '44444444-4444-4444-8444-444444444444', 2)$$, 'ok'),
      (544, 'M closes T8 with two transfers',                        'M', $$select public.end_game('88888888-8888-4888-8888-888888888888', '{"88000000-0000-4000-8000-000000000001": 100, "88000000-0000-4000-8000-000000000002": -60, "88000000-0000-4000-8000-000000000003": -40}', '[{"from": "88000000-0000-4000-8000-000000000002", "to": "88000000-0000-4000-8000-000000000001", "amount": 60}, {"from": "88000000-0000-4000-8000-000000000003", "to": "88000000-0000-4000-8000-000000000001", "amount": 40}]')$$, 'ok'),
      (545, 'The game ended, the settling is still open',            'P', $$select count(*) from public.poker_tables where id = '88888888-8888-4888-8888-888888888888' and status = 'ended' and settled_at is null$$, 'count:1'),
      (546, '…and it counts in P''s stats right away',               'P', $$select count(*) from public.my_games where table_id = '88888888-8888-4888-8888-888888888888' and final_net = -60$$, 'count:1'),
      (547, 'M makes Q a co-manager of T8',                          'M', $$update public.table_members set is_co_manager = true where table_id = '88888888-8888-4888-8888-888888888888' and user_id = '44444444-4444-4444-8444-444444444444'$$, 'rows:1'),
      (548, 'A co-manager can''t close the settling by hand',        'Q', $$update public.poker_tables set settled_at = now(), settled_manually = true where id = '88888888-8888-4888-8888-888888888888'$$, 'deny'),
      (549, 'A player can''t close it either',                       'P', $$update public.poker_tables set settled_at = now() where id = '88888888-8888-4888-8888-888888888888'$$, 'rows:0'),
      (550, 'P owes M and hasn''t paid: P sees M''s phone',          'P', $$select count(*) from public.profile_phones where user_id = '11111111-1111-4111-8111-111111111111'$$, 'count:1'),
      (551, 'P marks P → M paid',                                    'P', $$update public.settlement_transfers set paid_at = now() where table_id = '88888888-8888-4888-8888-888888888888' and from_player = '88000000-0000-4000-8000-000000000002'$$, 'rows:1'),
      (552, '…paid: P no longer sees M''s phone',                    'P', $$select count(*) from public.profile_phones where user_id = '11111111-1111-4111-8111-111111111111'$$, 'count:0'),
      (553, '1 of 2 paid: the settling is still open',               'M', $$select count(*) from public.poker_tables where id = '88888888-8888-4888-8888-888888888888' and settled_at is null$$, 'count:1'),
      (554, 'Q marks Q → M paid (the last one)',                     'Q', $$update public.settlement_transfers set paid_at = now() where table_id = '88888888-8888-4888-8888-888888888888' and from_player = '88000000-0000-4000-8000-000000000003'$$, 'rows:1'),
      (555, '…everyone paid: the table closed by itself',            'M', $$select count(*) from public.poker_tables where id = '88888888-8888-4888-8888-888888888888' and settled_at is not null and not settled_manually$$, 'count:1'),
      (556, 'Log: the settling closed (not by hand)',                'P', $$select count(*) from public.table_log where table_id = '88888888-8888-4888-8888-888888888888' and action = 'game_settled' and details ->> 'manual' = 'false'$$, 'count:1'),
      (557, 'M undoes Q → M',                                        'M', $$update public.settlement_transfers set paid_at = null where table_id = '88888888-8888-4888-8888-888888888888' and from_player = '88000000-0000-4000-8000-000000000003'$$, 'rows:1'),
      (558, '…the settling opens again (it closed by itself)',       'Q', $$select count(*) from public.poker_tables where id = '88888888-8888-4888-8888-888888888888' and settled_at is null$$, 'count:1'),
      (559, 'M closes the settling by hand',                         'M', $$update public.poker_tables set settled_at = now(), settled_manually = true where id = '88888888-8888-4888-8888-888888888888'$$, 'rows:1'),
      (560, 'P undoes his mark',                                     'P', $$update public.settlement_transfers set paid_at = null where table_id = '88888888-8888-4888-8888-888888888888' and from_player = '88000000-0000-4000-8000-000000000002'$$, 'rows:1'),
      (561, '…a manual close stays closed',                          'M', $$select count(*) from public.poker_tables where id = '88888888-8888-4888-8888-888888888888' and settled_at is not null and settled_manually$$, 'count:1'),
      (562, '…and the phone stays hidden once the settling is closed', 'P', $$select count(*) from public.profile_phones where user_id = '11111111-1111-4111-8111-111111111111'$$, 'count:0'),
      (563, 'Log: closed by hand, by M',                             'P', $$select count(*) from public.table_log where table_id = '88888888-8888-4888-8888-888888888888' and action = 'game_settled' and details ->> 'manual' = 'true' and actor_id = '11111111-1111-4111-8111-111111111111'$$, 'count:1'),
      (564, 'Only an ended game can be settled (T7 is on)',          'M', $$update public.poker_tables set settled_at = now() where id = '77777777-7777-4777-8777-777777777777'$$, 'error:23514'),
      (565, 'A game closed with no transfers is settled right away (T6)', 'M', $$select count(*) from public.poker_tables where id = '76767676-7676-4676-8676-767676767676' and status = 'ended' and settled_at is not null$$, 'count:1'),
      (566, 'M reopens T8 for corrections',                          'M', $$update public.poker_tables set status = 'playing' where id = '88888888-8888-4888-8888-888888888888'$$, 'rows:1'),
      (567, '…no settling, no transfers',                            'M', $$select (select count(*) from public.poker_tables where id = '88888888-8888-4888-8888-888888888888' and (settled_at is not null or settled_manually)) + (select count(*) from public.settlement_transfers where table_id = '88888888-8888-4888-8888-888888888888')$$, 'count:0'),

      -- ---------------- T9: cleaning "משחקים שניהלתי": hide from my list, or delete the game ----------------
      -- T8 again: M manages it, Q is a co-manager, P played. Closed again, still open for settling.
      (570, 'M closes T8 again (with transfers)',                    'M', $$select public.end_game('88888888-8888-4888-8888-888888888888', '{"88000000-0000-4000-8000-000000000001": 100, "88000000-0000-4000-8000-000000000002": -60, "88000000-0000-4000-8000-000000000003": -40}', '[{"from": "88000000-0000-4000-8000-000000000002", "to": "88000000-0000-4000-8000-000000000001", "amount": 60}, {"from": "88000000-0000-4000-8000-000000000003", "to": "88000000-0000-4000-8000-000000000001", "amount": 40}]')$$, 'ok'),
      (571, 'M hides T8 from his list of managed games',             'M', $$insert into public.managed_list_hidden (table_id) values ('88888888-8888-4888-8888-888888888888')$$, 'ok'),
      (572, '…M sees his row',                                       'M', $$select count(*) from public.managed_list_hidden where table_id = '88888888-8888-4888-8888-888888888888'$$, 'count:1'),
      (573, 'The co-manager Q may hide it from his own list',        'Q', $$insert into public.managed_list_hidden (table_id) values ('88888888-8888-4888-8888-888888888888')$$, 'ok'),
      (574, 'Q sees only his own row, not M''s',                     'Q', $$select count(*) from public.managed_list_hidden$$, 'count:1'),
      (575, 'P only played: can''t add to that list',                'P', $$insert into public.managed_list_hidden (table_id) values ('88888888-8888-4888-8888-888888888888')$$, 'deny'),
      (576, 'P sees nobody''s rows',                                 'P', $$select count(*) from public.managed_list_hidden$$, 'count:0'),
      (577, 'A stranger can''t add to that list',                    'S', $$insert into public.managed_list_hidden (table_id) values ('88888888-8888-4888-8888-888888888888')$$, 'deny'),
      (578, 'M can''t add a row for someone else',                   'M', $$insert into public.managed_list_hidden (user_id, table_id) values ('22222222-2222-4222-8222-222222222222', '88888888-8888-4888-8888-888888888888')$$, 'deny'),
      (579, 'Rows are never updated',                                'M', $$update public.managed_list_hidden set hidden_at = now()$$, 'deny'),
      (580, 'P can''t remove M''s row',                              'P', $$delete from public.managed_list_hidden$$, 'rows:0'),
      (581, 'anon has no access',                                    'anon', $$select count(*) from public.managed_list_hidden$$, 'deny'),
      (582, 'Hidden from the list only: still in P''s stats',        'P', $$select count(*) from public.my_games where table_id = '88888888-8888-4888-8888-888888888888'$$, 'count:1'),
      (583, '…and in M''s stats',                                    'M', $$select count(*) from public.my_games where table_id = '88888888-8888-4888-8888-888888888888'$$, 'count:1'),
      (584, 'Q shows it again in his own list',                      'Q', $$delete from public.managed_list_hidden where table_id = '88888888-8888-4888-8888-888888888888'$$, 'rows:1'),
      (585, 'The co-manager can''t delete the closed game',          'Q', $$delete from public.poker_tables where id = '88888888-8888-4888-8888-888888888888'$$, 'rows:0'),
      (586, 'A player can''t delete it',                             'P', $$delete from public.poker_tables where id = '88888888-8888-4888-8888-888888888888'$$, 'rows:0'),
      (587, 'A stranger can''t delete it',                           'S', $$delete from public.poker_tables where id = '88888888-8888-4888-8888-888888888888'$$, 'rows:0'),
      (588, '…still there for P',                                    'P', $$select count(*) from public.poker_tables where id = '88888888-8888-4888-8888-888888888888'$$, 'count:1'),
      (589, 'The original manager deletes the closed game (settling open, transfers stored)', 'M', $$delete from public.poker_tables where id = '88888888-8888-4888-8888-888888888888'$$, 'rows:1'),
      (590, '…gone from P''s stats',                                 'P', $$select count(*) from public.my_games where table_id = '88888888-8888-4888-8888-888888888888'$$, 'count:0'),
      (591, '…and from the co-manager Q''s stats',                'Q', $$select count(*) from public.my_games where table_id = '88888888-8888-4888-8888-888888888888'$$, 'count:0'),
      (592, '…nothing of it is left anywhere',                       'postgres', $$select (select count(*) from public.table_players where table_id = '88888888-8888-4888-8888-888888888888') + (select count(*) from public.settlement_transfers where table_id = '88888888-8888-4888-8888-888888888888') + (select count(*) from public.table_log where table_id = '88888888-8888-4888-8888-888888888888') + (select count(*) from public.table_members where table_id = '88888888-8888-4888-8888-888888888888') + (select count(*) from public.managed_list_hidden where table_id = '88888888-8888-4888-8888-888888888888')$$, 'count:0'),
      -- ---------------- T10: imported game history (personal stats only) ----------------
      -- M imports two nights; P imports one. Only the owner sees, adds and deletes; nothing else changes.
      (600, 'M imports two nights',                                  'M', $$insert into public.imported_games (import_id, played_on, net, note) values ('10000000-0000-4000-8000-000000000001', '2026-02-08', -120, 'אצל דני'), ('10000000-0000-4000-8000-000000000001', '2026-02-15', 80, null)$$, 'ok'),
      (601, 'M sees his imported nights',                            'M', $$select count(*) from public.imported_games$$, 'count:2'),
      (602, 'P sees none of M''s',                                   'P', $$select count(*) from public.imported_games$$, 'count:0'),
      (603, 'A stranger sees none',                                  'S', $$select count(*) from public.imported_games$$, 'count:0'),
      (604, 'anon can''t read imports',                              'anon', $$select count(*) from public.imported_games$$, 'deny'),
      (605, 'anon can''t import',                                    'anon', $$insert into public.imported_games (import_id, played_on, net) values ('10000000-0000-4000-8000-000000000009', '2026-02-08', 10)$$, 'deny'),
      (606, 'M can''t import into P''s history',                     'M', $$insert into public.imported_games (user_id, import_id, played_on, net) values ('22222222-2222-4222-8222-222222222222', '10000000-0000-4000-8000-000000000002', '2026-02-08', 500)$$, 'deny'),
      (607, 'M can''t set the import time',                          'M', $$insert into public.imported_games (import_id, played_on, net, imported_at) values ('10000000-0000-4000-8000-000000000002', '2026-02-08', 10, '2020-01-01')$$, 'deny'),
      (608, 'M can''t pick the row id',                              'M', $$insert into public.imported_games (id, import_id, played_on, net) values ('10000000-0000-4000-8000-0000000000aa', '10000000-0000-4000-8000-000000000002', '2026-02-08', 10)$$, 'deny'),
      (609, 'Imported nights are never updated',                     'M', $$update public.imported_games set net = 1000$$, 'deny'),
      (610, 'P can''t delete M''s imports',                          'P', $$delete from public.imported_games$$, 'rows:0'),
      (611, 'P imports one night',                                   'P', $$insert into public.imported_games (import_id, played_on, net) values ('10000000-0000-4000-8000-000000000003', '2026-03-01', 40)$$, 'ok'),
      (612, 'A note of only hidden characters is no note',           'M', $$insert into public.imported_games (import_id, played_on, net, note) values ('10000000-0000-4000-8000-000000000001', '2026-03-01', 0, chr(8207) || '  ' || chr(8203))$$, 'ok'),
      (613, '…stored without a note',                                'M', $$select count(*) from public.imported_games where played_on = '2026-03-01' and net = 0 and note is null$$, 'count:1'),
      (614, 'Hidden characters are removed from a note',             'M', $$insert into public.imported_games (import_id, played_on, net, note) values ('10000000-0000-4000-8000-000000000001', '2026-03-08', 0, 'א' || chr(8238) || 'ב')$$, 'ok'),
      (615, '…the note is clean',                                    'M', $$select count(*) from public.imported_games where played_on = '2026-03-08' and note = 'אב'$$, 'count:1'),
      (616, 'A note longer than 200 characters is refused',          'M', $$insert into public.imported_games (import_id, played_on, net, note) values ('10000000-0000-4000-8000-000000000001', '2026-03-09', 0, repeat('א', 201))$$, 'error:23514'),
      (617, 'A date before 2000 is refused',                         'M', $$insert into public.imported_games (import_id, played_on, net) values ('10000000-0000-4000-8000-000000000001', '1999-12-31', 0)$$, 'error:23514'),
      (618, 'An absurd amount is refused',                           'M', $$insert into public.imported_games (import_id, played_on, net) values ('10000000-0000-4000-8000-000000000001', '2026-03-09', 20000000)$$, 'error:23514'),
      (619, 'Imports never show up in anyone''s tablemates',         'P', $$select count(*) from public.my_tablemates where games > (select count(*) from public.my_games)$$, 'count:0'),
      (620, '(setup) M already has 1,996 more imported nights',      'postgres', $$insert into public.imported_games (user_id, import_id, played_on, net) select '11111111-1111-4111-8111-111111111111', '10000000-0000-4000-8000-000000000004', date '2026-01-01', g from generate_series(1, 1996) g$$, 'ok'),
      (621, 'At 2,000 imported nights, one more is refused',         'M', $$insert into public.imported_games (import_id, played_on, net) values ('10000000-0000-4000-8000-000000000001', '2026-03-10', 0)$$, 'error:54000'),
      (622, '"מחק את כל המיובאים": M deletes all of his',            'M', $$delete from public.imported_games$$, 'rows:2000'),
      (623, '…P''s import is untouched',                             'P', $$select count(*) from public.imported_games$$, 'count:1'),

      -- ---------------- every table has RLS on ----------------
      (90, 'RLS is enabled on all 12 tables',          'M', $$select count(*) from pg_tables where schemaname = 'public' and tablename in ('profiles','poker_tables','table_members','table_players','buy_ins','table_log','hidden_games','cash_payments','settlement_transfers','profile_phones','managed_list_hidden','imported_games') and rowsecurity$$, 'count:12'),
      (91, 'Realtime publishes only table_log',        'M', $$select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename <> 'table_log'$$, 'count:0'),
      (92, '…and table_log is published',              'M', $$select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'table_log'$$, 'count:1')
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
