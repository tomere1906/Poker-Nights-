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
function bestPlan(balances, min) {
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
          count: sub.count + 1,
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
function planTransfers(balances, unit) {
  const active = balances.filter((e) => e.net !== 0);
  if (active.some((e) => e.net % unit !== 0)) unit = 1;
  const bal = active.map((e) => e.net / unit);
  const min = Math.ceil(MIN_TRANSFER / unit);
  let plan = bestPlan(bal, min);
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

// Cash a player already paid ({ from, holder, amount }): valid entries only.
export function cleanCash(cash, ids) {
  return (cash ?? []).filter(
    (c) => Number.isInteger(c.amount) && c.amount > 0 && c.from !== c.holder && ids.has(c.from) && ids.has(c.holder)
  );
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

// Who gets a cash bundle as it is (no change needed): someone still owed at
// least the whole bundle. Best: an exact match (the holder first: keeping it
// is no handoff at all), then the holder, then whoever is left with no tiny
// remainder, the smallest remainder first.
function bundleTarget(owed, holder, amount) {
  let best = null;
  let bestScore = null;
  for (const [id, claim] of owed) {
    if (claim < amount) continue;
    const rest = claim - amount;
    const score = [rest === 0 ? 0 : 1, id === holder ? 0 : 1, rest === 0 || rest >= MIN_TRANSFER ? 0 : 1, rest];
    if (!bestScore || lessThan(score, bestScore)) {
      best = id;
      bestScore = score;
    }
  }
  return best;
}

// Lexicographic comparison of two score arrays.
function lessThan(a, b) {
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] < b[k];
  return false;
}

// Hands every cash bundle to winners. owed: id -> what they're still owed
// (mutated). Returns [{ holder, to, amount }]; to === holder means "keeps it".
function handOffCash(cash, owed) {
  const handoffs = [];
  const give = (holder, to, amount) => {
    owed.set(to, owed.get(to) - amount);
    const same = handoffs.find((h) => h.holder === holder && h.to === to);
    if (same) same.amount += amount;
    else handoffs.push({ holder, to, amount });
  };
  // Biggest bundles first: they're the hardest to place whole.
  for (const c of [...cash].sort((a, b) => b.amount - a.amount)) {
    const owedNow = new Map([...owed].filter(([, v]) => v > 0));
    const whole = bundleTarget(owedNow, c.holder, c.amount);
    if (whole !== null) {
      give(c.holder, whole, c.amount);
      continue;
    }
    // Nobody is owed the whole bundle: split it between winners (the holder's
    // own share first). Cash never exceeds the losses, so the winners take it all.
    let left = c.amount;
    while (left > 0) {
      const open = [...owed].filter(([, v]) => v > 0);
      if (open.length === 0) break;
      const self = open.find(([id]) => id === c.holder);
      const [to, claim] = self ?? open.reduce((a, b) => (b[1] > a[1] ? b : a));
      const amount = Math.min(left, claim);
      give(c.holder, to, amount);
      left -= amount;
    }
  }
  return handoffs.sort((a, b) => b.amount - a.amount);
}

// entries: [{ id, net }] where net = final chips − total buy-in (may be fractional).
// unit: "עיגול סכומים" (1 / 5 / 10 / 50). Every net and every transfer is a
// multiple of it: the plan is searched in units and scaled back.
// cash: [{ from, holder, amount }] already paid in cash during the night (e.g.
// a player who lost 250 and left 200 ₪ with someone). Cash never exceeds a
// payer's loss (capCash), so there is never change to give back. Only what's
// still owed is settled by transfers; the holder hands the cash on to winners.
// Returns the rounded nets (the night's results, cash included), the cash that
// counted (cashPaid), the cash handoffs [{ holder, to, amount }] and the
// transfers [{ from, to, amount }].
export function settle(entries, { unit = 1, cash = [] } = {}) {
  const nets = roundNets(entries, unit);
  const paid = capCash(cleanCash(cash, new Set(nets.map((e) => e.id))), nets);
  if (paid.length === 0) return { nets, cashPaid: [], cashHandoffs: [], transfers: planTransfers(nets, unit) };

  // What each player still owes (< 0) or is owed (> 0) after the cash they paid.
  const owed = new Map(nets.map((e) => [e.id, e.net]));
  for (const c of paid) owed.set(c.from, owed.get(c.from) + c.amount);
  const cashHandoffs = handOffCash(paid, owed);
  const rest = nets.map((e) => ({ id: e.id, net: owed.get(e.id) }));
  return { nets, cashPaid: paid, cashHandoffs, transfers: planTransfers(rest, unit) };
}
