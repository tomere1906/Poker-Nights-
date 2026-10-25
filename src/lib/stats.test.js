import { describe, expect, it } from 'vitest';
import { personalStats, sortMates, withAverages } from './stats.js';

const day = (n) => Date.UTC(2026, 9, n, 22);
const game = (n, net, buyInTotal = 100, buyInCount = 1) => ({
  tableId: `t${n}`,
  tableName: `ערב ${n}`,
  endedAt: day(n),
  net,
  buyInTotal,
  buyInCount,
  playerCount: 5,
});

describe('personalStats', () => {
  // Given out of order on purpose: everything is computed by date.
  const games = [game(3, -100, 100, 1), game(1, 50), game(2, 120, 200, 3), game(5, 30), game(4, 0, 150, 2), game(6, 40)];
  const s = personalStats(games);

  it('counts games, total and a whole-shekel average', () => {
    expect(s.count).toBe(6);
    expect(s.total).toBe(140);
    expect(s.average).toBe(23); // 140 / 6 = 23.3
  });

  it('finds the best and worst night', () => {
    expect(s.best.tableId).toBe('t2');
    expect(s.worst.tableId).toBe('t3');
  });

  it('counts "הפסיד הכל" nights (left with nothing)', () => {
    expect(s.lostAll).toBe(1);
  });

  it('averages buy-ins per night', () => {
    expect(s.avgBuyIns).toBe(1.5); // (1+1+3+1+2+1) / 6
    expect(s.avgBuyInAmount).toBe(125); // 750 / 6
  });

  it('tracks the current and best winning streak (an even night breaks it)', () => {
    // nights: +50 +120 −100 0 +30 +40 → best 2, current 2
    expect(s.bestStreak).toBe(2);
    expect(s.currentStreak).toBe(2);
    expect(personalStats([game(1, 10), game(2, 20), game(3, 30), game(4, -5)])).toMatchObject({ bestStreak: 3, currentStreak: 0 });
  });

  it('builds the cumulative series in date order, and the list newest first', () => {
    expect(s.series.map((g) => g.cumulative)).toEqual([50, 170, 70, 70, 100, 140]);
    expect(s.recent[0].tableId).toBe('t6');
  });

  it('handles no games at all', () => {
    expect(personalStats([])).toMatchObject({ count: 0, total: 0, average: 0, best: null, worst: null, currentStreak: 0, bestStreak: 0 });
  });
});

describe('tablemates', () => {
  const mates = withAverages([
    { key: 'a', name: 'אסף', games: 4, total: 100 },
    { key: 'b', name: 'בן', games: 1, total: 150 },
    { key: 'g', name: 'דני', isGuest: true, games: 2, total: -40 },
  ]);

  it('adds a whole-shekel average', () => {
    expect(mates.map((m) => m.average)).toEqual([25, 150, -20]);
  });

  it('sorts by total, games or average', () => {
    expect(sortMates(mates, 'total').map((m) => m.key)).toEqual(['b', 'a', 'g']);
    expect(sortMates(mates, 'games').map((m) => m.key)).toEqual(['a', 'g', 'b']);
    expect(sortMates(mates, 'average').map((m) => m.key)).toEqual(['b', 'a', 'g']);
  });
});
