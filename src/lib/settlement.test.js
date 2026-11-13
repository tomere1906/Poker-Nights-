import { describe, expect, it } from 'vitest';
import {
  MIN_TRANSFER,
  ROUNDING_UNITS,
  adjustNets,
  adjustReady,
  cashParts,
  cashRoom,
  cleanAdjust,
  countingGap,
  needsAdjust,
  roundNets,
  roundTo,
  settle,
  splitUnfitBills,
  storedAdjustment,
  transferProblems,
} from './settlement.js';

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
    expect(settle(entries({ a: -100, b: 100 })).transfers).toEqual([{ from: 'a', to: 'b', amount: 100, cash: 0 }]);
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
      { from: 'c', to: 'a', amount: 150, cash: 0 },
      { from: 'c', to: 'b', amount: 50, cash: 0 },
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

describe('cash paid when settling', () => {
  // The real game, balanced without the player missing from the list: Omer's
  // win takes the missing 125. Nadav lost 250 and left 200 cash, Fouad lost 155 and left 150.
  const night = entries({ nadav: -250, fouad: -155, yuri: -50, kashkash: -250, omer: 425, ido: 150, ben: 130 });
  const cash = [
    { from: 'nadav', amount: 200 },
    { from: 'fouad', amount: 150 },
  ];

  const sum = (list, key, who, field = 'amount') => list.filter((x) => x[key] === who).reduce((s, x) => s + x[field], 0);
  const transferOf = (rows, who) => rows.filter((r) => r.from === who).reduce((s, r) => s + r.amount - r.cash, 0);

  // One list of rows: everyone ends at 0, each payer's cash is exactly what they
  // paid (never more than their loss), one row per payer → receiver.
  function expectRows({ nets, cashPaid, transfers }) {
    const balance = new Map(nets.map((e) => [e.id, e.net]));
    for (const r of transfers) {
      balance.set(r.from, balance.get(r.from) + r.amount);
      balance.set(r.to, balance.get(r.to) - r.amount);
      expect(r.cash).toBeGreaterThanOrEqual(0);
      expect(r.cash).toBeLessThanOrEqual(r.amount);
    }
    for (const v of balance.values()) expect(v).toBe(0);
    for (const { id, net } of nets) {
      expect(sum(transfers, 'from', id, 'cash')).toBe(sum(cashPaid, 'from', id));
      expect(sum(cashPaid, 'from', id)).toBeLessThanOrEqual(Math.max(0, -net));
    }
    // One row per payer → receiver pair (cash and transfer merged).
    expect(new Set(transfers.map((r) => r.from + '>' + r.to)).size).toBe(transfers.length);
  }

  it('the real night: only what is still owed is transferred (unit 1)', () => {
    // The example adds up on its own (nothing absorbed by the biggest winner).
    expect(night.reduce((s, e) => s + e.net, 0)).toBe(0);
    const result = settle(night, { unit: 1, cash });
    expect(result.nets).toEqual(night);
    expectRows(result);
    expect(result.cashPaid).toEqual([
      { from: 'nadav', amount: 200 },
      { from: 'fouad', amount: 150 },
    ]);
    expect(transferOf(result.transfers, 'nadav')).toBe(50);
    expect(transferOf(result.transfers, 'fouad')).toBe(5);
    expect(transferOf(result.transfers, 'kashkash')).toBe(250);
    expect(transferOf(result.transfers, 'yuri')).toBe(50);
    // Nadav's 200 cash and 50 transfer to the same winner are one row.
    expect(result.transfers.find((r) => r.from === 'nadav')).toMatchObject({ amount: 250, cash: 200 });
    // The night's results don't depend on how they were paid.
    const plain = settle(night, { unit: 1 });
    expect(result.nets).toEqual(plain.nets);
    expect(plain.transfers.every((r) => r.cash === 0)).toBe(true);
  });

  it('the real night with rounding (unit 10)', () => {
    const result = settle(night, { unit: 10, cash });
    expectRows(result);
    expect(result.nets.find((e) => e.id === 'fouad').net).toBe(-160);
    expect(result.transfers.every((r) => r.amount % 10 === 0)).toBe(true);
    expect(transferOf(result.transfers, 'nadav')).toBe(50);
    expect(transferOf(result.transfers, 'fouad')).toBe(10);
    // Rows stay ≥ 20 ₪; the only small one is Fouad's last 10 (all he still owes).
    expect(result.transfers.filter((r) => r.amount < MIN_TRANSFER)).toEqual([expect.objectContaining({ from: 'fouad', amount: 10, cash: 0 })]);
    // Each bill went whole: Nadav's 200 to one winner, Fouad's 150 to one winner.
    expect(result.transfers.filter((r) => r.cash > 0).map((r) => r.cash).sort()).toEqual([150, 200]);
  });

  it('Ben −430 with one 200 bill: the bill goes whole to one winner, fewest rows', () => {
    const result = settle(entries({ ben: -430, shaked: -250, ido: -150, fouad: 270, kashkash: 160, tomer: 400 }), {
      cash: [{ from: 'ben', amount: 200 }],
    });
    expectRows(result);
    expect(result.transfers).toEqual([
      { from: 'ben', to: 'fouad', amount: 270, cash: 200 },
      { from: 'ben', to: 'kashkash', amount: 160, cash: 0 },
      { from: 'shaked', to: 'tomer', amount: 250, cash: 0 },
      { from: 'ido', to: 'tomer', amount: 150, cash: 0 },
    ]);
    expect(cashParts(result.transfers[0])).toEqual({ cash: 200, transfer: 70 });
  });

  it('cash goes only to winners who are present; an absent winner gets a transfer', () => {
    // Ido pays 150 cash. Tomer is owed exactly 150 but left early.
    const nets = entries({ ido: -150, yuri: -200, tomer: 150, omer: 200 });
    const cash = [{ from: 'ido', amount: 150 }];
    // Everyone here: the bill goes to the exact match (Tomer).
    expect(settle(nets, { cash }).transfers.find((r) => r.cash > 0)).toEqual({ from: 'ido', to: 'tomer', amount: 150, cash: 150 });
    // Tomer isn't here: the 150 goes whole to Omer, and Tomer is paid by transfer.
    const result = settle(nets, { cash, absent: ['tomer'] });
    expectRows(result);
    expect(result.transfers).toEqual([
      { from: 'yuri', to: 'tomer', amount: 150, cash: 0 },
      { from: 'yuri', to: 'omer', amount: 50, cash: 0 },
      { from: 'ido', to: 'omer', amount: 150, cash: 150 },
    ]);
  });

  it('the cash of a loser who left also goes to a winner who is present', () => {
    const result = settle(entries({ ido: -200, ben: -100, tomer: 200, omer: 100 }), {
      cash: [{ from: 'ido', amount: 100 }],
      absent: ['ido', 'omer'],
    });
    expectRows(result);
    expect(result.transfers.filter((r) => r.cash > 0)).toEqual([{ from: 'ido', to: 'tomer', amount: 200, cash: 100 }]);
  });

  it('absent marks change nothing when there is no cash', () => {
    const nets = entries({ a: -300, b: -50, c: 200, d: 150 });
    expect(settle(nets, { absent: ['c', 'd'] })).toEqual(settle(nets));
  });

  it('a bill bigger than every present winner: cash only to people who are here', () => {
    // 200 bill; the present winner is owed 100, the absent one 300. The whole 200
    // goes to the present winner, who passes the extra 100 on to the absent one.
    const result = settle(entries({ a: -400, here: 100, away: 300 }), { cash: [{ from: 'a', amount: 200 }], absent: ['away'] });
    expectRows(result);
    expect(result.transfers.filter((r) => r.cash > 0)).toEqual([{ from: 'a', to: 'here', amount: 200, cash: 200 }]);
    expect(result.transfers).toContainEqual({ from: 'here', to: 'away', amount: 100, cash: 0 });
  });

  it('no present winner: someone present takes the cash and passes it on (Ido → Fouad → Tomer)', () => {
    // Ido paid 150 cash, Tomer (the winner) left, Fouad is here and broke even.
    const result = settle(entries({ ido: -150, fouad: 0, tomer: 150 }), { cash: [{ from: 'ido', amount: 150 }], absent: ['tomer'] });
    expectRows(result);
    expect(result.transfers).toEqual([
      { from: 'ido', to: 'fouad', amount: 150, cash: 150 },
      { from: 'fouad', to: 'tomer', amount: 150, cash: 0 },
    ]);
  });

  it('…combined with the carrier\'s own debt when he lost too', () => {
    const result = settle(entries({ ido: -150, fouad: -100, tomer: 250 }), { cash: [{ from: 'ido', amount: 150 }], absent: ['tomer'] });
    expectRows(result);
    expect(result.transfers).toEqual([
      { from: 'ido', to: 'fouad', amount: 150, cash: 150 },
      { from: 'fouad', to: 'tomer', amount: 250, cash: 0 },
    ]);
  });

  it('…the manager takes it when he is here, even if he lost', () => {
    const nets = entries({ ido: -150, fouad: 0, omer: -50, tomer: 200 });
    const cash = [{ from: 'ido', amount: 150 }];
    const result = settle(nets, { cash, absent: ['tomer'], manager: 'omer' });
    expectRows(result);
    expect(result.transfers).toEqual([
      { from: 'ido', to: 'omer', amount: 150, cash: 150 },
      { from: 'omer', to: 'tomer', amount: 200, cash: 0 },
    ]);
    // An absent manager doesn't take it: someone else who is here does.
    const other = settle(nets, { cash, absent: ['tomer', 'omer'], manager: 'omer' });
    expectRows(other);
    expect(other.transfers.filter((r) => r.cash > 0)).toEqual([{ from: 'ido', to: 'fouad', amount: 150, cash: 150 }]);
  });

  it('nobody takes cash on the way while a present winner can', () => {
    // Omer (here) is owed 150: the bill goes straight to him, no carrier.
    const result = settle(entries({ ido: -150, fouad: 0, omer: 150, tomer: 100, yuri: -100 }), {
      cash: [{ from: 'ido', amount: 150 }],
      absent: ['tomer'],
      manager: 'fouad',
    });
    expectRows(result);
    expect(result.transfers.filter((r) => r.cash > 0)).toEqual([{ from: 'ido', to: 'omer', amount: 150, cash: 150 }]);
    expect(result.transfers.some((r) => r.from === 'fouad' || r.to === 'fouad')).toBe(false);
  });

  it('when the payer is the only one here the cash still settles', () => {
    const result = settle(entries({ a: -200, b: 200 }), { cash: [{ from: 'a', amount: 200 }], absent: ['b'] });
    expectRows(result);
    expect(result.transfers).toEqual([{ from: 'a', to: 'b', amount: 200, cash: 200 }]);
  });

  it('random nights with cash and absent players always settle', () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let round = 0; round < 60; round++) {
      const n = 3 + Math.floor(rand() * 5);
      const nets = Array.from({ length: n - 1 }, () => Math.round((rand() - 0.5) * 80) * 10);
      nets.push(-nets.reduce((s, x) => s + x, 0));
      const list = nets.map((net, i) => ({ id: 'p' + i, net }));
      const cash = list
        .filter((e) => e.net < 0 && rand() < 0.6)
        .map((e) => ({ from: e.id, amount: Math.min(-e.net, [50, 100, 200][Math.floor(rand() * 3)]) }));
      const absent = list.filter(() => rand() < 0.35).map((e) => e.id);
      const result = settle(list, { unit: 10, cash, absent });
      expectRows(result);
      // With two or more people here, cash never reaches an absent player.
      if (list.filter((e) => !absent.includes(e.id)).length >= 2) {
        expect(result.transfers.filter((r) => absent.includes(r.to)).every((r) => r.cash === 0)).toBe(true);
      }
    }
  });

  it('two 50 bills can go to two different winners', () => {
    const result = settle(entries({ a: -100, b: 50, c: 50 }), {
      cash: [
        { from: 'a', amount: 50 },
        { from: 'a', amount: 50 },
      ],
    });
    expectRows(result);
    expect(result.transfers).toEqual([
      { from: 'a', to: 'b', amount: 50, cash: 50 },
      { from: 'a', to: 'c', amount: 50, cash: 50 },
    ]);
  });

  it('a bill is never split while a winner can take it whole', () => {
    // 200 fits only Tomer (250): it goes there whole, not 100 + 100.
    const result = settle(entries({ a: -400, b: 100, c: 50, tomer: 250 }), { cash: [{ from: 'a', amount: 200 }] });
    expectRows(result);
    expect(result.transfers.find((r) => r.to === 'tomer')).toMatchObject({ cash: 200 });
    expect(result.transfers.filter((r) => r.cash > 0)).toHaveLength(1);
  });

  it('a bill nobody is owed in full is split into multiples of 50', () => {
    const result = settle(entries({ a: -200, b: 100, c: 100 }), { cash: [{ from: 'a', amount: 200 }] });
    expectRows(result);
    expect(result.transfers).toEqual([
      { from: 'a', to: 'b', amount: 100, cash: 100 },
      { from: 'a', to: 'c', amount: 100, cash: 100 },
    ]);
    expect(splitUnfitBills([{ from: 'a', amount: 200 }], [{ id: 'b', net: 130 }, { id: 'c', net: 120 }]).map((x) => x.amount)).toEqual([100, 100]);
    expect(splitUnfitBills([{ from: 'a', amount: 100 }], [{ id: 'b', net: 130 }]).map((x) => x.amount)).toEqual([100]);
  });

  it('Nadav lost 250 and paid 200: one row, 200 cash + 50 transfer', () => {
    const result = settle(entries({ nadav: -250, omer: 250 }), { cash: [{ from: 'nadav', amount: 200 }] });
    expect(result.transfers).toEqual([{ from: 'nadav', to: 'omer', amount: 250, cash: 200 }]);
  });

  it('small cash: the rest can need two transfers, still one mixed row', () => {
    const result = settle(entries({ a: -200, b: 100, c: 100 }), { cash: [{ from: 'a', amount: 50 }] });
    expectRows(result);
    expect(transferOf(result.transfers, 'a')).toBe(150);
  });

  it('a payer who paid it all in cash has only cash rows', () => {
    const result = settle(entries({ a: -300, b: 100, c: 200 }), { cash: [{ from: 'a', amount: 300 }] });
    expectRows(result);
    expect(result.transfers.every((r) => r.cash === r.amount)).toBe(true);
  });

  it('the transfer goes into one row: an exact match first', () => {
    const result = settle(entries({ a: -300, b: 100, c: 200 }), { cash: [{ from: 'a', amount: 200 }] });
    expectRows(result);
    expect(result.transfers.find((r) => r.to === 'b')).toMatchObject({ amount: 100, cash: 0 });
    expect(result.transfers.find((r) => r.to === 'c')).toMatchObject({ amount: 200, cash: 200 });
  });

  it('several payments by one player count together', () => {
    const result = settle(entries({ a: -300, b: 300 }), { cash: [{ from: 'a', amount: 100 }, { from: 'a', amount: 50 }] });
    expect(result.cashPaid).toEqual([{ from: 'a', amount: 150 }]);
    expect(result.transfers).toEqual([{ from: 'a', to: 'b', amount: 300, cash: 150 }]);
  });

  it('never gives change: cash above the loss is capped at the loss', () => {
    const result = settle(entries({ a: -150, b: 150 }), { cash: [{ from: 'a', amount: 200 }] });
    expect(result.cashPaid).toEqual([{ from: 'a', amount: 150 }]);
    expect(result.transfers).toEqual([{ from: 'a', to: 'b', amount: 150, cash: 150 }]);
    // A winner's cash doesn't count at all.
    expect(settle(entries({ a: 50, b: -50 }), { cash: [{ from: 'a', amount: 20 }] }).cashPaid).toEqual([]);
    // Several entries: only what fits in the loss, in order.
    const two = settle(entries({ a: -100, b: 100 }), { cash: [{ from: 'a', amount: 70 }, { from: 'a', amount: 50 }] });
    expect(two.cashPaid).toEqual([{ from: 'a', amount: 100 }]);
  });

  it('cashParts: how a row was paid', () => {
    expect(cashParts({ amount: 200, cash: 200 })).toEqual({ cash: 200, transfer: 0 });
    expect(cashParts({ amount: 270, cash: 200 })).toEqual({ cash: 200, transfer: 70 });
    expect(cashParts({ amount: 100, cash: 0 })).toBe(null);
    expect(cashParts({ amount: 100 })).toBe(null);
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
      expectRows(result);
      expect(result.transfers.every((r) => Number.isInteger(r.amount) && r.amount > 0)).toBe(true);
    }
  });
});

