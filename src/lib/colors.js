// The player color palette: 12 clear, distinct colors (a table has 9 seats).
// The index is what's stored (profiles.color, table_players.color, local
// players), so never reorder; only append (and widen the DB check constraints).
// Green is kept deep so it stands apart from lime, teal and the green felt.
export const PALETTE = [
  { name: 'אדום', gradient: 'from-rose-400 to-red-600', hex: '#ef4444', text: 'text-white' },
  { name: 'כתום', gradient: 'from-orange-300 to-orange-500', hex: '#f97316', text: 'text-slate-900' },
  { name: 'צהוב', gradient: 'from-yellow-200 to-amber-400', hex: '#fbbf24', text: 'text-slate-900' },
  { name: 'ירוק', gradient: 'from-green-500 to-green-800', hex: '#15803d', text: 'text-white' },
  { name: 'תכלת', gradient: 'from-cyan-200 to-sky-400', hex: '#38bdf8', text: 'text-slate-900' },
  { name: 'כחול', gradient: 'from-blue-400 to-indigo-600', hex: '#4f46e5', text: 'text-white' },
  { name: 'סגול', gradient: 'from-violet-400 to-purple-700', hex: '#9333ea', text: 'text-white' },
  { name: 'ורוד', gradient: 'from-pink-300 to-fuchsia-500', hex: '#d946ef', text: 'text-slate-900' },
  { name: 'לבן', gradient: 'from-white to-slate-300', hex: '#e2e8f0', text: 'text-slate-900' },
  { name: 'חום', gradient: 'from-amber-600 to-amber-900', hex: '#92400e', text: 'text-white' },
  { name: 'טורקיז', gradient: 'from-teal-300 to-teal-600', hex: '#14b8a6', text: 'text-slate-900' },
  { name: 'ליים', gradient: 'from-lime-200 to-lime-400', hex: '#a3e635', text: 'text-slate-900' },
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

// First palette color nobody at the table uses yet (wraps if all 12 are taken).
export function firstFreeColor(usedColors) {
  const used = new Set(usedColors);
  for (let i = 0; i < PALETTE.length; i++) if (!used.has(i)) return i;
  return usedColors.length % PALETTE.length;
}
