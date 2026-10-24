-- Security tests: try to break the RLS rules.
--
-- Run in the Supabase SQL Editor AFTER the migrations. Everything happens in
-- one DO block that ends by raising an error ON PURPOSE, which rolls back
-- every row it created (test users, tables, buy-ins). The error message IS
-- the report: "ALL n TESTS PASSED" or the list of failures.
--
-- Users:  M = manager of T1 · P = player in T1 and T2 · S = stranger · Q = manager of T2
-- Each case runs as a real Data API role (authenticated/anon) with that user's JWT.
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
    (q, 'q@test.local', 'authenticated', 'authenticated', '{"full_name":"Other Manager"}');

  for c in
    select * from (values
      -- ---------------- setup through the real rules (all must pass) ----------------
      (1,  'M opens table T1',                         'M', $$insert into public.poker_tables (id, invite_code) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'code-t1')$$, 'ok'),
      (2,  'M seats himself in T1',                    'M', $$insert into public.table_players (id, table_id, user_id, name, seat) values ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'מנהל', 0)$$, 'ok'),
      (3,  'M seats a guest (name only) in T1',        'M', $$insert into public.table_players (id, table_id, name, seat) values ('a0000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'אורח', 1)$$, 'ok'),
      (4,  'M adds buy-ins in T1',                     'M', $$insert into public.buy_ins (table_id, player_id, amount) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001', 50), ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000002', 50)$$, 'ok'),
      (5,  'P joins T1 with the invite code',          'P', $$insert into public.table_members (table_id, invite_code) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'code-t1')$$, 'ok'),
      (6,  'M seats P (a member) in T1',               'M', $$insert into public.table_players (id, table_id, user_id, name, seat) values ('a0000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'שחקן', 2)$$, 'ok'),
      (7,  'Q opens table T2',                         'Q', $$insert into public.poker_tables (id, invite_code) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'code-t2')$$, 'ok'),
      (8,  'P joins T2',                               'P', $$insert into public.table_members (table_id, invite_code) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'code-t2')$$, 'ok'),
      (9,  'Q seats Q and P in T2',                    'Q', $$insert into public.table_players (id, table_id, user_id, name, seat) values ('b0000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '44444444-4444-4444-8444-444444444444', 'מנהל 2', 0), ('b0000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'שחקן', 1)$$, 'ok'),
      (10, 'Q adds a buy-in for P in T2',              'Q', $$insert into public.buy_ins (table_id, player_id, amount) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b0000000-0000-4000-8000-000000000002', 100)$$, 'ok'),
      (11, 'M enters P''s result in T1',               'M', $$update public.table_players set final_value = -50, final_net = -50 where id = 'a0000000-0000-4000-8000-000000000003'$$, 'rows:1'),
      (12, 'Q enters P''s result in T2',               'Q', $$update public.table_players set final_value = 30, final_net = 30 where id = 'b0000000-0000-4000-8000-000000000002'$$, 'rows:1'),

      -- ---------------- what members (players) can see ----------------
      (20, 'P sees table T1',                          'P', $$select count(*) from public.poker_tables where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'count:1'),
      (21, 'P sees all 3 seats in T1',                 'P', $$select count(*) from public.table_players where table_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'count:3'),
      (22, 'P sees all buy-ins in T1',                 'P', $$select count(*) from public.buy_ins where table_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'count:2'),
      (23, 'P sees own results in both games',         'P', $$select count(*) from public.table_players where user_id = '22222222-2222-4222-8222-222222222222'$$, 'count:2'),
      (24, 'P sees the manager''s profile (tablemate)', 'P', $$select count(*) from public.profiles where id = '11111111-1111-4111-8111-111111111111'$$, 'count:1'),
      (25, 'Profile name comes from Google data',      'M', $$select count(*) from public.profiles where id = '11111111-1111-4111-8111-111111111111' and display_name = 'Manager Test' and avatar_url = 'https://x/m.png'$$, 'count:1'),

      -- ---------------- players are passive: every write must fail ----------------
      (30, 'P cannot add a buy-in',                    'P', $$insert into public.buy_ins (table_id, player_id, amount) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000003', 500)$$, 'deny'),
      (31, 'P cannot change a buy-in amount',          'P', $$update public.buy_ins set amount = 1 where table_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'rows:0'),
      (32, 'P cannot delete buy-ins',                  'P', $$delete from public.buy_ins where table_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'rows:0'),
      (33, 'P cannot add a player',                    'P', $$insert into public.table_players (table_id, name, seat) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'פולש', 5)$$, 'deny'),
      (34, 'P cannot change own final result',         'P', $$update public.table_players set final_net = 9999 where user_id = '22222222-2222-4222-8222-222222222222'$$, 'rows:0'),
      (35, 'P cannot remove a player',                 'P', $$delete from public.table_players where table_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'rows:0'),
      (36, 'P cannot change table settings / end game', 'P', $$update public.poker_tables set status = 'ended', initial_buy_in = 1 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'rows:0'),
      (37, 'P cannot delete the table',                'P', $$delete from public.poker_tables where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'rows:0'),
      (38, 'P cannot kick members',                    'P', $$delete from public.table_members where table_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'rows:0'),
      (39, 'P cannot write profiles',                  'P', $$update public.profiles set display_name = 'hacked'$$, 'deny'),

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
      (53, 'M cannot seat a non-member account',       'M', $$insert into public.table_players (table_id, user_id, name, seat) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'זר', 4)$$, 'deny'),
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

      -- ---------------- every table has RLS on ----------------
      (90, 'RLS is enabled on all 5 tables',           'M', $$select count(*) from pg_tables where schemaname = 'public' and tablename in ('profiles','poker_tables','table_members','table_players','buy_ins') and rowsecurity$$, 'count:5')
    ) as t(i, name, who, sql, expect)
    order by i
  loop
    total := total + 1;
    ok := false;
    detail := null;
    begin
      perform set_config('role', case when c.who = 'anon' then 'anon' else 'authenticated' end, true);
      perform set_config(
        'request.jwt.claims',
        case c.who
          when 'M' then json_build_object('sub', m, 'role', 'authenticated')::text
          when 'P' then json_build_object('sub', p, 'role', 'authenticated')::text
          when 'S' then json_build_object('sub', s, 'role', 'authenticated')::text
          when 'Q' then json_build_object('sub', q, 'role', 'authenticated')::text
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