describe('transferProblems (the check the database runs when closing a table)', () => {
  it('accepts the transfers settle() makes, on thousands of random nights', () => {
    let seed = 1234;
    const rand = (n) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    for (let round = 0; round < 3000; round++) {
      const ids = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'].slice(0, 2 + rand(8));
      const list = ids.map((id) => ({ id, net: (rand(120) - 60) * 5 + (rand(4) === 0 ? 2.5 : 0) }));
      list[0].net -= list.reduce((s, e) => s + e.net, 0);
      const cash = list
        .filter((e) => e.net < 0 && rand(3))
        .flatMap((e) => Array.from({ length: 1 + rand(3) }, () => ({ from: e.id, amount: [20, 50, 100, 200][rand(4)] })));
      // Like the forms: never more cash than the loss.
      const room = new Map(list.map((e) => [e.id, Math.max(0, -Math.round(e.net))]));
      const allowed = cash.filter((c) => {
        if (c.amount > room.get(c.from)) return false;
        room.set(c.from, room.get(c.from) - c.amount);
        return true;
      });
      const absent = ids.filter(() => rand(3) === 0);
      const manager = rand(2) ? ids[rand(ids.length)] : null;
      const unit = ROUNDING_UNITS[rand(4)];
      const { nets, transfers } = settle(list, { unit, cash: allowed, absent, manager });
      expect(transferProblems(nets, transfers, allowed)).toEqual([]);
    }
  });

  it('refuses made-up transfers', () => {
    const nets = [
      { id: 'm', net: 100 },
      { id: 'p', net: -100 },
      { id: 'c', net: -50 },
      { id: 'q', net: 50 },
    ];
    const cash = [{ from: 'c', amount: 50 }];
    const real = [
      { from: 'p', to: 'm', amount: 100, cash: 0 },
      { from: 'c', to: 'q', amount: 50, cash: 50 },
    ];
    expect(transferProblems(nets, real, cash)).toEqual([]);
    // Doesn't add up.
    expect(transferProblems(nets, [{ ...real[0], amount: 60 }, real[1]], cash)).not.toEqual([]);
    // A bank transfer to a loser (a loop to reach someone's phone).
    expect(
      transferProblems(nets, [real[0], { ...real[1], amount: 70 }, { from: 'q', to: 'c', amount: 20, cash: 0 }], cash)
    ).toContain('c');
    // More cash than was recorded.
    expect(transferProblems(nets, [{ ...real[0], cash: 100 }, real[1]], cash)).toContain('p');
  });
});

