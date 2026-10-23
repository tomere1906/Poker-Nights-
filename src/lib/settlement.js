// Settlement: who pays whom, in whole shekels. Pure functions, no UI.

export const MIN_TRANSFER = 20;

// Round every net to whole shekels, then push any imbalance (rounding or a
// counting mistake) onto the biggest winner so the nets sum to exactly 0.
export function roundNets(entries) {
  const nets = entries.map((e) => ({ id: e.id, net: Math.round(e.net) + 0 }));
  const diff = nets.reduce((sum, e) => sum + e.net, 0);
  if (diff !== 0 && nets.length > 0) {
    let top = nets[0];
    for (const e of nets) if (e.net > top.net) top = e;
    top.net -= diff;
  }
  return nets;
}

// Plans are compared by: fewest transfers under MIN_TRANSFER, then fewest
// transfers, then the largest smallest-transfer.
function better(a, b) {
  if (a.small !== b.small) return a.small < b.small;
  if (a.count !== b.count) return a.count < b.count;
  return a.min > b.min;
}

const EMPTY_PLAN = { small: 0, count: 0, min: Infinity, transfers: [] };

// Exhaustive search over "settle one side of a loser/winner pair" steps.
// Every tree-shaped settlement (the minimum-transfer kind) is reachable this
// way, and memoizing on the balance vector keeps it fast for <= 9 players.
function bestPlan(balances) {
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
          small: sub.small + (amount < MIN_TRANSFER ? 1 : 0),
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
// allow a few extra transfers so every transfer can be >= MIN_TRANSFER.
// Players whose whole result is under MIN_TRANSFER get exactly one
// (unavoidably small) transfer; every other transfer must be >= MIN_TRANSFER.
function planWithoutSmall(bal, minCount, currentSmall) {
  const n = bal.length;
  const tiny = bal.map((b) => Math.abs(b) < MIN_TRANSFER);
  const smallOf = (edges) => edges.filter(([i, j]) => tiny[i] || tiny[j]).length;
  const maxDeg = bal.map((b, v) => (tiny[v] ? 1 : Math.floor(Math.abs(b) / MIN_TRANSFER) + tiny.filter(Boolean).length));

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
        if (routeOnEdges(bal, chosen, (i, j) => (tiny[i] || tiny[j] ? 1 : MIN_TRANSFER))) feasible.push(chosen.slice());
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
      let lo = MIN_TRANSFER;
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

// entries: [{ id, net }] where net = final chips − total buy-in (may be fractional).
// Returns the rounded nets and the transfers [{ from, to, amount }].
export function settle(entries) {
  const nets = roundNets(entries);
  const active = nets.filter((e) => e.net !== 0);
  const bal = active.map((e) => e.net);
  let plan = bestPlan(bal);
  // Each player with a tiny result needs one small transfer; one transfer can
  // cover a tiny loser and a tiny winner together. Below that, nothing to gain.
  const tinyLosers = bal.filter((b) => b < 0 && -b < MIN_TRANSFER).length;
  const tinyWinners = bal.filter((b) => b > 0 && b < MIN_TRANSFER).length;
  if (plan.small > Math.max(tinyLosers, tinyWinners)) {
    const alt = planWithoutSmall(bal, plan.count, plan.small);
    if (alt && alt.small < plan.small) plan = alt;
  }

  const loss = new Map(active.map((e) => [e.id, e.net]));
  const transfers = plan.transfers
    .map(([i, j, amount]) => ({ from: active[i].id, to: active[j].id, amount }))
    // Group by payer (biggest loser first), biggest transfer first.
    .sort((a, b) => loss.get(a.from) - loss.get(b.from) || b.amount - a.amount);

  return { nets, transfers };
}
