import { useEffect, useMemo, useState } from 'react';
import { settle } from '../lib/settlement.js';
import { formatDate, formatShekel } from '../lib/format.js';
import { renderSettlementPng, shareOrDownload } from '../lib/settlementImage.js';
import Avatar from './Avatar.jsx';
import RoundingPicker, { roundingLabel } from './RoundingPicker.jsx';

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

// Cash already paid during the night, passed on by whoever holds it:
// "מזומן שאצל תומר" → 200 ₪ לעומר. handoffs: [{ holder, to, amount }].
export function CashHandoffs({ handoffs, byId }) {
  const holders = [...new Set(handoffs.map((h) => h.holder))];
  const nameOf = (id) => byId.get(id)?.name ?? 'שחקן';
  return (
    <div className="space-y-2">
      {holders.map((holder) => {
        const rows = handoffs.filter((h) => h.holder === holder);
        const total = rows.reduce((s, h) => s + h.amount, 0);
        return (
          <section key={holder} className="rounded-3xl bg-amber-300/10 p-3 ring-1 ring-amber-300/20">
            <div className="mb-2 flex items-center gap-2">
              <Avatar player={byId.get(holder)} size="h-8 w-8 text-xs" />
              <h4 className="flex-1 font-bold">
                💵 מזומן שאצל {nameOf(holder)} <span className="font-normal text-slate-400">· {formatShekel(total)}</span>
              </h4>
            </div>
            <ul className="space-y-1.5">
              {rows.map((h) => (
                <li key={h.to} className="flex items-center gap-2 rounded-2xl bg-slate-900/60 px-3 py-2">
                  <span className="text-lg font-extrabold text-amber-300">{formatShekel(h.amount)}</span>
                  <span className="text-slate-400">←</span>
                  <Avatar player={byId.get(h.to)} size="h-8 w-8 text-xs" />
                  <span className="truncate font-bold">{h.to === holder ? `נשאר אצל ${nameOf(holder)}` : nameOf(h.to)}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// Who pays whom. entries: [{ id, net }] (any numbers; settle() rounds them to
// `rounding` and balances them). date: when the game ended (ms; default now).
// onRoundingChange: shows the "עיגול סכומים" picker (before the game is closed;
// it depends on the night's amounts). cash: [{ from, holder, amount }] paid
// during the night; only the rest is transferred. children: extra buttons under "share".
export default function Settlement({
  players,
  entries,
  rounding = 1,
  cash = [],
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
  const { nets, transfers, cashHandoffs } = useMemo(() => settle(entries, { unit: rounding, cash }), [entries, rounding, cash]);
  const details = [tableName, formatDate(when), roundingLabel(rounding)].filter(Boolean).join(' · ');

  // Prepare the image up front: iPhone Safari opens the share sheet only right
  // after a tap, so the tap itself must not wait for drawing.
  useEffect(() => {
    let active = true;
    setFile(null);
    renderSettlementPng({ subtitle: details, date: when, transfers, nets, cashHandoffs, players: byId })
      .then((f) => active && setFile(f))
      .catch(() => active && setFile(null));
    return () => {
      active = false;
    };
  }, [details, when, transfers, nets, cashHandoffs, byId]);

  async function share() {
    setShareState('working');
    try {
      const image = file ?? (await renderSettlementPng({ subtitle: details, date: when, transfers, nets, cashHandoffs, players: byId }));
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

      {cashHandoffs.length > 0 && (
        <>
          <CashHandoffs handoffs={cashHandoffs} byId={byId} />
          <h3 className="mt-5 mb-2 text-sm font-medium text-slate-400">העברות 💸</h3>
        </>
      )}

      {transfers.length === 0 ? (
        <p className="rounded-3xl bg-slate-800/70 p-6 text-center text-lg">
          {cashHandoffs.length > 0 ? 'אין העברות – הכל שולם במזומן 💵' : 'כולם יצאו מאוזנים 🤝'}
        </p>
      ) : (
        <ul className="space-y-2">
          {transfers.map((t, i) => (
            <li
              key={i}
              className="animate-pop-in flex items-center gap-2 rounded-3xl bg-slate-800/70 p-3 shadow-lg ring-1 ring-white/5"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Avatar player={byId.get(t.from)} size="h-10 w-10 text-sm" />
                <span className="truncate font-bold">{nameOf(t.from)}</span>
              </div>
              <div className="flex shrink-0 flex-col items-center px-1">
                <span className="text-lg font-extrabold text-amber-300">{formatShekel(t.amount)}</span>
                <span className="-mt-1 text-xl leading-none text-slate-400">←</span>
              </div>
              <div className="flex min-w-0 flex-1 flex-row-reverse items-center gap-2">
                <Avatar player={byId.get(t.to)} size="h-10 w-10 text-sm" />
                <span className="truncate font-bold">{nameOf(t.to)}</span>
              </div>
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
              className={`rounded-full px-3 py-1.5 text-sm font-bold ${
                e.net > 0 ? 'bg-emerald-400/15 text-emerald-300' : e.net < 0 ? 'bg-rose-400/15 text-rose-300' : 'bg-white/10 text-slate-300'
              }`}
            >
              {nameOf(e.id)} {formatShekel(e.net, { signed: true })}
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