describe('covering a counting mistake ("הסכומים לא מתאזנים")', () => {
  // A real night: the results add up to +50 (more counted than went in).
  const night = entries({ a: 200, b: 100, c: -150, d: -100 });
  const changes = (adjustment) => Object.fromEntries(adjustment.changes.map((c) => [c.id, c.amount]));
  const sum = (nets) => nets.reduce((s, e) => s + e.net, 0);

  it('measures the gap and asks only when rounding does not fix it', () => {
    expect(countingGap(night)).toBe(50);
    expect(needsAdjust(night, 10)).toBe(true);
    // Balanced: nothing to choose.
    expect(needsAdjust(entries({ a: 100, b: -100 }), 10)).toBe(false);
    // A leftover of rounding alone (the typed results add up): no question.
    expect(needsAdjust(entries({ a: 5, b: 5, c: -10 }), 10)).toBe(false);
    // A 3 ₪ mistake that rounding to 10 happens to cancel: no question.
    expect(needsAdjust(entries({ a: 103, b: -100 }), 10)).toBe(false);
  });

  it('equal: every player covers the same share, in rounding units', () => {
    const { nets, adjustment } = adjustNets(night, 10, { method: 'equal' });
    // 50 = 5 units of 10 among 4 players: one each, the extra unit to the biggest winner.
    expect(changes(adjustment)).toEqual({ a: -20, b: -10, c: -10, d: -10 });
    expect(adjustment).toMatchObject({ method: 'equal', gap: 50 });
    expect(sum(nets)).toBe(0);
  });

  it('winners: split between the winners by how much each won', () => {
    const { nets, adjustment } = adjustNets(night, 10, { method: 'winners' });
    // 200 : 100 → 33.3 and 16.7 → 30 and 20 (largest remainder).
    expect(changes(adjustment)).toEqual({ a: -30, b: -20 });
    expect(nets.find((e) => e.id === 'a').net).toBe(170);
    expect(sum(nets)).toBe(0);
  });

  it('player: one chosen player covers all of it', () => {
    const { nets, adjustment } = adjustNets(night, 10, { method: 'player', player: 'c' });
    expect(changes(adjustment)).toEqual({ c: -50 });
    expect(nets.find((e) => e.id === 'c').net).toBe(-200);
  });

  it('missing money (the results add up below 0) moves the results up', () => {
    const { nets, adjustment } = adjustNets(entries({ a: 100, b: -150 }), 10, { method: 'equal' });
    expect(adjustment.gap).toBe(-50);
    // 5 units between 2: 3 and 2, the extra one to the bigger result.
    expect(changes(adjustment)).toEqual({ a: 30, b: 20 });
    expect(sum(nets)).toBe(0);
  });

  it('with unit 1 the shares are whole shekels', () => {
    const { adjustment } = adjustNets(entries({ a: 120, b: 80, c: -150 }), 1, { method: 'equal' });
    // 50 between 3: 17 + 17 + 16.
    expect(changes(adjustment)).toEqual({ a: -17, b: -17, c: -16 });
  });

  it('without a choice (or when it cannot apply) the biggest winner takes it, as before', () => {
    expect(changes(adjustNets(night, 10).adjustment)).toEqual({ a: -50 });
    expect(adjustNets(night, 10).adjustment.method).toBe('biggest');
    // The chosen player is not at the table.
    expect(changes(adjustNets(night, 10, { method: 'player', player: 'zz' }).adjustment)).toEqual({ a: -50 });
    // No winners to split between.
    const noWinners = adjustNets(entries({ a: 0, b: -50 }), 10, { method: 'winners' });
    expect(noWinners.adjustment.method).toBe('biggest');
    expect(sum(noWinners.nets)).toBe(0);
    // roundNets keeps its old behavior.
    expect(roundNets(night, 10)).toEqual(adjustNets(night, 10).nets);
  });

  it('nothing to cover: no adjustment', () => {
    expect(adjustNets(entries({ a: 100, b: -100 }), 10, { method: 'equal' }).adjustment).toBeNull();
  });

  it('cleanAdjust accepts only the three choices', () => {
    expect(cleanAdjust({ method: 'equal', player: 'x' })).toEqual({ method: 'equal' });
    expect(cleanAdjust({ method: 'player' })).toEqual({ method: 'player', player: null });
    expect(cleanAdjust({ method: 'player', player: 'p' })).toEqual({ method: 'player', player: 'p' });
    expect(cleanAdjust({ method: 'biggest' })).toBeNull();
    expect(cleanAdjust(null)).toBeNull();
  });

  it('settle passes the choice through and still settles everything', () => {
    const result = settle(night, { unit: 10, adjust: { method: 'winners' } });
    expect(changes(result.adjustment)).toEqual({ a: -30, b: -20 });
    expectBalanced(result);
    expect(transferProblems(result.nets, result.transfers)).toEqual([]);
  });

  it('a closed table shows the same adjustment from the stored results', () => {
    const { nets, adjustment } = adjustNets(night, 10, { method: 'winners' });
    expect(storedAdjustment(night, nets, 10)).toEqual({ method: null, player: null, gap: 50, changes: adjustment.changes });
    expect(storedAdjustment(entries({ a: 100, b: -100 }), entries({ a: 100, b: -100 }), 10)).toBeNull();
  });

  it('random nights with mistakes: every method balances, stays round and moves exactly the gap', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let n = 0; n < 2000; n++) {
      const count = 2 + Math.floor(rand() * 8);
      const night = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, net: Math.round((rand() - 0.5) * 800) }));
      const unit = ROUNDING_UNITS[n % ROUNDING_UNITS.length];
      const adjust = [{ method: 'equal' }, { method: 'winners' }, { method: 'player', player: `p${n % count}` }, null][n % 4];
      const { nets, adjustment } = adjustNets(night, unit, adjust);
      expect(sum(nets)).toBe(0);
      for (const e of nets) expect(Math.abs(e.net % unit)).toBe(0);
      if (adjustment) {
        // The card: every number matches the final results exactly, and together
        // they move exactly the counting gap.
        const moved = adjustment.changes.reduce((s, c) => s + c.amount, 0);
        expect(moved + countingGap(night)).toBe(0);
        for (const e of nets) {
          const typed = night.find((x) => x.id === e.id).net;
          const change = adjustment.changes.find((c) => c.id === e.id);
          expect(typed + (change?.amount ?? 0)).toBe(e.net);
          if (change) expect(change.share + change.rounding).toBe(change.amount);
        }
        for (const c of adjustment.changes) expect(Math.abs(c.share % unit)).toBe(0);
        const sharers = adjustment.changes.filter((c) => c.share !== 0).map((c) => c.id);
        if (adjustment.method === 'player') expect(sharers).toEqual([adjust.player]);
        // Only winners share.
        if (adjustment.method === 'winners') for (const id of sharers) expect(roundTo(night.find((e) => e.id === id).net, unit)).toBeGreaterThan(0);
      }
      if (n % 10 === 0) expectBalanced(settle(night, { unit, adjust }));
    }
  });
});

