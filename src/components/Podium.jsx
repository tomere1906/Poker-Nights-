import { MEDALS, podium, podiumOrder } from '../lib/podium.js';
import { formatShekel } from '../lib/format.js';
import Avatar from './Avatar.jsx';
import PlayerName from './PlayerName.jsx';

// Step heights: 1st the tallest, in the middle.
const STEP = { 1: 'h-20', 2: 'h-14', 3: 'h-10' };

// The night's top 3 winners (gold, silver, bronze), shown once the table is
// closed. nets: the settled nets; byId: Map(id -> player).
export default function Podium({ nets, byId }) {
  const places = podiumOrder(podium(nets));
  if (places.length === 0) return null;
  return (
    <section aria-label="הפודיום של הערב" className="mb-4 overflow-hidden rounded-3xl bg-slate-800/70 px-3 pt-3 ring-1 ring-white/5">
      <h3 className="mb-2 text-center text-sm font-bold text-slate-300">🏆 הפודיום של הערב</h3>
      {/* A real podium as seen from the audience: 2nd left, 1st middle, 3rd right. */}
      <div dir="ltr" className="flex items-end justify-center gap-2">
        {places.map((p, i) => {
          // An empty spot keeps 1st in the middle (e.g. no 2nd after a tie for 1st).
          if (!p) return <div key={`empty-${i}`} className="max-w-[33%] flex-1" />;
          const medal = MEDALS[p.place];
          return (
            <div key={p.place} dir="rtl" className="flex min-w-0 max-w-[33%] flex-1 flex-col items-center">
              <div className="mb-1 flex -space-x-3 space-x-reverse">
                {p.ids.slice(0, 3).map((id) => (
                  // On the podium everyone shows their initials (not the "left mid-game" icon).
                  <Avatar
                    key={id}
                    player={{ ...byId.get(id), out: null }}
                    size={p.place === 1 ? 'h-12 w-12 text-base' : 'h-10 w-10 text-sm'}
                  />
                ))}
              </div>
              <div className="w-full text-center text-sm font-bold">
                {p.ids.map((id) => (
                  <PlayerName key={id} name={byId.get(id)?.name ?? 'שחקן'} className="text-center" />
                ))}
              </div>
              <p className="mb-1 text-sm font-extrabold text-emerald-300">{formatShekel(p.net, { signed: true })}</p>
              <div
                className={`flex w-full items-start justify-center rounded-t-2xl pt-1.5 text-2xl ${STEP[p.place]}`}
                style={{ background: `linear-gradient(to bottom, ${medal.color}55, ${medal.color}18)`, boxShadow: `inset 0 2px 0 ${medal.color}aa` }}
              >
                <span aria-label={medal.label}>{medal.icon}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
