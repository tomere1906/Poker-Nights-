import { describe, expect, it, vi } from 'vitest';

// toView is pure; keep the Supabase client out of the test.
vi.mock('./supabase.js', () => ({ supabase: null, isSupabaseConfigured: false }));
const { toView, finalsFor, toChips, cleanTableName, recentManagedGames } = await import('./onlineTable.js');

const M = 'manager-id';
const P = 'player-id';
const C = 'co-id';

function raw(overrides = {}) {
  return {
    table: {
      id: 't1', manager_id: M, status: 'seating', initial_buy_in: 30, rebuy_amounts: [30, 60, 100],
      buy_in_mode: 'managers', invite_code: 'x', manager: { display_name: 'תומר', color: 2 },
    },
    players: [
      { id: 'p-guest', user_id: null, nickname: 'אורח', color: 5, seat: 3, profile: null },
      { id: 'p-user', user_id: P, nickname: null, color: null, seat: 0, profile: { display_name: 'אסף', color: 1 } },
      { id: 'p-renamed', user_id: C, nickname: 'אסף ב׳', color: 6, seat: 1, profile: { display_name: 'אסף', color: 1 } },
    ],
    buyIns: [
      { id: 'b1', player_id: 'p-user', amount: 30, created_at: '2026-10-25T19:00:00Z' },
      { id: 'b2', player_id: 'p-user', amount: 60, created_at: '2026-10-25T20:00:00Z' },
      { id: 'b3', player_id: 'p-guest', amount: 30, created_at: '2026-10-25T19:05:00Z' },
    ],
    members: [
      { user_id: P, is_co_manager: false, profile: { display_name: 'אסף', color: 1 } },
      { user_id: C, is_co_manager: true, profile: { display_name: 'אסף', color: 1 } },
      { user_id: 'waiting', is_co_manager: false, profile: { display_name: 'בן', color: null } },
    ],
    log: [],
    cash: [],
    ...overrides,
  };
}

describe('toView', () => {
  it('shows the per-table name/color first, else the profile values', () => {
    const v = toView(raw(), M);
    const byId = Object.fromEntries(v.players.map((p) => [p.id, p]));
    expect(byId['p-user']).toMatchObject({ name: 'אסף', color: 1, nickname: null });
    expect(byId['p-renamed']).toMatchObject({ name: 'אסף ב׳', color: 6 });
    expect(byId['p-guest']).toMatchObject({ name: 'אורח', color: 5, userId: null });
  });

  it('groups buy-ins per player in time order', () => {
    const p = toView(raw(), M).players.find((x) => x.id === 'p-user');
    expect(p.buyIns).toEqual([30, 60]);
    expect(p.buyInIds).toEqual(['b1', 'b2']);
  });

  it('works out who may manage', () => {
    expect(toView(raw(), M)).toMatchObject({ isManager: true, canManage: true });
    expect(toView(raw(), C)).toMatchObject({ isManager: false, canManage: true });
    expect(toView(raw(), P)).toMatchObject({ isManager: false, canManage: false });
  });

  it('lists signed-in people who are not seated yet (manager included)', () => {
    const names = toView(raw(), M).unseated.map((p) => p.name);
    expect(names).toEqual(['תומר', 'בן']);
  });

  it('maps settings and status', () => {
    const v = toView(raw(), M);
    expect(v.settings).toEqual({ initialBuyIn: 30, rebuyAmounts: [30, 60, 100], rounding: 10, chipValue: 1 });
    expect(toView(raw({ table: { ...raw().table, chip_value: 0.5 } }), M).settings.chipValue).toBe(0.5);
    expect(toView(raw({ table: { ...raw().table, rounding: 50 } }), M).settings.rounding).toBe(50);
    expect(v.started).toBe(false);
    expect(toView(raw({ table: { ...raw().table, status: 'playing' } }), M).started).toBe(true);
  });
});