describe('adjustReady (the settlement waits for the manager)', () => {
  const night = entries({ a: 200, b: 100, c: -150, d: -100 });
  it('waits only when there is something to cover and no usable choice', () => {
    expect(adjustReady(entries({ a: 100, b: -100 }), 10)).toBe(true);
    expect(adjustReady(entries({ a: 5, b: 5, c: -10 }), 10)).toBe(true);
    expect(adjustReady(night, 10)).toBe(false);
    expect(adjustReady(night, 10, { method: 'equal' })).toBe(true);
    expect(adjustReady(night, 10, { method: 'winners' })).toBe(true);
    expect(adjustReady(night, 10, { method: 'player', player: null })).toBe(false);
    expect(adjustReady(night, 10, { method: 'player', player: 'zz' })).toBe(false);
    expect(adjustReady(night, 10, { method: 'player', player: 'd' })).toBe(true);
    expect(adjustReady(entries({ a: 0, b: -50 }), 10, { method: 'winners' })).toBe(false);
  });
});

describe('the adjustment card shows real changes, rounding included (real night: Yuri +175, Ido −75)', () => {
  // Off by +5. With rounding 10, Yuri 175 → 180 and Ido −75 → −80 first; Shaked 25 → 30.
  const night = entries({ yuri: 175, ido: -75, shaked: 25, or: -120 });
  const byId = (adjustment) => Object.fromEntries(adjustment.changes.map((c) => [c.id, c]));
  const final = (nets, id) => nets.find((e) => e.id === id).net;

  it('rounding 10: Yuri ends at 170 and the card says −5 (not −10); Ido −5 and Shaked +5 by rounding', () => {
    const { nets, adjustment } = adjustNets(night, 10, { method: 'winners' });
    expect(final(nets, 'yuri')).toBe(170);
    expect(final(nets, 'ido')).toBe(-80);
    expect(final(nets, 'shaked')).toBe(30);
    expect(final(nets, 'or')).toBe(-120);
    const c = byId(adjustment);
    expect(c.yuri).toEqual({ id: 'yuri', amount: -5, share: -10, rounding: 5 });
    expect(c.ido).toEqual({ id: 'ido', amount: -5, share: 0, rounding: -5 });
    expect(c.shaked).toEqual({ id: 'shaked', amount: 5, share: 0, rounding: 5 });
    expect(c.or).toBeUndefined();
    // Every number on the card matches the final result.
    for (const e of night) expect(e.net + (c[e.id]?.amount ?? 0)).toBe(final(nets, e.id));
    expect(adjustment.gap).toBe(5);
  });

  it('rounding 5: nothing is rounded, Yuri covers the 5', () => {
    const { nets, adjustment } = adjustNets(night, 5, { method: 'winners' });
    expect(final(nets, 'yuri')).toBe(170);
    expect(adjustment.changes).toEqual([{ id: 'yuri', amount: -5, share: -5, rounding: 0 }]);
  });

  it('a closed table reads the same card back from the stored results', () => {
    for (const unit of [10, 5]) {
      const { nets, adjustment } = adjustNets(night, unit, { method: 'winners' });
      expect(storedAdjustment(night, nets, unit).changes).toEqual(adjustment.changes);
    }
  });

  it('a night that adds up, with rounding only, has no card', () => {
    expect(storedAdjustment(entries({ a: 175, b: -175 }), entries({ a: 180, b: -180 }), 10)).toBeNull();
  });
});
