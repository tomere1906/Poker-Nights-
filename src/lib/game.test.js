import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, MAX_PLAYERS, cleanSettings, gameReducer, initialState, initials, netOf, normalizeState, potTotal, timesOf, totalIn } from './game.js';

function add(state, name, position = state.players.length, amount = 100) {
  return gameReducer(state, { type: 'addPlayer', position, name, amount });
}

const order = (state) => [...state.players].sort((a, b) => a.seat - b.seat).map((p) => p.name);
const started = { ...initialState, started: true };
const seat = (state, name, seatNo = null) => gameReducer(state, { type: 'seatPlayer', seat: seatNo, name, amount: 50 });
const seats = (state) => Object.fromEntries(state.players.map((p) => [p.name, p.seat]));

describe('table settings', () => {
  it('opens a fresh table with the chosen settings', () => {
    let s = seat({ ...initialState, tableOpen: true }, 'old');
    s = gameReducer(s, { type: 'openTable', settings: { initialBuyIn: 30, rebuyAmounts: [60, 30, 100] } });
    expect(s.tableOpen).toBe(true);
    expect(s.players).toEqual([]);
    expect(s.settings).toEqual({ initialBuyIn: 30, rebuyAmounts: [30, 60, 100], rounding: 10 });
  });

  it('cleans settings: 2-4 distinct positive buttons, else defaults', () => {
    expect(cleanSettings({ initialBuyIn: 40, rebuyAmounts: [100, 0, 100, 50] })).toEqual({
      initialBuyIn: 40,
      rebuyAmounts: [50, 100],
      rounding: 10,
    });
    // Rounding: 1 / 5 / 10 / 50 ₪, default 10 (also for saves from before the setting).
    expect(cleanSettings({ initialBuyIn: 40, rebuyAmounts: [50, 100], rounding: 50 }).rounding).toBe(50);
    expect(cleanSettings({ initialBuyIn: 40, rebuyAmounts: [50, 100], rounding: 7 }).rounding).toBe(10);
    expect(cleanSettings({ initialBuyIn: 40, rebuyAmounts: [10, 20, 30, 40, 50] }).rebuyAmounts).toEqual([10, 20, 30, 40]);
    expect(cleanSettings({ initialBuyIn: 0, rebuyAmounts: [70] })).toEqual(DEFAULT_SETTINGS);
    expect(cleanSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('changes the rounding of the open table only', () => {
    let s = gameReducer(initialState, { type: 'openTable', settings: { initialBuyIn: 30, rebuyAmounts: [30, 60] } });
    s = gameReducer(seat(s, 'א'), { type: 'setRounding', unit: 50 });
    expect(s.settings).toEqual({ initialBuyIn: 30, rebuyAmounts: [30, 60], rounding: 50 });
    expect(s.players).toHaveLength(1);
    expect(gameReducer(s, { type: 'setRounding', unit: 3 }).settings.rounding).toBe(10);
  });

  it('changes the buy-in buttons mid-game, keeping players and rounding', () => {
    let s = gameReducer(initialState, { type: 'openTable', settings: { initialBuyIn: 50, rebuyAmounts: [50, 100], rounding: 5 } });
    s = gameReducer(s, { type: 'startGame' });
    s = add(s, 'א', 0, 50);
    s = gameReducer(s, { type: 'setAmounts', initialBuyIn: 200, rebuyAmounts: [500, 200, 1000] });
    expect(s.settings).toEqual({ initialBuyIn: 200, rebuyAmounts: [200, 500, 1000], rounding: 5 });
    expect(totalIn(s.players[0])).toBe(50);
    // Invalid amounts fall back to the defaults instead of breaking the table.
    expect(gameReducer(s, { type: 'setAmounts', initialBuyIn: 0, rebuyAmounts: [] }).settings.rebuyAmounts).toEqual(DEFAULT_SETTINGS.rebuyAmounts);
  });

  it('a new game closes the table but remembers the settings', () => {
    let s = gameReducer(initialState, { type: 'openTable', settings: { initialBuyIn: 30, rebuyAmounts: [30, 60] } });
    s = gameReducer(seat(s, 'א'), { type: 'newGame' });
    expect(s.tableOpen).toBe(false);
    expect(s.players).toEqual([]);
    expect(s.settings.rebuyAmounts).toEqual([30, 60]);
  });

  it('treats an old save with players as an open table with default settings', () => {
    const s = normalizeState({ players: [{ id: 'x', name: 'x', seat: 0, color: 0, buyIns: [50] }] });
    expect(s.tableOpen).toBe(true);
    expect(s.settings).toEqual(DEFAULT_SETTINGS);
    expect(normalizeState({ players: [] }).tableOpen).toBe(false);
  });
});

describe('setup (before the game starts)', () => {
  it('seats players in the exact seat tapped, or the first free one', () => {
    let s = seat(seat(initialState, 'א', 4), 'ב', 0);
    s = seat(s, 'ג');
    expect(seats(s)).toEqual({ א: 4, ב: 0, ג: 1 });
    expect(seat(s, 'ד', 4).players).toHaveLength(3); // seat taken
  });

  it('stops at 9 seats', () => {
    let s = initialState;
    for (let i = 0; i < MAX_PLAYERS + 1; i++) s = seat(s, `p${i}`);
    expect(s.players).toHaveLength(MAX_PLAYERS);
  });

  it('frees the seat on removal and lets players move to empty seats', () => {
    let s = seat(seat(initialState, 'א', 2), 'ב', 5);
    s = gameReducer(s, { type: 'removePlayer', id: s.players[0].id });
    expect(seats(s)).toEqual({ ב: 5 });
    s = gameReducer(s, { type: 'moveSeat', id: s.players[0].id, seat: 8 });
    expect(seats(s)).toEqual({ ב: 8 });
  });

  it('starting the game closes the gaps, keeping the order around the table', () => {
    let s = seat(seat(seat(initialState, 'א', 7), 'ב', 1), 'ג', 4);
    s = gameReducer(s, { type: 'startGame' });
    expect(s.started).toBe(true);
    expect(seats(s)).toEqual({ ב: 0, ג: 1, א: 2 });
  });

  it('a new game goes back to setup', () => {
    const s = gameReducer(gameReducer(seat(initialState, 'א'), { type: 'startGame' }), { type: 'newGame' });
    expect(s.started).toBe(false);
    expect(s.players).toEqual([]);
  });
});

describe('gameReducer (game started)', () => {
  it('adds players and tracks buy-ins', () => {
    let s = add(started, 'עידו', 0, 100);
    const id = s.players[0].id;
    s = gameReducer(s, { type: 'addBuyIn', id, amount: 50 });
    expect(totalIn(s.players[0])).toBe(150);
    expect(s.players[0].buyIns).toHaveLength(2);
    s = gameReducer(s, { type: 'undoBuyIn', id });
    expect(totalIn(s.players[0])).toBe(100);
  });

  it('records when each buy-in happened, and undo drops its time too', () => {
    let s = gameReducer(started, { type: 'addPlayer', position: 0, name: 'א', amount: 50, at: 1000 });
    const id = s.players[0].id;
    s = gameReducer(s, { type: 'addBuyIn', id, amount: 100, at: 2000 });
    expect(timesOf(s.players[0])).toEqual([1000, 2000]);
    s = gameReducer(s, { type: 'undoBuyIn', id });
    expect(timesOf(s.players[0])).toEqual([1000]);
  });

  it('shows no time for buy-ins saved before times were tracked', () => {
    let s = { ...started, players: [{ id: 'x', name: 'x', seat: 0, color: 0, buyIns: [50, 50] }] };
    s = gameReducer(s, { type: 'addBuyIn', id: 'x', amount: 100, at: 3000 });
    expect(timesOf(s.players[0])).toEqual([null, null, 3000]);
  });

  it('never undoes the initial buy-in', () => {
    let s = add(started, 'אור');
    s = gameReducer(s, { type: 'undoBuyIn', id: s.players[0].id });
    expect(s.players[0].buyIns).toEqual([100]);
  });

  it('inserts a player between others and keeps seats contiguous', () => {
    let s = add(add(add(started, 'א'), 'ב'), 'ג');
    s = add(s, 'חדש', 1);
    expect(order(s)).toEqual(['א', 'חדש', 'ב', 'ג']);
    s = gameReducer(s, { type: 'removePlayer', id: s.players.find((p) => p.name === 'א').id });
    expect(order(s)).toEqual(['חדש', 'ב', 'ג']);
    expect(s.players.map((p) => p.seat).sort()).toEqual([0, 1, 2]);
  });

  it(`caps the table at ${MAX_PLAYERS} players`, () => {
    let s = started;
    for (let i = 0; i < MAX_PLAYERS + 2; i++) s = add(s, `p${i}`);
    expect(s.players).toHaveLength(MAX_PLAYERS);
  });

  it('swaps players when dragged onto another seat', () => {
    let s = add(add(add(started, 'א'), 'ב'), 'ג');
    s = gameReducer(s, { type: 'moveSeat', id: s.players[0].id, seat: 2 });
    expect(order(s)).toEqual(['ג', 'ב', 'א']);
  });

  it('stores final chips and clears everything on a new game', () => {
    let s = add(started, 'א');
    const id = s.players[0].id;
    s = gameReducer(s, { type: 'setFinal', id, amount: 0 });
    expect(s.finals[id]).toBe(0);
    s = gameReducer(s, { type: 'setFinal', id, amount: null });
    expect(id in s.finals).toBe(false);
    s = gameReducer(s, { type: 'newGame' });
    expect(s).toEqual(initialState);
  });

  it('takes results as profit/loss by default and converts when switching to chips', () => {
    let s = add(started, 'א', 0, 150);
    const p = s.players[0];
    s = gameReducer(s, { type: 'setFinal', id: p.id, amount: -70 });
    expect(netOf(s, p)).toBe(-70);
    s = gameReducer(s, { type: 'setEndMode', mode: 'chips' });
    expect(s.finals[p.id]).toBe(80);
    expect(netOf(s, p)).toBe(-70);
    s = gameReducer(s, { type: 'setEndMode', mode: 'net' });
    expect(s.finals[p.id]).toBe(-70);
  });

  it('computes the pot', () => {
    const s = add(add(started, 'א', 0, 100), 'ב', 1, 200);
    expect(potTotal(s.players)).toBe(300);
  });

  it('closes seat gaps in old saved games', () => {
    const s = normalizeState({ players: [{ id: 'x', name: 'x', seat: 7, color: 0, buyIns: [100] }], view: 'table' });
    expect(s.players[0].seat).toBe(0);
    expect(s.finals).toEqual({});
    expect(s.endMode).toBe('net');
    expect(s.started).toBe(true); // old save with players = mid-game
    expect(normalizeState({ players: [] }).started).toBe(false);
    expect(normalizeState({ players: [], finals: { x: 300 } }).endMode).toBe('chips');
  });
});

describe('initials', () => {
  it('takes the first letter of up to two words', () => {
    expect(initials('עידו כהן')).toBe('עכ');
    expect(initials('שקד')).toBe('ש');
    expect(initials('  ')).toBe('?');
  });
});

describe('leaving mid-game', () => {
  const game = (mode = 'net') => {
    let s = { ...add(add(started, 'א', 0, 100), 'ב', 1, 50), endMode: mode };
    s = gameReducer(s, { type: 'addBuyIn', id: s.players[0].id, amount: 100 });
    return s;
  };
  const out = (s, kind, chips) => gameReducer(s, { type: 'markOut', id: s.players[0].id, kind, chips });

  it('"הפסיד הכל" leaves with 0 and prefills the result', () => {
    const s = out(game(), 'lost_all');
    expect(s.players[0].out).toEqual({ kind: 'lost_all', chips: 0 });
    expect(netOf(s, s.players[0])).toBe(-200);
  });

  it('"מאוזן" leaves with what they put in', () => {
    const s = out(game('chips'), 'even');
    expect(s.players[0].out).toEqual({ kind: 'even', chips: 200 });
    expect(s.finals[s.players[0].id]).toBe(200);
    expect(netOf(s, s.players[0])).toBe(0);
  });

  it('"יצא עם סכום" keeps the typed amount, in either end mode', () => {
    const s = out(game(), 'amount', 260);
    expect(netOf(s, s.players[0])).toBe(60);
    expect(netOf(gameReducer(s, { type: 'setEndMode', mode: 'chips' }), s.players[0])).toBe(60);
  });

  it('stays in the seat, gets no buy-ins while out, and "חזר לשחק" undoes it', () => {
    let s = out(game(), 'lost_all');
    expect(s.players[0].seat).toBe(0);
    s = gameReducer(s, { type: 'addBuyIn', id: s.players[0].id, amount: 50 });
    expect(totalIn(s.players[0])).toBe(200);
    s = gameReducer(s, { type: 'markBack', id: s.players[0].id });
    expect(s.players[0].out).toBeNull();
    expect(s.finals).toEqual({});
    s = gameReducer(s, { type: 'addBuyIn', id: s.players[0].id, amount: 50 });
    expect(totalIn(s.players[0])).toBe(250);
  });

  it('ignores an unknown exit kind', () => {
    const s = game();
    expect(out(s, 'flew', 5)).toBe(s);
  });
});
