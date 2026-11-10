// Outside attack test: talks to the real Supabase project directly (bypassing
// the app) with only the public publishable key, the way an attacker would.
//
//   node supabase/tests/attack_test.mjs
//
// Part A (always): no account (anon).
// Part B (optional): two real accounts. Put their access tokens (valid ~1 hour)
// in .attack-tokens.json (git-ignored) as { "a": "<token>", "b": "<token>" }.
// Get one in the app's browser tab (signed in), DevTools console:
//   copy(JSON.parse(localStorage['sb-emkzkgpqaupqudzgewxa-auth-token']).access_token)
// Account A opens a fresh test table (legitimately) and seats a guest; account B
// is an outsider who tries to read and change it. Every "change" attempt writes
// the value that's already there, so even a hole would change nothing. The test
// table is deleted at the end. Nothing else is touched.
import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const URL_ = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!KEY?.startsWith('sb_publishable_')) throw new Error('Only the publishable key may be used here');

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : ` → ${detail}`}`);
}

const client = (token) => {
  const c = createClient(URL_, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
  });
  // Live updates authenticate separately: as this user, not as a visitor.
  if (token) c.realtime.setAuth(token);
  return c;
};

// Blocked = an error, or no rows touched / seen.
async function blocked(name, run) {
  try {
    const { data, error } = await run();
    const rows = Array.isArray(data) ? data.length : data ? 1 : 0;
    record(name, Boolean(error) || rows === 0, error ? '' : `${rows} row(s) came back`);
  } catch (e) {
    record(name, true, e.message);
  }
}

async function http(path, init = {}) {
  const res = await fetch(URL_ + path, { ...init, headers: { apikey: KEY, ...(init.headers ?? {}) } });
  let body = null;
  try {
    body = await res.json();
  } catch {}
  return { status: res.status, body };
}

const TABLES = ['profiles', 'poker_tables', 'table_members', 'table_players', 'buy_ins', 'table_log', 'hidden_games', 'cash_payments'];
const VIEWS = ['my_games', 'my_tablemates', 'my_hidden_games'];

// ---------------------------------------------------------------- Part A: anon
console.log('\n— Part A: no account, only the public key —');
const anon = client();
for (const t of [...TABLES, ...VIEWS]) await blocked(`anon can't read ${t}`, () => anon.from(t).select('*').limit(5));
await blocked("anon can't open a table", () => anon.from('poker_tables').insert({}).select());
await blocked("anon can't write the log", () => anon.from('table_log').insert({ table_id: '00000000-0000-4000-8000-000000000000', action: 'x' }).select());
await blocked("anon can't call end_game", () => anon.rpc('end_game', { p_table: '00000000-0000-4000-8000-000000000000', p_nets: {} }));
await blocked("anon can't call swap_seats", () => anon.rpc('swap_seats', { p_player: '00000000-0000-4000-8000-000000000000', p_seat: 1 }));
await blocked("the private schema isn't reachable", () => anon.schema('private').rpc('is_in_table', { p_table: '00000000-0000-4000-8000-000000000000' }));
await blocked("auth.users (emails) isn't reachable", () => anon.schema('auth').from('users').select('email'));

const settings = await http('/auth/v1/settings');
const ext = settings.body?.external ?? {};
const onlyGoogle = Object.entries(ext).filter(([, on]) => on).map(([p]) => p);
record('sign-in: only Google is enabled (no email/password, phone or anonymous)', onlyGoogle.length === 1 && onlyGoogle[0] === 'google', `enabled: ${onlyGoogle.join(', ')}`);
record('sign-in: anonymous sign-ins are off', !ext.anonymous_users, 'anonymous_users is on');

const openapi = await http('/rest/v1/', { headers: { Accept: 'application/openapi+json' } });
const exposed = Object.keys(openapi.body?.paths ?? {}).filter((p) => p !== '/');
record("anon's API description lists no tables", exposed.length === 0, `${openapi.status}: ${exposed.join(' ')}`);

