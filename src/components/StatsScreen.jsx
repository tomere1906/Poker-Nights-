import { useCallback, useEffect, useMemo, useState } from 'react';
import { hideGame, loadStats, removeGameForGood, unhideGame } from '../lib/statsData.js';
import { MATE_SORTS, personalStats, sortMates, withAverages } from '../lib/stats.js';
import { formatDate, formatShekel } from '../lib/format.js';
import { suggestedColor } from '../lib/colors.js';
import Avatar from './Avatar.jsx';
import BottomSheet from './BottomSheet.jsx';
import NetChart from './NetChart.jsx';

const tone = (n) => (n > 0 ? 'text-emerald-300' : n < 0 ? 'text-rose-300' : 'text-slate-300');
const signed = (n) => formatShekel(n, { signed: true });

function Card({ label, children, hint }) {
  return (
    <div className="rounded-2xl bg-slate-800/70 p-3 ring-1 ring-white/5">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-xl font-extrabold">{children}</p>
      {hint && <p className="truncate text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function gameLabel(g) {
  return g.tableName ? `${g.tableName} · ${formatDate(g.endedAt)}` : formatDate(g.endedAt);
}

function OptionsButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="אפשרויות למשחק"
      className="shrink-0 rounded-xl bg-slate-950/50 px-3 py-2 text-lg font-bold leading-none text-slate-300 active:scale-95"
    >
      ⋯
    </button>
  );
}

const OPTION = 'flex w-full items-start gap-3 rounded-2xl p-3 text-start transition active:scale-[0.98]';

// Hide from my stats (can be undone) or remove from my stats for good. Both are
// only about the viewer: the game itself and other players are never touched.
function GameOptions({ game, hidden, onHide, onUnhide, onRemove, onClose }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <BottomSheet
      onClose={onClose}
      title={
        <div className="mb-4">
          <h2 className="truncate text-xl font-bold">{game.tableName ?? 'שולחן בלי שם'}</h2>
          {game.endedAt && <p className="text-sm text-slate-400">{formatDate(game.endedAt)}</p>}
        </div>
      }
    >
      <div className="space-y-2">
        {hidden ? (
          <button type="button" onClick={onUnhide} className={`${OPTION} bg-slate-800`}>
            <span className="text-2xl">👁️</span>
            <span>
              <span className="block font-bold">הצג שוב בסטטיסטיקה</span>
              <span className="block text-sm text-slate-400">המשחק יחזור לסטטיסטיקה שלך ול״החבר׳ה שלי״</span>
            </span>
          </button>
        ) : (
          <button type="button" onClick={onHide} className={`${OPTION} bg-slate-800`}>
            <span className="text-2xl">🙈</span>
            <span>
              <span className="block font-bold">הסתר מהסטטיסטיקה שלי</span>
              <span className="block text-sm text-slate-400">רק אצלך. שום דבר לא נמחק, ושאר השחקנים ממשיכים לראות אותו. אפשר להחזיר.</span>
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => (confirmDelete ? onRemove() : setConfirmDelete(true))}
          className={`${OPTION} ${confirmDelete ? 'bg-rose-500 text-white' : 'bg-slate-800'}`}
        >
          <span className="text-2xl">🗑️</span>
          <span>
            <span className={`block font-bold ${confirmDelete ? '' : 'text-rose-300'}`}>
              {confirmDelete ? 'בטוח? הקש שוב – אי אפשר להחזיר' : 'מחק מהסטטיסטיקה שלי לצמיתות'}
            </span>
            <span className={`block text-sm ${confirmDelete ? 'text-rose-50' : 'text-slate-400'}`}>
              רק אצלך, בלי אפשרות להחזיר. המשחק עצמו לא נמחק, ושאר השחקנים ממשיכים לראות אותו.
            </span>
          </span>
        </button>
      </div>
    </BottomSheet>
  );
}

function HiddenLink({ count, onShowHidden }) {
  if (count === 0) return null;
  return (
    <button
      type="button"
      onClick={onShowHidden}
      className="w-full rounded-2xl bg-slate-800/60 py-3 text-sm font-bold text-slate-300 active:scale-[0.98]"
    >
      🙈 משחקים מוסתרים ({count})
    </button>
  );
}

