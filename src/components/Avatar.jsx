import { initials } from '../lib/game.js';

const COLORS = [
  'from-rose-300 to-rose-500',
  'from-amber-200 to-amber-400',
  'from-sky-300 to-sky-500',
  'from-violet-300 to-violet-500',
  'from-emerald-300 to-emerald-500',
  'from-pink-300 to-pink-500',
  'from-orange-300 to-orange-500',
  'from-teal-200 to-teal-400',
  'from-indigo-300 to-indigo-500',
  'from-lime-200 to-lime-400',
];

export default function Avatar({ player, size = 'h-12 w-12 text-lg' }) {
  return (
    <div
      className={`${size} ${COLORS[player.color % COLORS.length]} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-extrabold text-slate-900 shadow-lg ring-2 ring-white/80`}
    >
      {initials(player.name)}
    </div>
  );
}
