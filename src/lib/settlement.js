// Settlement: who pays whom, in whole shekels. Pure functions, no UI.

export const MIN_TRANSFER = 20;

// "עיגול סכומים": every result is rounded to a multiple of this (whole shekels).
export const ROUNDING_UNITS = [1, 5, 10, 50];
export const DEFAULT_ROUNDING = 10;

export function cleanRounding(unit) {
  return ROUNDING_UNITS.includes(unit) ? unit : DEFAULT_ROUNDING;
}

// Nearest multiple of unit; halves round away from zero (fair to winners and losers).
export function roundTo(value, unit = 1) {
  return Math.sign(value) * Math.round(Math.abs(value) / unit) * unit + 0;
}

// Round every net to a multiple of unit, then push any imbalance (rounding or
// a counting mistake) onto the biggest winner so the nets sum to exactly 0.
// The imbalance is itself a multiple of unit, so the winner stays round too.
export function roundNets(entries, unit = 1) {
  const nets = entries.map((e) => ({ id: e.id, net: roundTo(e.net, unit) }));
  const diff = nets.reduce((sum, e) => sum + e.net, 0);
  if (diff !== 0 && nets.length > 0) {
    let top = nets[0];
    for (const e of nets) if (e.net > top.net) top = e;
    top.net -= diff;
  }
  return nets;
}

// The searches below work in rounding units: `min` is MIN_TRANSFER in units.
// Plans are compared by: fewest transfers under min, then fewest transfers,
// then the largest smallest-transfer.
function better(a, b) {
  if (a.small !== b.small) return a.small < b.small;
  if (a.count !== b.count) return a.count < b.count;
  return a.min > b.min;
}

const EMPTY_PLAN = { small: 0, count: 0, min: Infinity, transfers: [] };

// Exhaustive search over "settle one side of a loser/winner pair" steps.
// Every tree-shaped settlement (the minimum-transfer kind) is reachable this
// way, and memoizing on the balance vector keeps it fast for <= 9 players.
// free: index pairs (i * 64 + j) that already have a row (cash), so a transfer
// there adds no row; `count` counts rows.
function bestPlan(balances, min, free = null) {
  const memo = new Map();

  function solve(bal) {
    const key = bal.join(',');
    const cached = memo.get(key);
    if (cached) return cached;

    let best = null;
    for (let i = 0; i < bal.length; i++) {
      if (bal[i] >= 0) continue;
      for (let j = 0; j < bal.length; j++) {
        if (bal[j] <= 0) continue;
        const amount = Math.min(-bal[i], bal[j]);
        const next = bal.slice();
        next[i] += amount;
        next[j] -= amount;
        const sub = solve(next);
        const plan = {
          small: sub.small + (amount < min ? 1 : 0),
          count: sub.count + (free?.has(i * 64 + j) ? 0 : 1),
          min: Math.min(sub.min, amount),
          transfers: [[i, j, amount], ...sub.transfers],
        };
        if (!best || better(plan, best)) best = plan;
      }
    }

    best ??= EMPTY_PLAN;
    memo.set(key, best);
    return best;
  }

  return solve(balances);
}

// Max flow on a tiny dense graph (adjacency matrix, DFS augmenting paths).
function maxFlow(cap, source, sink) {
  const n = cap.length;
  let total = 0;
  for (;;) {
    const prev = new Array(n).fill(-1);
    prev[source] = source;
    const stack = [source];
    while (stack.length && prev[sink] === -1) {
      const u = stack.pop();
      for (let v = 0; v < n; v++) {
        if (prev[v] === -1 && cap[u][v] > 0) {
          prev[v] = u;
          stack.push(v);
        }
      }
    }
    if (prev[sink] === -1) return total;
    let push = Infinity;
    for (let v = sink; v !== source; v = prev[v]) push = Math.min(push, cap[prev[v]][v]);
    for (let v = sink; v !== source; v = prev[v]) {
      cap[prev[v]][v] -= push;
      cap[v][prev[v]] += push;
    }
    total += push;
  }
}

