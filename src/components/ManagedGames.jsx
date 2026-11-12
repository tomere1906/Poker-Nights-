import { useCallback, useEffect, useState } from 'react';
import { RECENT_DAYS, deleteGame, hideFromManagedList, listRecentGames, recentManagedGames } from '../lib/onlineTable.js';
import { formatDate } from '../lib/format.js';
import BottomSheet from './BottomSheet.jsx';

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

const OPTION = 'flex w-full items-start gap-3 rounded-2xl p-3 text-start transition active:scale-[0.98]';

// "הסר מהרשימה" (only my list) for managers and co-managers; "מחק משחק לגמרי"
// (for everyone, stats included) only for the manager who opened the table.
function ManagedOptions({ game, canDelete, onHide, onDelete, onClose }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <BottomSheet
      onClose={onClose}
      title={
        <div className="mb-4">
          <h2 className="truncate text-xl font-bold">{game.name || 'שולחן בלי שם'}</h2>
          <p className="text-sm text-slate-400">{formatDate(Date.parse(game.ended_at))}</p>
        </div>
      }
    >
      <div className="space-y-2">
        <button type="button" onClick={onHide} className={`${OPTION} bg-slate-800`}>
          <span className="text-2xl">🧹</span>
          <span>
            <span className="block font-bold">הסר מהרשימה</span>
            <span className="block text-sm text-slate-400">רק מהרשימה הזאת אצלך. המשחק נשאר בסטטיסטיקה של כולם.</span>
          </span>
        </button>

        {canDelete && (
          <button
            type="button"
            onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
            className={`${OPTION} ${confirmDelete ? 'bg-rose-500 text-white' : 'bg-slate-800'}`}
          >
            <span className="text-2xl">🗑️</span>
            <span>
              <span className={`block font-bold ${confirmDelete ? '' : 'text-rose-300'}`}>
                {confirmDelete ? 'בטוח? הקש שוב למחיקה' : 'מחק משחק לגמרי'}
              </span>
              <span className={`block text-sm ${confirmDelete ? 'text-rose-50' : 'text-slate-400'}`}>
                המשחק יימחק לכל השחקנים, כולל מהסטטיסטיקה. אי אפשר להחזיר.
              </span>
            </span>
          </button>
        )}
      </div>
    </BottomSheet>
  );
}

// "משחקים שניהלתי" (stats screen): closed games I managed or co-managed in the
// last 30 days, so a mistake can still be fixed ("פתח מחדש לתיקונים" inside).
// After 30 days a game only leaves this list; it stays in everyone's stats.
export default function ManagedGames({ userId, onOpenTable, onDeleted = () => {}, showToast = () => {}, loader = listRecentGames }) {
  const [games, setGames] = useState([]);
  const [options, setOptions] = useState(null);

  const reload = useCallback(
    () =>
      loader()
        .then(({ tables, hidden }) => setGames(recentManagedGames(tables, userId, Date.now(), hidden)))
        // Not essential: if it fails the section just doesn't show.
        .catch(() => setGames([])),
    [loader, userId]
  );

  useEffect(() => {
    reload();
  }, [reload]);

  async function run(fn, success, after = () => {}) {
    setOptions(null);
    try {
      await fn();
      showToast(success);
      after();
    } catch (e) {
      showToast(`הפעולה נכשלה: ${e.message}`);
    }
    await reload();
  }

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
            <li key={t.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenTable(t.id)}
                className="flex min-w-0 flex-1 items-center justify-between gap-2 py-3 text-start"
              >
                <span className="min-w-0">
                  <span className="block truncate font-bold">{t.name || 'שולחן בלי שם'}</span>
                  <span className="block text-xs text-slate-400">{formatDate(Date.parse(t.ended_at))}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${s.tone}`}>{s.text}</span>
              </button>
              <button
                type="button"
                onClick={() => setOptions(t)}
                aria-label="אפשרויות למשחק"
                className="shrink-0 rounded-xl bg-slate-950/50 px-3 py-2 text-lg font-bold leading-none text-slate-300 active:scale-95"
              >
                ⋯
              </button>
            </li>
          );
        })}
      </ul>

      {options && (
        <ManagedOptions
          key={options.id}
          game={options}
          canDelete={options.manager_id === userId}
          onClose={() => setOptions(null)}
          onHide={() => run(() => hideFromManagedList(options.id), 'הוסר מהרשימה 🧹')}
          onDelete={() => run(() => deleteGame(options.id), 'המשחק נמחק לכל השחקנים 🗑️', onDeleted)}
        />
      )}
    </section>
  );
}
