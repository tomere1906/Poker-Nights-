import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS, gameReducer, initialState, initials, netOf, normalizeState, potTotal, totalIn } from './game.js';

function add(state, name, position = state.players.length, amount = 100) {
  return gameReducer(state, { type: 'addPlayer', position, name, amount });
}

const order = (state) => [...state.players].sort((a, b) => a.seat - b.seat).map((p) => p.name);
const started = { ...initialState, started: true };
const seat = (state, name, seatNo = null) => gameReducer(state, { type: 'seatPlayer', seat: seatNo, name, amount: 50 });
const seats = (state) => Object.fromEntries(state.players.map((p) => [p.name, p.seat]));

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
