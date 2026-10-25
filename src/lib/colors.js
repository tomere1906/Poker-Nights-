// The player color palette: 8 clear, distinct colors. The index is what's
// stored (profiles.color, table_players.color, local players), so never
// reorder; only append (and widen the DB check constraints).
export const PALETTE = [
  { name: 'אדום', gradient: 'from-rose-400 to-red-600', hex: '#ef4444', text: 'text-white' },
  { name: 'כתום', gradient: 'from-orange-300 to-orange-500', hex: '#f97316', text: 'text-slate-900' },
  { name: 'צהוב', gradient: 'from-yellow-200 to-amber-400', hex: '#fbbf24', text: 'text-slate-900' },
  { name: 'ירוק', gradient: 'from-lime-300 to-green-500', hex: '#22c55e', text: 'text-slate-900' },
  { name: 'תכלת', gradient: 'from-cyan-200 to-sky-400', hex: '#38bdf8', text: 'text-slate-900' },
  { name: 'כחול', gradient: 'from-blue-400 to-indigo-600', hex: '#4f46e5', text: 'text-white' },
  { name: 'סגול', gradient: 'from-violet-400 to-purple-700', hex: '#9333ea', text: 'text-white' },
  { name: 'ורוד', gradient: 'from-pink-300 to-fuchsia-500', hex: '#d946ef', text: 'text-slate-900' },
];

export function paletteColor(index) {
  const n = PALETTE.length;
  return PALETTE[(((index ?? 0) % n) + n) % n];
}

// A stable suggestion for someone who hasn't picked yet (same user, same color).
export function suggestedColor(seed) {
  let h = 0;
  for (const ch of String(seed ?? '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % PALETTE.length;
}
