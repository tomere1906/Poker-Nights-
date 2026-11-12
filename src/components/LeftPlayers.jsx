import { formatShekel } from '../lib/format.js';
import Avatar from './Avatar.jsx';
import PlayerName from './PlayerName.jsx';

// "יצאו מהמשחק": players who left mid-game gave up their seat and wait here
// (how they left + the amount). They stay in the results and the settlement.
// Tapping one opens their sheet ("חזר לשחק", history).
export default function LeftPlayers({ players, onTap }) {
  if (players.length === 0) return null;
  return (
    <section className="mb-3 rounded-3xl bg-slate-800/50 p-3 ring-1 ring-white/5">
      <h2 className="mb-2 text-sm font-medium text-slate-400">יצאו מהמשחק 🚪</h2>
      <div className="flex flex-wrap gap-2">
        {players.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onTap(p)}
            className="flex max-w-full items-center gap-2 rounded-2xl bg-slate-950/50 py-1.5 pe-3 ps-1.5 text-sm font-bold transition active:scale-95"
          >
            <Avatar player={p} size="h-8 w-8 text-base" />
            <PlayerName name={p.name} />
            <span className="shrink-0 text-slate-400">{formatShekel(p.out.chips)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
