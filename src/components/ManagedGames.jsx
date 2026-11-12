import { useEffect, useState } from 'react';
import { RECENT_DAYS, listRecentGames, recentManagedGames } from '../lib/onlineTable.js';
import { formatDate } from '../lib/format.js';

function status(t) {
  if (!t.settled_at) {
    const total = t.settlement_transfers?.length ?? 0;
    const paid = t.settlement_transfers?.filter((x) => x.paid_at).length ?? 0;
    return { text: `פתוח להתחשבנות · ${paid}/${total}`, tone: 'bg-amber-300/10 text-amber-200' };
  }
  return t.settled_manually
    ? { text: 'ההתחשבנות נסגרה 🔒', tone: 'bg-emerald-400/10 text-emerald-300' }
    : { text: 'כולם שילמו ✓', tone: 'bg-emerald-400/10 text-emerald-300' };
}

// "משחקים שניהלתי" (stats screen): closed games I managed or co-managed in the
// last 30 days, so a mistake can still be fixed ("פתח מחדש לתיקונים" inside).
// After 30 days a game only leaves this list; it stays in everyone's stats.
export default function ManagedGames({ userId, onOpenTable, loader = listRecentGames }) {
  const [games, setGames] = useState([]);

  useEffect(() => {
    // Not essential: if it fails the section just doesn't show.
    loader()
      .then((rows) => setGames(recentManagedGames(rows, userId)))
      .catch(() => setGames([]));
  }, [loader, userId]);

  if (!games.length) return null;
  return (
    <section className="mt-3">
      <h3 className="text-sm font-medium text-slate-400">🛠️ משחקים שניהלתי</h3>
      <p className="mb-2 text-xs text-slate-500">
        {RECENT_DAYS} הימים האחרונים · לתיקון טעויות אחרי סגירה (״פתח מחדש לתיקונים״ בתוך המשחק)
      </p>
      <ul className="divide-y divide-white/5 rounded-3xl bg-slate-800/70 px-4">
        {games.map((t) => {
          const s = status(t);
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onOpenTable(t.id)}
                className="flex w-full items-center justify-between gap-2 py-3 text-start"
              >
                <span className="min-w-0">
                  <span className="block truncate font-bold">{t.name || 'שולחן בלי שם'}</span>
                  <span className="block text-xs text-slate-400">{formatDate(Date.parse(t.ended_at))}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${s.tone}`}>{s.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
