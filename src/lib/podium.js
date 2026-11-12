// The night's podium: the top 3 winners (gold, silver, bronze). Pure.
// Only players in profit (net > 0) get a place. Ties share the place and the
// next place counts everyone ahead, like in sports: two tied for 1st, then 3rd.

// nets: [{ id, net }] (the settled, rounded nets).
// Returns [{ place: 1 | 2 | 3, net, ids: [...] }], best first.
export function podium(nets) {
  const winners = nets.filter((e) => e.net > 0).sort((a, b) => b.net - a.net);
  const places = [];
  let ahead = 0;
  for (const e of winners) {
    const last = places[places.length - 1];
    if (last && last.net === e.net) last.ids.push(e.id);
    else {
      if (ahead + 1 > 3) break;
      places.push({ place: ahead + 1, net: e.net, ids: [e.id] });
    }
    ahead++;
  }
  return places;
}

// Left-to-right spots on a real podium: 2nd, 1st, 3rd, so 1st is always in the
// middle; a place nobody has (e.g. no 2nd after a tie for 1st) is null, an
// empty spot. A lone winner stands alone.
export function podiumOrder(places) {
  if (places.length <= 1) return places;
  return [2, 1, 3].map((n) => places.find((p) => p.place === n) ?? null);
}

export const MEDALS = {
  1: { icon: '🥇', label: 'מקום ראשון', color: '#fbbf24' },
  2: { icon: '🥈', label: 'מקום שני', color: '#cbd5e1' },
  3: { icon: '🥉', label: 'מקום שלישי', color: '#d97706' },
};