// Can these loser->winner edges carry the balances with every edge >= its
// lower bound? Returns the amounts per edge, or null.
function routeOnEdges(bal, edges, lowerOf) {
  const n = bal.length;
  const rest = bal.map(Math.abs);
  for (const [i, j] of edges) {
    const low = lowerOf(i, j);
    rest[i] -= low;
    rest[j] -= low;
  }
  if (rest.some((r) => r < 0)) return null;

  const source = n;
  const sink = n + 1;
  const cap = Array.from({ length: n + 2 }, () => new Array(n + 2).fill(0));
  let need = 0;
  for (let v = 0; v < n; v++) {
    if (bal[v] < 0) {
      cap[source][v] = rest[v];
      need += rest[v];
    } else cap[v][sink] = rest[v];
  }
  for (const [i, j] of edges) cap[i][j] = Infinity;
  const residual = cap.map((row) => row.slice());
  if (maxFlow(residual, source, sink) !== need) return null;
  // Flow on i->j is what the reverse residual edge picked up.
  return edges.map(([i, j]) => lowerOf(i, j) + residual[j][i]);
}

const MAX_EXTRA_TRANSFERS = 4;
const MAX_SUPPORTS = 200000;

// Second pass when the minimum-transfer plan still has small transfers:
// allow a few extra transfers so every transfer can be >= min.
// Players whose whole result is under min get exactly one
// (unavoidably small) transfer; every other transfer must be >= min.
function planWithoutSmall(bal, minCount, currentSmall, min) {
  const n = bal.length;
  const tiny = bal.map((b) => Math.abs(b) < min);
  const smallOf = (edges) => edges.filter(([i, j]) => tiny[i] || tiny[j]).length;
  const maxDeg = bal.map((b, v) => (tiny[v] ? 1 : Math.floor(Math.abs(b) / min) + tiny.filter(Boolean).length));

  const all = [];
  for (let i = 0; i < n; i++) if (bal[i] < 0) for (let j = 0; j < n; j++) if (bal[j] > 0) all.push([i, j]);

  let checked = 0;
  for (let size = minCount; size <= minCount + MAX_EXTRA_TRANSFERS; size++) {
    const feasible = [];
    const deg = new Array(n).fill(0);
    const chosen = [];

    (function pick(start) {
      if (checked > MAX_SUPPORTS) return;
      if (chosen.length === size) {
        checked++;
        if (deg.some((d) => d === 0) || smallOf(chosen) >= currentSmall) return;
        if (routeOnEdges(bal, chosen, (i, j) => (tiny[i] || tiny[j] ? 1 : min))) feasible.push(chosen.slice());
        return;
      }
      for (let k = start; k <= all.length - (size - chosen.length); k++) {
        const [i, j] = all[k];
        if (deg[i] >= maxDeg[i] || deg[j] >= maxDeg[j]) continue;
        deg[i]++;
        deg[j]++;
        chosen.push(all[k]);
        pick(k + 1);
        chosen.pop();
        deg[i]--;
        deg[j]--;
      }
    })(0);

    if (feasible.length === 0) continue;

    // Among the fewest-small, fewest-transfer options, make the smallest
    // transfer as large as possible (binary search on the lower bound).
    const fewestSmall = Math.min(...feasible.map(smallOf));
    let best = null;
    for (const edges of feasible.filter((e) => smallOf(e) === fewestSmall)) {
      let lo = min;
      let hi = Math.max(...bal.map(Math.abs));
      let amounts = null;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const got = routeOnEdges(bal, edges, (i, j) => (tiny[i] || tiny[j] ? 1 : mid));
        if (got) {
          amounts = got;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      if (amounts && (!best || hi > best.floor)) best = { floor: hi, edges, amounts };
    }
    return {
      small: fewestSmall,
      count: size,
      transfers: best.edges.map(([i, j], k) => [i, j, best.amounts[k]]),
    };
  }
  return null;
}

// Transfers that settle these balances ([{ id, net }], summing to 0), with
// every amount a multiple of unit (when the balances are).
// freePairs: Set of "from>to" ids that already have a row (cash), preferred.
function planTransfers(balances, unit, freePairs = null) {
  const active = balances.filter((e) => e.net !== 0);
  if (active.some((e) => e.net % unit !== 0)) unit = 1;
  const bal = active.map((e) => e.net / unit);
  const min = Math.ceil(MIN_TRANSFER / unit);
  let free = null;
  if (freePairs?.size) {
    free = new Set();
    active.forEach((a, i) => active.forEach((b, j) => freePairs.has(a.id + '>' + b.id) && free.add(i * 64 + j)));
  }
  let plan = bestPlan(bal, min, free);
  // Each player with a tiny result needs one small transfer; one transfer can
  // cover a tiny loser and a tiny winner together. Below that, nothing to gain.
  const tinyLosers = bal.filter((b) => b < 0 && -b < min).length;
  const tinyWinners = bal.filter((b) => b > 0 && b < min).length;
  if (plan.small > Math.max(tinyLosers, tinyWinners)) {
    const alt = planWithoutSmall(bal, plan.count, plan.small, min);
    if (alt && alt.small < plan.small) plan = alt;
  }

  const loss = new Map(active.map((e) => [e.id, e.net]));
  return (
    plan.transfers
      .map(([i, j, amount]) => ({ from: active[i].id, to: active[j].id, amount: amount * unit }))
      // Group by payer (biggest loser first), biggest transfer first.
      .sort((a, b) => loss.get(a.from) - loss.get(b.from) || b.amount - a.amount)
  );
}

// Cash a player paid ({ from, amount }): valid entries only. Nobody "holds" it.
export function cleanCash(cash, ids) {
  return (cash ?? []).filter((c) => Number.isInteger(c.amount) && c.amount > 0 && ids.has(c.from));
}

// Cash is only ever a payment towards a loser's debt: never more than they
// lost. Keeps each payer's entries (in order) within their loss and drops what
// doesn't fit. nets: [{ id, net }] (rounded).
export function capCash(cash, nets) {
  const room = new Map(nets.map((e) => [e.id, Math.max(0, -e.net)]));
  const capped = [];
  for (const c of cash) {
    const amount = Math.min(c.amount, room.get(c.from) ?? 0);
    if (amount <= 0) continue;
    capped.push({ ...c, amount });
    room.set(c.from, room.get(c.from) - amount);
  }
  return capped;
}

// How much more cash this player may still pay: their loss minus the cash
// already recorded for them (0 if they didn't lose). net: their result.
export function cashRoom(net, cash, playerId) {
  const paid = cash.filter((c) => c.from === playerId).reduce((s, c) => s + c.amount, 0);
  return Math.max(0, -(net ?? 0) - paid);
}

// "🐑 כבש הערב": the biggest loser(s) of the night (all of them on a tie), from
// the rounded nets. Nobody when nobody lost.
export function sheepIds(nets) {
  const worst = Math.min(0, ...nets.map((e) => e.net));
  return worst < 0 ? new Set(nets.filter((e) => e.net === worst).map((e) => e.id)) : new Set();
}

// The small note under a row's amount: "💵 מזומן" when it's all cash,
// "200 מזומן · 70 העברה" when it's both, null for a plain transfer.
export function cashNote(row) {
  if (!row.cash) return null;
  if (row.cash >= row.amount) return '💵 מזומן';
  return `${row.cash} מזומן · ${row.amount - row.cash} העברה`;
}

// One line per payer: [{ from, amount }], biggest first.
export function cashByPayer(cash) {
  const total = new Map();
  for (const c of cash) total.set(c.from, (total.get(c.from) ?? 0) + c.amount);
  return [...total].map(([from, amount]) => ({ from, amount })).sort((a, b) => b.amount - a.amount);
}

export const CASH_SPLIT_STEP = 50;
const MAX_CASH_OPTIONS = 400;

// A bill nobody is owed in full (e.g. a 200 when every winner is owed less) is
// split into multiples of 50 that fit the winners, biggest claims first.
// Everything else stays whole. bills: [{ from, amount }]; winners: [{ id, net }].
export function splitUnfitBills(bills, winners) {
  const most = Math.max(0, ...winners.map((w) => w.net));
  const out = [];
  for (const bill of bills) {
    if (bill.amount <= most) {
      out.push(bill);
      continue;
    }
    let left = bill.amount;
    for (const w of [...winners].sort((x, y) => y.net - x.net)) {
      const piece = Math.min(left, Math.floor(w.net / CASH_SPLIT_STEP) * CASH_SPLIT_STEP);
      if (piece <= 0) continue;
      out.push({ ...bill, amount: piece });
      left -= piece;
      if (left === 0) break;
    }
    if (left > 0) out.push({ ...bill, amount: left });
  }
  return out;
}

// a < b, comparing number arrays element by element.
function lexLess(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

// Merges cash and transfers into rows (one per payer → receiver).
function mergeRows(cashRows, transfers) {
  const rows = new Map();
  const add = (from, to, amount, cash) => {
    const key = from + '>' + to;
    const row = rows.get(key) ?? { from, to, amount: 0, cash: 0 };
    row.amount += amount;
    row.cash += cash;
    rows.set(key, row);
  };
  for (const c of cashRows) add(c.from, c.to, c.amount, c.amount);
  for (const t of transfers) add(t.from, t.to, t.amount, 0);
  return [...rows.values()];
}

// Each bill goes whole to one winner who is still owed at least that much;
// different bills of one player may go to different winners. Tries the
// combinations (exact matches first) and keeps the one with the fewest small
// transfers, then the fewest rows, then the fewest transfers. Returns rows
// [{ from, to, amount, cash }], or null when the bills can't all be placed.
function placeBills(nets, bills, unit) {
  const winners = nets.filter((e) => e.net > 0);
  const units = splitUnfitBills(bills, winners).sort((x, y) => y.amount - x.amount);
  const owed = new Map(winners.map((w) => [w.id, w.net]));
  const placed = [];
  let best = null;
  let tried = 0;

  function evaluate() {
    const balance = new Map(nets.map((e) => [e.id, e.net]));
    for (const p of placed) {
      balance.set(p.from, balance.get(p.from) + p.amount);
      balance.set(p.to, balance.get(p.to) - p.amount);
    }
    const free = new Set(placed.map((p) => p.from + '>' + p.to));
    const transfers = planTransfers([...balance].map(([id, net]) => ({ id, net })), unit, free);
    const rows = mergeRows(placed, transfers);
    const score = [transfers.filter((t) => t.amount < MIN_TRANSFER).length, rows.length, transfers.length];
    if (!best || lexLess(score, best.score)) best = { score, rows };
  }

  (function place(k) {
    if (tried >= MAX_CASH_OPTIONS) return;
    if (k === units.length) {
      tried++;
      evaluate();
      return;
    }
    const bill = units[k];
    const options = [...owed]
      .filter(([, claim]) => claim >= bill.amount)
      .sort(([, x], [, y]) => (y === bill.amount) - (x === bill.amount) || y - x);
    for (const [id, claim] of options) {
      owed.set(id, claim - bill.amount);
      placed.push({ from: bill.from, to: id, amount: bill.amount });
      place(k + 1);
      placed.pop();
      owed.set(id, claim);
    }
  })(0);

  return best?.rows ?? null;
}

// Fallback when the bills can't all be placed whole: the regular rows, with
// each payer's cash covering them and the rest transferred in one row.
function markCash(rows, paid) {
  const cashOf = new Map(paid.map((c) => [c.from, c.amount]));
  const out = rows.map((r) => ({ ...r, cash: 0 }));
  for (const [payer, cash] of cashOf) {
    const mine = out.filter((r) => r.from === payer);
    let rest = mine.reduce((sum, r) => sum + r.amount, 0) - cash;
    const fits = mine.filter((r) => r.amount >= rest).sort((x, y) => x.amount - y.amount);
    const single = rest > 0 && (fits.find((r) => r.amount === rest) ?? fits[0]);
    for (const r of [...(single ? [single] : []), ...mine.filter((r) => r !== single).sort((x, y) => y.amount - x.amount)]) {
      const transfer = Math.min(rest, r.amount);
      r.cash = r.amount - transfer;
      rest -= transfer;
    }
  }
  return out;
}

// entries: [{ id, net }] where net = final chips − total buy-in (may be fractional).
// unit: "עיגול סכומים" (1 / 5 / 10 / 50). Every net and every transfer is a
// multiple of it: the plan is searched in units and scaled back.
// cash: [{ from, amount }] paid in cash when settling (e.g. a player who lost
// 250 and left 200). Cash never exceeds a payer's loss (capCash), so there is
// never change to give back.
// Each cash entry is one bill: it goes whole to one winner (a bill nobody is
// owed in full is split into multiples of 50). Returns the rounded nets (the
// night's results), the cash paid per player (cashPaid [{ from, amount }]) and
// one list of rows [{ from, to, amount, cash }]: payer → receiver, `cash` of
// the amount paid in cash (0 = all by transfer); the fewest rows.
export function settle(entries, { unit = 1, cash = [] } = {}) {
  const nets = roundNets(entries, unit);
  const bills = capCash(cleanCash(cash, new Set(nets.map((e) => e.id))), nets);
  const cashPaid = cashByPayer(bills);
  if (bills.length === 0) return { nets, cashPaid, transfers: planTransfers(nets, unit).map((t) => ({ ...t, cash: 0 })) };
  const loss = new Map(nets.map((e) => [e.id, e.net]));
  const rows = placeBills(nets, bills, unit) ?? markCash(planTransfers(nets, unit), cashPaid);
  // Group by payer (biggest loser first), biggest row first.
  return { nets, cashPaid, transfers: rows.sort((x, y) => loss.get(x.from) - loss.get(y.from) || y.amount - x.amount) };
}
