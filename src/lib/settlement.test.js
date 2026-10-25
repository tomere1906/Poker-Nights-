import { describe, expect, it } from 'vitest';
import { MIN_TRANSFER, ROUNDING_UNITS, roundNets, roundTo, settle } from './settlement.js';

const entries = (obj) => Object.entries(obj).map(([id, net]) => ({ id, net }));

// Every player's transfers must add up exactly to their rounded net.
function expectBalanced({ nets, transfers }) {
  const got = new Map(nets.map((e) => [e.id, 0]));
  for (const t of transfers) {
    expect(Number.isInteger(t.amount)).toBe(true);
    expect(t.amount).toBeGreaterThan(0);
    got.set(t.from, got.get(t.from) - t.amount);
    got.set(t.to, got.get(t.to) + t.amount);
  }
  for (const e of nets) expect(got.get(e.id)).toBe(e.net);
}

describe('roundNets', () => {
  it('rounds to whole shekels and puts the imbalance on the biggest winner', () => {
    const nets = roundNets(entries({ a: 100.4, b: -90, c: 20 }));
    expect(nets).toEqual([
      { id: 'a', net: 70 },
      { id: 'b', net: -90 },
      { id: 'c', net: 20 },
    ]);
  });
});

describe('settle', () => {
  it('handles the reference game', () => {
    const result = settle(
      entries({ Ido: 130, Or: -500, Fouad: -65, Ben: -70, Shaked: 152.5, Asaf: -175, As: 200, Yuri: 325 })
    );
    expectBalanced(result);
    expect(result.nets.reduce((s, e) => s + e.net, 0)).toBe(0);
    expect(result.nets.every((e) => Number.isInteger(e.net))).toBe(true);
    expect(result.transfers.every((t) => t.amount >= MIN_TRANSFER)).toBe(true);
    expect(result.transfers.length).toBeLessThanOrEqual(7);
  });

  it('uses a single transfer for two players', () => {
    expect(settle(entries({ a: -100, b: 100 })).transfers).toEqual([{ from: 'a', to: 'b', amount: 100 }]);
  });

  it('re-arranges pairings instead of leaving a small leftover', () => {
    // Greedy (biggest to biggest) gives a 10 ₪ transfer here.
    const result = settle(entries({ L1: -100, L2: -60, W1: 90, W2: 70 }));
    expectBalanced(result);
    expect(result.transfers).toHaveLength(3);
    expect(result.transfers.every((t) => t.amount >= MIN_TRANSFER)).toBe(true);
  });

  it('adds a transfer rather than leave a small one', () => {
    // Any 3-transfer plan here has a 10 ₪ transfer; 4 transfers avoid it.
    const result = settle(entries({ a: 185, b: -175, c: -190, d: 180 }));
    expectBalanced(result);
    expect(result.transfers).toHaveLength(4);
    expect(result.transfers.every((t) => t.amount >= MIN_TRANSFER)).toBe(true);
  });

  it('only keeps small transfers that belong to a tiny result', () => {
    let seed = 42;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let round = 0; round < 300; round++) {
      const n = 4 + Math.floor(rand() * 4);
      const nets = Array.from({ length: n - 1 }, () => Math.round((rand() - 0.5) * 120) * 5);
      nets.push(-nets.reduce((a, b) => a + b, 0));
      const result = settle(nets.map((net, i) => ({ id: `p${i}`, net })));
      expectBalanced(result);
      const tiny = new Set(result.nets.filter((e) => e.net !== 0 && Math.abs(e.net) < MIN_TRANSFER).map((e) => e.id));
      for (const t of result.transfers) {
        if (t.amount < MIN_TRANSFER) expect(tiny.has(t.from) || tiny.has(t.to)).toBe(true);
      }
    }
  });

  it('finds independent groups to minimize transfers', () => {
    const result = settle(entries({ a: -50, b: 50, c: -80, d: 80 }));
    expectBalanced(result);
    expect(result.transfers).toHaveLength(2);
  });

  it('falls back to a small transfer only when unavoidable', () => {
    const result = settle(entries({ a: -100, b: 90, c: 10 }));
    expectBalanced(result);
    expect(result.transfers.filter((t) => t.amount < MIN_TRANSFER)).toHaveLength(1);
  });

  it('returns no transfers when everyone breaks even', () => {
    expect(settle(entries({ a: 0, b: 0 })).transfers).toEqual([]);
  });

  it('stays balanced and fast on random 9-player games', () => {
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const start = Date.now();
    for (let round = 0; round < 30; round++) {
      const nets = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, net: Math.round((rand() - 0.5) * 80) * 5 }));
      const result = settle(nets);
      expectBalanced(result);
      expect(result.transfers.length).toBeLessThanOrEqual(8);
    }
    expect(Date.now() - start).toBeLessThan(5000);
  });
});