describe('online results and exits', () => {
  const withResults = () =>
    raw({
      table: { ...raw().table, status: 'playing', name: 'שישי אצל אסף', end_mode: 'net' },
      players: [
        { id: 'p-user', user_id: P, nickname: null, color: null, seat: 0, out_kind: 'amount', out_chips: 120, final_value: null, profile: { display_name: 'אסף', color: 1 } },
        { id: 'p-guest', user_id: null, nickname: 'אורח', color: 5, seat: 1, out_kind: null, out_chips: null, final_value: 0, profile: null },
      ],
    });

  it('maps the table name and the exits', () => {
    const v = toView(withResults(), M);
    expect(v.name).toBe('שישי אצל אסף');
    expect(v.players.find((p) => p.id === 'p-user').out).toEqual({ kind: 'amount', chips: 120 });
    expect(v.players.find((p) => p.id === 'p-guest').out).toBeNull();
  });

  it('prefills results from the exit amount, in the end mode\'s terms', () => {
    const v = toView(withResults(), M);
    // p-user put in 90 and left with 120; the guest put in 30 and left with 0.
    expect(v.finals).toEqual({ 'p-user': 30, 'p-guest': -30 });
    expect(finalsFor(v.players, 'chips')).toEqual({ 'p-user': 120, 'p-guest': 0 });
  });

  it('one source per player: for a player who left, the exit wins over a stale end-game value', () => {
    const r = withResults();
    r.players[0] = { ...r.players[0], final_value: 999 }; // an older value typed before he left
    const v = toView(r, M);
    const user = v.players.find((p) => p.id === 'p-user');
    expect(user.finalChips).toBe(120);
    expect(v.finals['p-user']).toBe(30);
    // A seated player's result is the end-game value.
    expect(v.players.find((p) => p.id === 'p-guest').finalChips).toBe(0);
  });

  it('stores results as chips whatever the input mode', () => {
    const player = toView(withResults(), M).players.find((p) => p.id === 'p-user');
    expect(toChips(player, 30, 'net')).toBe(120);
    expect(toChips(player, 120, 'chips')).toBe(120);
    expect(toChips(player, null, 'net')).toBeNull();
  });

  it('cleans the optional table name', () => {
    expect(cleanTableName('  שישי  ')).toBe('שישי');
    expect(cleanTableName('   ')).toBeNull();
    expect(cleanTableName('א'.repeat(40))).toHaveLength(30);
  });
});

describe('toView: settling', () => {
  it('an ended game with no settled_at is still open for settling', () => {
    const ended = { ...raw().table, status: 'ended', ended_at: '2026-11-12T20:00:00Z' };
    expect(toView(raw({ table: { ...ended, settled_at: null } }), M).settling).toBe(true);
    expect(toView(raw({ table: { ...ended, settled_at: '2026-11-12T21:00:00Z', settled_manually: true } }), M)).toMatchObject({
      settling: false,
      settledManually: true,
    });
    expect(toView(raw({ table: { ...raw().table, status: 'playing' } }), M).settling).toBe(false);
  });
});

describe('toView: cash', () => {
  it('maps cash rows to the local shape', () => {
    const v = toView(raw({ cash: [{ id: 'c1', payer_id: 'p-guest', amount: 200 }] }), P);
    expect(v.cash).toEqual([{ id: 'c1', from: 'p-guest', amount: 200 }]);
  });
});

describe('recentManagedGames', () => {
  const now = Date.parse('2026-11-12T12:00:00Z');
  const daysAgo = (d) => new Date(now - d * 24 * 60 * 60 * 1000).toISOString();
  const game = (id, over = {}) => ({
    id, manager_id: M, status: 'ended', ended_at: daysAgo(1), settled_at: daysAgo(1), table_members: [], ...over,
  });

  it('lists closed games I managed in the last 30 days, newest first', () => {
    const rows = [game('old', { ended_at: daysAgo(31) }), game('a', { ended_at: daysAgo(5) }), game('b', { ended_at: daysAgo(2) })];
    expect(recentManagedGames(rows, M, now).map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('includes co-managed games, never ones where I only played', () => {
    const rows = [
      game('co', { manager_id: 'x', table_members: [{ user_id: C, is_co_manager: true }] }),
      game('played', { manager_id: 'x', table_members: [{ user_id: P, is_co_manager: false }] }),
    ];
    expect(recentManagedGames(rows, C, now).map((t) => t.id)).toEqual(['co']);
    expect(recentManagedGames(rows, P, now)).toEqual([]);
  });

  it('skips games still being played or still open for settling (listed on their own)', () => {
    const rows = [game('playing', { status: 'playing', ended_at: null, settled_at: null }), game('settling', { settled_at: null })];
    expect(recentManagedGames(rows, M, now)).toEqual([]);
  });
});
