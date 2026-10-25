// Stats from closed online games. Pure: the rows come from the my_games /
// my_tablemates views (src/lib/statsData.js), which already contain only
// games the viewer played in. Amounts are whole shekels.

// game: { tableId, tableName, endedAt (ms), net, buyInTotal, buyInCount, playerCount }
export function personalStats(games) {
  const sorted = [...games].sort((a, b) => a.endedAt - b.endedAt);
  const count = sorted.length;
  const total = sorted.reduce((sum, g) => sum + g.net, 0);

  let best = null;
  let worst = null;
  let run = 0;
  let bestStreak = 0;
  let cumulative = 0;
  const series = [];
  for (const g of sorted) {
    if (!best || g.net > best.net) best = g;
    if (!worst || g.net < worst.net) worst = g;
    // A winning streak: nights in profit in a row (an even night breaks it).
    run = g.net > 0 ? run + 1 : 0;
    bestStreak = Math.max(bestStreak, run);
    cumulative += g.net;
    series.push({ ...g, cumulative });
  }

  const buyInCount = sorted.reduce((sum, g) => sum + g.buyInCount, 0);
  const buyInTotal = sorted.reduce((sum, g) => sum + g.buyInTotal, 0);

  return {
    count,
    total,
    average: count ? Math.round(total / count) : 0,
    best,
    worst,
    wins: sorted.filter((g) => g.net > 0).length,
    // "הפסיד הכל": left with no chips at all.
    lostAll: sorted.filter((g) => g.buyInTotal > 0 && g.net + g.buyInTotal === 0).length,
    // Buy-ins per night (count, one decimal) and their average amount (whole shekels).
    avgBuyIns: count ? Math.round((buyInCount / count) * 10) / 10 : 0,
    avgBuyInAmount: count ? Math.round(buyInTotal / count) : 0,
    currentStreak: run,
    bestStreak,
    series,
    // Newest first, for the list of games.
    recent: [...sorted].reverse(),
  };
}

// mate: { key, userId, isGuest, name, color, games, total, lastPlayed }
export function withAverages(mates) {
  return mates.map((m) => ({ ...m, average: m.games ? Math.round(m.total / m.games) : 0 }));
}

export const MATE_SORTS = {
  total: { label: 'סה״כ', value: (m) => m.total },
  games: { label: 'משחקים', value: (m) => m.games },
  average: { label: 'ממוצע', value: (m) => m.average },
};

// Highest first; ties by more games, then by name.
export function sortMates(mates, by = 'total') {
  const value = MATE_SORTS[by]?.value ?? MATE_SORTS.total.value;
  return [...mates].sort(
    (a, b) => value(b) - value(a) || b.games - a.games || a.name.localeCompare(b.name, 'he')
  );
}
