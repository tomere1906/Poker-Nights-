import { useEffect, useMemo, useState } from 'react';
import { loadStats } from '../lib/statsData.js';
import { MATE_SORTS, personalStats, sortMates, withAverages } from '../lib/stats.js';
import { formatDate, formatShekel } from '../lib/format.js';
import { suggestedColor } from '../lib/colors.js';
import Avatar from './Avatar.jsx';
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

function Mine({ games, onOpenTable }) {
  const s = useMemo(() => personalStats(games), [games]);
  if (s.count === 0) {
    return (
      <p className="rounded-3xl bg-slate-800/70 p-6 text-center text-slate-400">
        עוד אין משחקים סגורים.
        <br />
        הסטטיסטיקה תופיע אחרי שמנהל השולחן יסגור שולחן 🔒
      </p>
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
            <li key={g.tableId}>
              <button type="button" onClick={() => onOpenTable(g.tableId)} className="flex w-full items-center gap-3 py-3 text-start">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{g.tableName ?? 'שולחן בלי שם'}</span>
                  <span className="block text-xs text-slate-400">
                    {formatDate(g.endedAt)} · {g.playerCount} שחקנים
                  </span>
                </span>
                <span className={`shrink-0 font-extrabold ${tone(g.net)}`}>{signed(g.net)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
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
export default function StatsScreen({ onBack, onOpenTable, loader = loadStats }) {
  const [tab, setTab] = useState('mine');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loader()
      .then(setData)
      .catch((e) => setError(e.message));
  }, [loader]);

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
            onClick={() => setTab(t.id)}
            className={`rounded-xl py-2.5 font-bold transition ${tab === t.id ? 'bg-slate-100 text-slate-900 shadow' : 'text-slate-400'}`}
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
      ) : tab === 'mine' ? (
        <Mine games={data.games} onOpenTable={onOpenTable} />
      ) : (
        <Mates mates={data.mates} />
      )}
      {/* Keeps the last card off the bottom edge (iOS toolbar tint). */}
      <div className="h-6 shrink-0" />
    </div>
  );
}
