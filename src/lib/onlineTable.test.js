import { describe, expect, it, vi } from 'vitest';

// toView is pure; keep the Supabase client out of the test.
vi.mock('./supabase.js', () => ({ supabase: null, isSupabaseConfigured: false }));
const { toView, finalsFor, toChips, cleanTableName } = await import('./onlineTable.js');

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
    expect(v.settings).toEqual({ initialBuyIn: 30, rebuyAmounts: [30, 60, 100], rounding: 10, sheep: true });
    expect(toView(raw({ table: { ...raw().table, sheep: false } }), M).settings.sheep).toBe(false);
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

describe('toView: cash', () => {
  it('maps cash rows to the local shape', () => {
    const v = toView(raw({ cash: [{ id: 'c1', payer_id: 'p-guest', amount: 200 }] }), P);
    expect(v.cash).toEqual([{ id: 'c1', from: 'p-guest', amount: 200 }]);
  });
});
