import { describe, expect, it } from 'vitest';
import { MIN_TRANSFER, ROUNDING_UNITS, cashRoom, roundNets, roundTo, settle } from './settlement.js';

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

describe('cash paid into the pot', () => {
  // The real game (the list ended at Ben; Tomer +125 is the missing winner that
  // makes it add up). Nadav lost 250 and left 200 cash, Fouad lost 155 and left 150.
  const night = entries({ nadav: -250, fouad: -155, yuri: -50, kashkash: -250, omer: 300, ido: 150, ben: 130, tomer: 125 });
  const cash = [
    { from: 'nadav', amount: 200 },
    { from: 'fouad', amount: 150 },
  ];

  const sum = (list, key, who) => list.filter((x) => x[key] === who).reduce((s, x) => s + x.amount, 0);
  // Everyone ends at 0: own net + cash paid + transfers sent = cash received + transfers received.
  function expectSettled({ nets, cashPaid, cashSplit, transfers }) {
    for (const { id, net } of nets) {
      expect(net + sum(cashPaid, 'from', id) + sum(transfers, 'from', id)).toBe(sum(cashSplit, 'to', id) + sum(transfers, 'to', id));
    }
    // The whole pot is split, only to winners, and nobody paid more cash than they lost.
    expect(cashSplit.reduce((s, l) => s + l.amount, 0)).toBe(cashPaid.reduce((s, c) => s + c.amount, 0));
    const won = new Map(nets.map((e) => [e.id, e.net]));
    for (const l of cashSplit) expect(l.amount).toBeLessThanOrEqual(won.get(l.to));
    for (const [id, net] of won) expect(sum(cashPaid, 'from', id)).toBeLessThanOrEqual(Math.max(0, -net));
    // One line per payer, one line per winner.
    expect(new Set(cashPaid.map((c) => c.from)).size).toBe(cashPaid.length);
    expect(new Set(cashSplit.map((l) => l.to)).size).toBe(cashSplit.length);
  }

  it('the real night: only what is still owed is transferred (unit 1)', () => {
    const result = settle(night, { unit: 1, cash });
    expectSettled(result);
    expect(result.cashPaid).toEqual([
      { from: 'nadav', amount: 200 },
      { from: 'fouad', amount: 150 },
    ]);
    // 350 in the pot: as few lines as possible (two winners).
    expect(result.cashSplit).toHaveLength(2);
    const sent = (id) => sum(result.transfers, 'from', id);
    expect(sent('nadav')).toBe(50);
    expect(sent('fouad')).toBe(5);
    expect(sent('kashkash')).toBe(250);
    expect(sent('yuri')).toBe(50);
    // Only Fouad's 5 (all he still owes) is under 20.
    expect(result.transfers.filter((t) => t.amount < MIN_TRANSFER)).toEqual([expect.objectContaining({ from: 'fouad', amount: 5 })]);
    // The night's results don't depend on how they were paid.
    expect(result.nets).toEqual(settle(night, { unit: 1 }).nets);
  });

  it('the real night with rounding (unit 10)', () => {
    const result = settle(night, { unit: 10, cash });
    expectSettled(result);
    expect(result.nets.find((e) => e.id === 'fouad').net).toBe(-160);
    expect(result.cashSplit).toHaveLength(2);
    expect(result.transfers.every((t) => t.amount % 10 === 0)).toBe(true);
    expect(sum(result.transfers, 'from', 'nadav')).toBe(50);
    expect(sum(result.transfers, 'from', 'fouad')).toBe(10);
    expect(result.transfers.filter((t) => t.amount < MIN_TRANSFER).map((t) => t.from)).toEqual(['fouad']);
  });

  it('Nadav lost 250 and paid 200: 200 from the pot to a winner, Nadav transfers 50', () => {
    const result = settle(entries({ nadav: -250, omer: 250 }), { cash: [{ from: 'nadav', amount: 200 }] });
    expect(result.cashPaid).toEqual([{ from: 'nadav', amount: 200 }]);
    expect(result.cashSplit).toEqual([{ to: 'omer', amount: 200 }]);
    expect(result.transfers).toEqual([{ from: 'nadav', to: 'omer', amount: 50 }]);
  });

  it('several payments by one player are one line', () => {
    const result = settle(entries({ a: -300, b: 300 }), {
      cash: [
        { from: 'a', amount: 100 },
        { from: 'a', amount: 50 },
      ],
    });
    expect(result.cashPaid).toEqual([{ from: 'a', amount: 150 }]);
    expect(result.cashSplit).toEqual([{ to: 'b', amount: 150 }]);
  });

  it('fills winners in full where it can (fewest lines)', () => {
    const result = settle(entries({ a: -300, b: 100, c: 120, d: 80 }), { cash: [{ from: 'a', amount: 300 }] });
    expectSettled(result);
    expect(result.transfers).toEqual([]);
    expect(result.cashSplit).toHaveLength(3);
    const one = settle(entries({ a: -100, b: -100, c: 200 }), { cash: [{ from: 'a', amount: 100 }, { from: 'b', amount: 100 }] });
    expect(one.cashSplit).toEqual([{ to: 'c', amount: 200 }]);
  });

  it('never gives change: cash above the loss is capped at the loss', () => {
    const result = settle(entries({ a: -150, b: 150 }), { cash: [{ from: 'a', amount: 200 }] });
    expect(result.cashPaid).toEqual([{ from: 'a', amount: 150 }]);
    expect(result.cashSplit).toEqual([{ to: 'b', amount: 150 }]);
    expect(result.transfers).toEqual([]);
    // A winner's cash doesn't count at all.
    expect(settle(entries({ a: 50, b: -50 }), { cash: [{ from: 'a', amount: 20 }] }).cashPaid).toEqual([]);
    // Several entries: only what fits in the loss, in order.
    const two = settle(entries({ a: -100, b: 100 }), { cash: [{ from: 'a', amount: 70 }, { from: 'a', amount: 50 }] });
    expect(two.cashPaid).toEqual([{ from: 'a', amount: 100 }]);
  });

  it('cashRoom: how much more cash a player may pay', () => {
    const paid = [{ from: 'a', amount: 200 }];
    expect(cashRoom(-250, paid, 'a')).toBe(50);
    expect(cashRoom(-250, [], 'a')).toBe(250);
    expect(cashRoom(-150, paid, 'a')).toBe(0);
    expect(cashRoom(40, [], 'a')).toBe(0);
    expect(cashRoom(null, [], 'a')).toBe(0);
  });

  it('ignores invalid cash entries', () => {
    const plain = settle(entries({ a: -50, b: 50 }));
    const bad = [
      { from: 'x', amount: 50 },
      { from: 'a', amount: 0 },
      { from: 'a', amount: 2.5 },
    ];
    expect(settle(entries({ a: -50, b: 50 }), { cash: bad })).toEqual(plain);
  });

  it('random nights with cash always settle', () => {
    let seed = 7;
    const rand = (n) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    for (let round = 0; round < 150; round++) {
      const ids = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'].slice(0, 3 + rand(4));
      const nets = ids.map((id) => ({ id, net: (rand(60) - 30) * 5 }));
      nets[0].net -= nets.reduce((s, e) => s + e.net, 0);
      const paid = nets.filter((e) => e.net < 0 && rand(2)).map((e) => ({ from: e.id, amount: 1 + rand(-e.net) }));
      const result = settle(nets, { unit: ROUNDING_UNITS[rand(4)], cash: paid });
      expectSettled(result);
      expect(result.transfers.every((t) => Number.isInteger(t.amount) && t.amount > 0)).toBe(true);
    }
  });
});