function Hidden({ hidden, onUnhide, onOptions, onBack }) {
  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="text-sm font-bold text-slate-400">
        → חזרה לסטטיסטיקה
      </button>
      <h3 className="text-xl font-extrabold">משחקים מוסתרים 🙈</h3>
      <p className="text-sm text-slate-400">
        מוסתרים רק מהסטטיסטיקה שלך (גם מ״החבר׳ה שלי״). שום דבר לא נמחק, ולשאר השחקנים הם נשארים.
      </p>
      {hidden.length === 0 ? (
        <p className="rounded-3xl bg-slate-800/70 p-6 text-center text-slate-400">אין משחקים מוסתרים</p>
      ) : (
        <ul className="divide-y divide-white/5 rounded-3xl bg-slate-800/70 px-4">
          {hidden.map((g) => (
            <li key={g.tableId} className="flex items-center gap-3 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{g.tableName ?? 'שולחן בלי שם'}</span>
                <span className="block text-xs text-slate-400">
                  {g.status === 'ended' ? formatDate(g.endedAt) : 'עוד לא נסגר'}
                  {g.net != null && g.status === 'ended' ? ` · ${signed(g.net)}` : ''}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onUnhide(g.tableId)}
                className="shrink-0 rounded-xl bg-emerald-400 px-3 py-2 text-sm font-extrabold text-slate-900 active:scale-95"
              >
                הצג שוב
              </button>
              <OptionsButton onClick={() => onOptions(g)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Mine({ games, hiddenCount, onOpenTable, onOptions, onShowHidden }) {
  const s = useMemo(() => personalStats(games), [games]);
  if (s.count === 0) {
    return (
      <div className="space-y-3">
        <p className="rounded-3xl bg-slate-800/70 p-6 text-center text-slate-400">
          {hiddenCount > 0 ? 'כל המשחקים שלך מוסתרים.' : 'עוד אין משחקים סגורים.'}
          <br />
          {hiddenCount > 0 ? 'אפשר להחזיר אותם למטה' : 'הסטטיסטיקה תופיע אחרי שמנהל השולחן יסגור שולחן 🔒'}
        </p>
        <HiddenLink count={hiddenCount} onShowHidden={onShowHidden} />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Card label="משחקים">{s.count}</Card>
        <Card label="סה״כ">
          <span className={tone(s.total)}>{signed(s.total)}</span>
        </Card>
        <Card label="ממוצע לערב">
          <span className={tone(s.average)}>{signed(s.average)}</span>
        </Card>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Card label="הערב הכי טוב 🏆" hint={gameLabel(s.best)}>
          <span className={tone(s.best.net)}>{signed(s.best.net)}</span>
        </Card>
        <Card label="הערב הכי קשה 😬" hint={gameLabel(s.worst)}>
          <span className={tone(s.worst.net)}>{signed(s.worst.net)}</span>
        </Card>
      </div>

      <NetChart series={s.series} />

      <section className="rounded-3xl bg-slate-800/70 p-4 ring-1 ring-white/5">
        <h3 className="mb-2 font-bold">עובדות משעשעות 🎲</h3>
        <ul className="space-y-1.5 text-sm text-slate-300">
          <li>
            💀 הפסדת הכל <b className="text-slate-100">{s.lostAll === 1 ? 'פעם אחת' : `${s.lostAll} פעמים`}</b>
          </li>
          <li>
            💵 בממוצע <b className="text-slate-100">{s.avgBuyIns}</b> כניסות לערב (≈ {formatShekel(s.avgBuyInAmount)})
          </li>
          <li>
            🔥 רצף רווחים נוכחי: <b className="text-slate-100">{s.currentStreak}</b> · השיא שלך:{' '}
            <b className="text-slate-100">{s.bestStreak}</b>
          </li>
          <li>
            ✅ ערבים ברווח: <b className="text-slate-100">{s.wins}</b> מתוך {s.count}
          </li>
        </ul>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium text-slate-400">המשחקים שלי</h3>
        <ul className="divide-y divide-white/5 rounded-3xl bg-slate-800/70 px-4">
          {s.recent.map((g) => (
            <li key={g.tableId} className="flex items-center gap-2">
              <button type="button" onClick={() => onOpenTable(g.tableId)} className="flex min-w-0 flex-1 items-center gap-3 py-3 text-start">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{g.tableName ?? 'שולחן בלי שם'}</span>
                  <span className="block text-xs text-slate-400">
                    {formatDate(g.endedAt)} · {g.playerCount} שחקנים
                  </span>
                </span>
                <span className={`shrink-0 font-extrabold ${tone(g.net)}`}>{signed(g.net)}</span>
              </button>
              <OptionsButton onClick={() => onOptions(g)} />
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">⋯ להסתרת משחק (למשל משחק ניסיון) מהסטטיסטיקה שלך, או מחיקה לצמיתות</p>
      </section>

      <HiddenLink count={hiddenCount} onShowHidden={onShowHidden} />
    </div>
  );
}

function Mates({ mates }) {
  const [by, setBy] = useState('total');
  const sorted = useMemo(() => sortMates(withAverages(mates), by), [mates, by]);
  if (mates.length === 0) {
    return <p className="rounded-3xl bg-slate-800/70 p-6 text-center text-slate-400">עוד לא שיחקת עם אף אחד בשולחן סגור</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">המספרים רק מהמשחקים שבהם שיחקת איתם</p>
      <div className="flex gap-2" role="group" aria-label="מיון">
        {Object.entries(MATE_SORTS).map(([id, s]) => (
          <button
            key={id}
            type="button"
            onClick={() => setBy(id)}
            aria-pressed={by === id}
            className={`rounded-full px-4 py-2 text-sm font-bold transition active:scale-95 ${
              by === id ? 'bg-slate-100 text-slate-900' : 'bg-slate-800 text-slate-300'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <ul className="space-y-2">
        {sorted.map((m, i) => (
          <li key={m.key} className="flex items-center gap-3 rounded-2xl bg-slate-800/70 p-3 ring-1 ring-white/5">
            <span className="w-5 text-center text-sm text-slate-500">{i + 1}</span>
            <Avatar player={{ name: m.name, color: m.color ?? suggestedColor(m.key) }} size="h-10 w-10 text-sm" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate font-bold">
                {m.name}
                {m.isGuest && <span className="rounded-full bg-white/10 px-1.5 text-[11px] font-medium text-slate-300">אורח</span>}
              </p>
              <p className="text-xs text-slate-400">
                {m.games === 1 ? 'משחק אחד' : `${m.games} משחקים`} · ממוצע {signed(m.average)}
              </p>
            </div>
            <span className={`shrink-0 font-extrabold ${tone(m.total)}`}>{signed(m.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const TABS = [
  { id: 'mine', label: '📊 שלי' },
  { id: 'mates', label: '👥 החבר׳ה שלי' },
];

// Stats from closed online games the viewer played in. Only the viewer sees them.
export default function StatsScreen({
  onBack,
  onOpenTable,
  showToast = () => {},
  loader = loadStats,
  hide = hideGame,
  unhide = unhideGame,
  removeForGood = removeGameForGood,
}) {
  const [tab, setTab] = useState('mine');
  const [showHidden, setShowHidden] = useState(false);
  const [options, setOptions] = useState(null); // { game, hidden } for the options sheet
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(
    () =>
      loader()
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch((e) => setError(e.message)),
    [loader]
  );

  useEffect(() => {
    reload();
  }, [reload]);

  async function run(fn, success) {
    try {
      await fn();
      showToast(success);
    } catch (e) {
      showToast(`הפעולה נכשלה: ${e.message}`);
    }
    await reload();
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="חזרה"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xl active:scale-90"
        >
          →
        </button>
        <div>
          <h2 className="text-2xl font-extrabold">סטטיסטיקה</h2>
          <p className="text-sm text-slate-400">משולחנות אונליין סגורים בלבד · רק אתה רואה</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-slate-800/70 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setShowHidden(false);
            }}
            className={`rounded-xl py-2.5 font-bold transition ${tab === t.id && !showHidden ? 'bg-slate-100 text-slate-900 shadow' : 'text-slate-400'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="text-sm text-rose-300">לא הצלחנו לטעון: {error}</p>
      ) : !data ? (
        <div className="space-y-2">
          <div className="h-20 animate-pulse rounded-3xl bg-slate-800/60" />
          <div className="h-44 animate-pulse rounded-3xl bg-slate-800/60" />
        </div>
      ) : showHidden ? (
        <Hidden
          hidden={data.hidden}
          onBack={() => setShowHidden(false)}
          onUnhide={(tableId) => run(() => unhide(tableId), 'המשחק חזר לסטטיסטיקה ✓')}
          onOptions={(game) => setOptions({ game, hidden: true })}
        />
      ) : tab === 'mine' ? (
        <Mine
          games={data.games}
          hiddenCount={data.hidden.length}
          onOpenTable={onOpenTable}
          onOptions={(game) => setOptions({ game, hidden: false })}
          onShowHidden={() => setShowHidden(true)}
        />
      ) : (
        <>
          <Mates mates={data.mates} />
          {data.hidden.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">לא כולל {data.hidden.length === 1 ? 'משחק מוסתר אחד' : `${data.hidden.length} משחקים מוסתרים`}</p>
          )}
        </>
      )}
      {/* Keeps the last card off the bottom edge (iOS toolbar tint). */}
      <div className="h-6 shrink-0" />

      {options && (
        <GameOptions
          key={options.game.tableId}
          game={options.game}
          hidden={options.hidden}
          onClose={() => setOptions(null)}
          onHide={() => {
            setOptions(null);
            run(() => hide(options.game.tableId), 'המשחק הוסתר מהסטטיסטיקה שלך 🙈');
          }}
          onUnhide={() => {
            setOptions(null);
            run(() => unhide(options.game.tableId), 'המשחק חזר לסטטיסטיקה ✓');
          }}
          onRemove={() => {
            setOptions(null);
            run(() => removeForGood(options.game.tableId), 'המשחק נמחק מהסטטיסטיקה שלך 🗑️');
          }}
        />
      )}
    </div>
  );
}
