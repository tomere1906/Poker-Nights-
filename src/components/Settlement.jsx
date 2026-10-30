import { useEffect, useMemo, useState } from 'react';
import { cashNote, settle, sheepIds } from '../lib/settlement.js';
import { formatDate, formatShekel } from '../lib/format.js';
import { renderSettlementPng, shareOrDownload } from '../lib/settlementImage.js';
import Avatar from './Avatar.jsx';
import PlayerName from './PlayerName.jsx';
import RoundingPicker from './RoundingPicker.jsx';

// "משחק חדש" for the local table: wipes the game after a second tap.
export function NewGameButton({ onNewGame }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <button
      type="button"
      onClick={() => (confirm ? onNewGame() : setConfirm(true))}
      className={`w-full rounded-2xl py-3.5 font-bold transition active:scale-[0.98] ${
        confirm ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-200'
      }`}
    >
      {confirm ? 'בטוח? כל הנתונים יימחקו – הקש שוב' : 'משחק חדש 🃏'}
    </button>
  );
}

// Who pays whom. entries: [{ id, net }] (any numbers; settle() rounds them to
// `rounding` and balances them). date: when the game ended (ms; default now).
// onRoundingChange: shows the "עיגול סכומים" picker (before the game is closed;
// it depends on the night's amounts). cash: [{ from, amount }] paid in cash
// when settling: one list of rows, each with a small "💵 מזומן" or
// "200 מזומן · 70 העברה" note; only the rest is transferred.
// children: extra buttons under "share".
export default function Settlement({
  players,
  entries,
  rounding = 1,
  cash = [],
  sheep = true,
  onRoundingChange = null,
  tableName = null,
  date = null,
  notice = null,
  onBack,
  children,
}) {
  const [shareState, setShareState] = useState(null); // null | 'working' | 'downloaded' | 'error'
  const [file, setFile] = useState(null);
  const [now] = useState(() => Date.now());
  const when = date ?? now;

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const nameOf = (id) => byId.get(id)?.name ?? 'שחקן';
  const { nets, transfers } = useMemo(() => settle(entries, { unit: rounding, cash }), [entries, rounding, cash]);
  // The header: table name and date only.
  const details = [tableName, formatDate(when)].filter(Boolean).join(' · ');
  // "🐑 כבש הערב": the biggest loser(s), when the table has it on.
  const sheepOf = useMemo(() => (sheep ? sheepIds(nets) : new Set()), [sheep, nets]);

  // Prepare the image up front: iPhone Safari opens the share sheet only right
  // after a tap, so the tap itself must not wait for drawing.
  useEffect(() => {
    let active = true;
    setFile(null);
    renderSettlementPng({ subtitle: details, date: when, transfers, nets, sheep: sheepOf, players: byId })
      .then((f) => active && setFile(f))
      .catch(() => active && setFile(null));
    return () => {
      active = false;
    };
  }, [details, when, transfers, nets, sheepOf, byId]);

  async function share() {
    setShareState('working');
    try {
      const image = file ?? (await renderSettlementPng({ subtitle: details, date: when, transfers, nets, sheep: sheepOf, players: byId }));
      const result = await shareOrDownload(image);
      setShareState(result === 'downloaded' ? 'downloaded' : null);
      if (result === 'downloaded') setTimeout(() => setShareState(null), 2500);
    } catch {
      setShareState('error');
      setTimeout(() => setShareState(null), 2500);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-4 flex items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="חזרה"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xl active:scale-90"
          >
            →
          </button>
        )}
        <div className="min-w-0">
          <h2 className="text-2xl font-extrabold">מי מעביר למי 💸</h2>
          <p className="truncate text-sm text-slate-400">{details}</p>
        </div>
      </div>

      {notice}

      {onRoundingChange && (
        <div className="mb-4 rounded-3xl bg-slate-800/70 p-3 ring-1 ring-white/5">
          <p className="mb-2 text-sm font-medium text-slate-400">עיגול סכומים</p>
          <RoundingPicker value={rounding} onChange={onRoundingChange} />
        </div>
      )}

      {transfers.length === 0 ? (
        <p className="rounded-3xl bg-slate-800/70 p-6 text-center text-lg">כולם יצאו מאוזנים 🤝</p>
      ) : (
        <ul className="space-y-2">
          {transfers.map((t, i) => (
            <li
              key={i}
              className="animate-pop-in rounded-3xl bg-slate-800/70 p-3 shadow-lg ring-1 ring-white/5"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Avatar player={byId.get(t.from)} size="h-10 w-10 text-sm" />
                  <PlayerName name={nameOf(t.from)} className="font-bold" />
                </div>
                <div className="flex shrink-0 flex-col items-center px-1">
                  <span className="text-lg font-extrabold text-amber-300">{formatShekel(t.amount)}</span>
                  <span className="-mt-1 text-xl leading-none text-slate-400">←</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-row-reverse items-center gap-2">
                  <Avatar player={byId.get(t.to)} size="h-10 w-10 text-sm" />
                  <PlayerName name={nameOf(t.to)} className="text-end font-bold" />
                </div>
              </div>
              {/* The cash label: its own line under the row, so it never squeezes the names. */}
              {cashNote(t) && (
                <div className="mt-2 flex justify-center">
                  <span className="rounded-full bg-emerald-400 px-3 py-1 text-sm font-extrabold text-slate-900 shadow-md shadow-emerald-400/20">
                    {cashNote(t)}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-6 mb-2 text-sm font-medium text-slate-400">תוצאות הערב</h3>
      <div className="flex flex-wrap gap-2">
        {[...nets]
          .sort((a, b) => b.net - a.net)
          .map((e) => (
            <span
              key={e.id}
              className={`flex max-w-full items-center gap-1.5 rounded-2xl px-3 py-1.5 text-sm font-bold ${
                e.net > 0 ? 'bg-emerald-400/15 text-emerald-300' : e.net < 0 ? 'bg-rose-400/15 text-rose-300' : 'bg-white/10 text-slate-300'
              }`}
            >
              <PlayerName name={nameOf(e.id)} />
              {sheepOf.has(e.id) && (
                <span className="shrink-0 text-lg leading-none" role="img" aria-label="כבש הערב">
                  🐑
                </span>
              )}
              <span className="shrink-0">{formatShekel(e.net, { signed: true })}</span>
            </span>
          ))}
      </div>

      <div className="mt-auto space-y-2 pt-6">
        <button
          type="button"
          onClick={share}
          disabled={shareState === 'working'}
          className="w-full rounded-2xl bg-emerald-400 py-4 text-lg font-extrabold text-slate-900 shadow-lg shadow-emerald-400/20 transition active:scale-[0.98] disabled:opacity-70"
        >
          {shareState === 'working'
            ? 'מכין תמונה…'
            : shareState === 'downloaded'
              ? 'התמונה הורדה ✓'
              : shareState === 'error'
                ? 'לא הצלחנו – נסו שוב'
                : 'שתף כתמונה 📸'}
        </button>
        {children}
      </div>
    </div>
  );
}