describe('rounding ("עיגול סכומים")', () => {
  const multipleOf = (unit) => (n) => n % unit === 0;

  it('rounds to the unit; halves go away from zero', () => {
    expect([155, 45, -155, -45, 152.5, 4].map((n) => roundTo(n, 10))).toEqual([160, 50, -160, -50, 150, 0]);
    expect([155, 45, 74, 76].map((n) => roundTo(n, 50))).toEqual([150, 50, 50, 100]);
    expect([152.5, -0.5].map((n) => roundTo(n, 1))).toEqual([153, -1]);
  });

  it('turns +155 / +45 into round amounts (the example)', () => {
    const result = settle(entries({ a: 155, b: 45, c: -200 }), { unit: 10 });
    // 160 + 50 − 200 = +10 too much: the biggest winner absorbs it.
    expect(result.nets).toEqual([
      { id: 'a', net: 150 },
      { id: 'b', net: 50 },
      { id: 'c', net: -200 },
    ]);
    expect(result.transfers).toEqual([
      { from: 'c', to: 'a', amount: 150 },
      { from: 'c', to: 'b', amount: 50 },
    ]);
  });

  it('keeps every net and every transfer a multiple of the unit, balanced and >= 20 ₪', () => {
    const reference = entries({ Ido: 130, Or: -500, Fouad: -65, Ben: -70, Shaked: 152.5, Asaf: -175, As: 200, Yuri: 325 });
    for (const unit of ROUNDING_UNITS) {
      const result = settle(reference, { unit });
      expectBalanced(result);
      expect(result.nets.reduce((s, e) => s + e.net, 0)).toBe(0);
      expect(result.nets.every((e) => multipleOf(unit)(e.net))).toBe(true);
      expect(result.transfers.every((t) => multipleOf(unit)(t.amount))).toBe(true);
      expect(result.transfers.every((t) => t.amount >= MIN_TRANSFER)).toBe(true);
      expect(result.transfers.length).toBeLessThanOrEqual(7);
    }
  });

  it('stays round on random games too', () => {
    let seed = 11;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const unit of ROUNDING_UNITS) {
      for (let round = 0; round < 10; round++) {
        const raw = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, net: Math.round((rand() - 0.5) * 600) }));
        // Make the raw results add up to 0, like a real (correctly counted) game.
        raw[0].net -= raw.reduce((s, e) => s + e.net, 0);
        const result = settle(raw, { unit });
        expectBalanced(result);
        expect(result.nets.every((e) => multipleOf(unit)(e.net))).toBe(true);
        expect(result.transfers.every((t) => multipleOf(unit)(t.amount))).toBe(true);
      }
    }
  });

  it('with unit 1 behaves exactly as before', () => {
    const game = entries({ Ido: 130, Or: -500, Fouad: -65, Ben: -70, Shaked: 152.5, Asaf: -175, As: 200, Yuri: 325 });
    expect(settle(game, { unit: 1 })).toEqual(settle(game));
  });
});
