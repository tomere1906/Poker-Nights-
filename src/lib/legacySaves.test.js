import { describe, expect, it } from 'vitest';
import { gameReducer, isLegacyGame, netOf, normalizeState, potTotal, seatedPlayers } from './game.js';
import { settle } from './settlement.js';
import saves from './fixtures/legacy-saves.json';

// Local games saved on phones by older versions must open in this one with
// nothing lost. The fixtures were made by running the older versions' own
// reducers (the live version on main before the 2026-11 release, and v1):
//   midGame: chip value 0.5, רון left with "הפסיד הכל" and paid 200 cash,
//            מאיה left with 160 ₪; both kept their seats (that version did).
//   endGame: the same table on the end-game screen, every result typed.
//   v1:      a game from the first version (no start screen, no settings).
// The expected nets are what those versions themselves computed.
const load = (save) => normalizeState(JSON.parse(JSON.stringify(save)));
const byName = (s) => Object.fromEntries(s.players.map((p) => [p.name, p]));
const nets = (s) => Object.fromEntries(s.players.map((p) => [p.name, netOf(s, p)]));

describe('local games saved by the live version (before this release)', () => {
  it('a game in progress keeps its players, buy-ins, cash, settings and screen', () => {
    const s = load(saves.midGame);
    expect(s.players.map((p) => p.name)).toEqual(['דני', 'רון', 'מאיה', 'עידו']);
    expect(potTotal(s.players)).toBe(potTotal(saves.midGame.players));
    expect(s.cash).toEqual(saves.midGame.cash);
    expect(s.settings.chipValue).toBe(0.5);
    expect(s).toMatchObject({ tableOpen: true, started: true, view: saves.midGame.view });
    expect(isLegacyGame(saves.midGame)).toBe(false); // it has a start screen: it opens there
  });

  it('…players who left give up their seat now, with the same results', () => {
    const s = load(saves.midGame);
    const p = byName(s);
    expect(p['רון'].out).toEqual({ kind: 'lost_all', chips: 0 });
    expect(p['מאיה'].out).toEqual({ kind: 'amount', chips: 160 });
    expect(p['רון'].seat).toBeNull();
    expect(seatedPlayers(s.players).map((x) => [x.name, x.seat])).toEqual([['דני', 0], ['עידו', 1]]);
    expect(nets(s)).toEqual({ דני: null, רון: -300, מאיה: 60, עידו: null });
  });

  it('…and the game goes on: buy-ins, coming back, results', () => {
    let s = load(saves.midGame);
    const p = byName(s);
    s = gameReducer(s, { type: 'addBuyIn', id: p['דני'].id, amount: 100, at: 1 });
    s = gameReducer(s, { type: 'markBack', id: p['רון'].id });
    expect(byName(s)['דני'].buyIns).toEqual([100, 100]);
    expect(byName(s)['רון']).toMatchObject({ out: null, seat: 2 });
  });

  it('the end-game screen keeps every typed result and settles to the same nets', () => {
    const s = load(saves.endGame);
    expect(s.view).toBe('end');
    expect(nets(s)).toEqual({ דני: 160, רון: -300, מאיה: 60, עידו: 80 });
    const { transfers } = settle(s.players.map((p) => ({ id: p.id, net: netOf(s, p) })), { unit: 10, cash: s.cash });
    const balance = Object.fromEntries(s.players.map((p) => [p.id, 0]));
    for (const t of transfers) {
      balance[t.from] -= t.amount;
      balance[t.to] += t.amount;
    }
    expect(s.players.map((p) => balance[p.id])).toEqual(s.players.map((p) => netOf(s, p)));
  });
});

describe('local games saved by v1', () => {
  it('open straight onto the table with players, buy-ins and typed results', () => {
    expect(isLegacyGame(saves.v1)).toBe(true);
    const s = load(saves.v1);
    expect(s.players.map((p) => [p.name, p.buyIns])).toEqual([['אסף', [50]], ['שקד', [50]], ['בן', [50, 100]]]);
    expect(s).toMatchObject({ tableOpen: true, started: true, view: 'end', endMode: 'net' });
    expect(nets(s)).toEqual({ אסף: 70, שקד: null, בן: null });
  });
});