const gql = await http('/graphql/v1', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: '{ __schema { queryType { fields { name } } } }' }),
});
const gqlFields = (gql.body?.data?.__schema?.queryType?.fields ?? []).map((f) => f.name).filter((n) => n !== 'node');
record('GraphQL shows anon no tables', gqlFields.length === 0, `${gql.status}: ${gqlFields.join(' ')}`);

const buckets = await http('/storage/v1/bucket');
record('no storage buckets are visible', !Array.isArray(buckets.body) || buckets.body.length === 0, JSON.stringify(buckets.body).slice(0, 120));

// ---------------------------------------------------------- Part B: accounts
const tokensFile = new URL('../../.attack-tokens.json', import.meta.url);
if (!existsSync(tokensFile)) {
  console.log('\n— Part B skipped: no .attack-tokens.json —');
} else {
  const tokens = JSON.parse(readFileSync(tokensFile, 'utf8'));
  const A = client(tokens.a);
  const B = client(tokens.b);
  const idOf = async (c) => (await c.auth.getUser()).data.user?.id;
  const aId = await idOf(A);
  const bId = await idOf(B);
  if (!aId || !bId || aId === bId) throw new Error('Two different, valid tokens are needed (they expire after ~1 hour)');
  console.log('\n— Part B: account A owns a test table, account B is an outsider —');

  const { data: table, error: tErr } = await A.from('poker_tables').insert({ name: 'בדיקת אבטחה' }).select('id, invite_code').single();
  if (tErr) throw tErr;
  const T = table.id;
  try {
    const { data: guest, error: gErr } = await A.from('table_players').insert({ table_id: T, nickname: 'אורח בדיקה', color: 1, seat: 0 }).select('id').single();
    if (gErr) throw gErr;
    const { data: buy } = await A.from('buy_ins').insert({ table_id: T, player_id: guest.id, amount: 50 }).select('id').single();

    // Reading
    for (const t of ['poker_tables', 'table_players', 'buy_ins', 'table_log', 'table_members', 'cash_payments']) {
      const col = t === 'poker_tables' ? 'id' : 'table_id';
      await blocked(`B can't read A's table: ${t}`, () => B.from(t).select('*').eq(col, T));
    }
    const { data: aProfile } = await A.from('profiles').select('display_name, color').eq('id', aId).single();
    // B may see A's profile only if they really share a table (e.g. from earlier testing).
    const { data: seen } = await B.from('profiles').select('id').eq('id', aId);
    if (seen?.length) {
      const together = await Promise.all([
        B.from('poker_tables').select('id').eq('manager_id', aId).neq('id', T),
        B.from('table_players').select('id').eq('user_id', aId),
        B.from('table_members').select('table_id').eq('user_id', aId),
      ]);
      record("B sees A's profile only because they share a table", together.some((r) => r.data?.length), 'B sees it without sharing a table');
    } else {
      record("B can't see A's profile (no shared table)", true);
    }
    await blocked('profiles have no email column', () => A.from('profiles').select('email').eq('id', aId));
    await blocked("B's stats don't include A's table", () => B.from('my_games').select('*').eq('table_id', T));

    // Writing (each write sets the value that's already there)
    await blocked("B can't change A's table", () => B.from('poker_tables').update({ name: 'בדיקת אבטחה' }).eq('id', T).select());
    await blocked("B can't take over A's table", () => B.from('poker_tables').update({ manager_id: bId }).eq('id', T).select());
    await blocked("B can't delete A's table", () => B.from('poker_tables').delete().eq('id', T).select());
    await blocked("B can't change A's profile", () => B.from('profiles').update({ display_name: aProfile.display_name }).eq('id', aId).select());
    await blocked("B can't seat himself without the invite", () => B.from('table_players').insert({ table_id: T, user_id: bId, seat: 5 }).select());
    await blocked("B can't seat a guest", () => B.from('table_players').insert({ table_id: T, nickname: 'פולש', color: 2, seat: 6 }).select());
    await blocked("B can't change a seat", () => B.from('table_players').update({ seat: 0 }).eq('id', guest.id).select());
    await blocked("B can't add a buy-in", () => B.from('buy_ins').insert({ table_id: T, player_id: guest.id, amount: 50 }).select());
    await blocked("B can't change a buy-in", () => B.from('buy_ins').update({ amount: 50 }).eq('id', buy.id).select());
    await blocked("B can't delete a buy-in", () => B.from('buy_ins').delete().eq('id', buy.id).select());
    await blocked("B can't record cash", () => B.from('cash_payments').insert({ table_id: T, payer_id: guest.id, amount: 10 }).select());
    await blocked("B can't write the log", () => B.from('table_log').insert({ table_id: T, action: 'fake' }).select());
    await blocked("B can't end A's game", () => B.rpc('end_game', { p_table: T, p_nets: { [guest.id]: 0 } }));
    await blocked("B can't move seats via swap_seats", () => B.rpc('swap_seats', { p_player: guest.id, p_seat: 3 }).then(async (r) => {
      const { data } = await A.from('table_players').select('seat').eq('id', guest.id).single();
      return { data: data.seat === 3 ? [data] : [], error: null };
    }));
    await blocked("B can't join with a wrong invite code", () => B.from('table_members').insert({ table_id: T, invite_code: 'guess' }).select());
    await blocked("B can't join as co-manager even with the code", () => B.from('table_members').insert({ table_id: T, invite_code: table.invite_code, is_co_manager: true }).select());
    await blocked("B can't hide A's game for A", () => B.from('hidden_games').insert({ table_id: T, user_id: aId }).select());
    await blocked("A can't hand his table to B", () => A.from('poker_tables').update({ manager_id: bId }).eq('id', T).select());

    // Live updates: B listens to A's table while A changes it. A listens too, as
    // the control: if A gets nothing either, the check proves nothing.
    const events = { A: 0, B: 0 };
    const status = {};
    const listen = (c, who) =>
      new Promise((resolve) => {
        const ch = c
          .channel(`attack-${who}-${T}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'table_log', filter: `table_id=eq.${T}` }, () => events[who]++)
          .subscribe((s) => {
            if (s === 'CLOSED') return; // closing at the end isn't a result
            status[who] = s;
            resolve(ch);
          });
      });
    const [chA, chB] = await Promise.all([listen(A, 'A'), listen(B, 'B')]);
    await new Promise((r) => setTimeout(r, 1500));
    await A.from('buy_ins').insert({ table_id: T, player_id: guest.id, amount: 100 });
    await new Promise((r) => setTimeout(r, 4000));
    await A.removeChannel(chA);
    await B.removeChannel(chB);
    record('live updates: both subscriptions connected', status.A === 'SUBSCRIBED' && status.B === 'SUBSCRIBED', JSON.stringify(status));
    record('live updates: A (the owner) gets the change', events.A > 0, 'A got nothing, so the next check proves nothing');
    record("live updates: B gets nothing from A's table", events.B === 0, `${events.B} event(s) leaked`);

    // With the invite, B becomes a plain member: sees the table, still can't manage it.
    const join = await B.from('table_members').insert({ table_id: T, invite_code: table.invite_code });
    record('B joins with the real invite (allowed)', !join.error, join.error?.message);
    await blocked('…member B still can\'t add a buy-in ("רק מנהלים")', () => B.from('buy_ins').insert({ table_id: T, player_id: guest.id, amount: 50 }).select());
    await blocked("…member B still can't change the table", () => B.from('poker_tables').update({ name: 'בדיקת אבטחה' }).eq('id', T).select());
    await blocked("…member B can't make himself co-manager", () => B.from('table_members').update({ is_co_manager: true }).eq('table_id', T).eq('user_id', bId).select());
    await blocked("…member B can't see A's email (no such column for users)", () => B.from('profiles').select('email').eq('id', aId));
  } finally {
    const del = await A.from('poker_tables').delete().eq('id', T);
    record('cleanup: the test table was deleted', !del.error, del.error?.message);
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${failed.length === 0 ? `ALL ${results.length} ATTACKS BLOCKED ✅` : `${failed.length} OF ${results.length} FAILED ❌`}`);
process.exit(failed.length ? 1 : 0);
