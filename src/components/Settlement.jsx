import { useEffect, useMemo, useState } from 'react';
import { adjustReady, cashParts, countingGap, needsAdjust, roundTo, settle } from '../lib/settlement.js';
import { formatDate, formatShekel } from '../lib/format.js';
import { renderSettlementPng, shareOrDownload } from '../lib/settlementImage.js';
import { AdjustChoice, AdjustmentNote } from './AdjustPanel.jsx';
import Avatar from './Avatar.jsx';
import PlayerName from './PlayerName.jsx';
import Podium from './Podium.jsx';
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

const NONE = [];

// The middle of a row: the amount and the arrow line under it.
// - plain transfer: yellow amount, "←".
// - all cash: a 💵 and the green amount, "← מזומן" in green.
// - mixed: the usual yellow amount (only part of it is cash), and one line
//   "200 מזומן · 70 העברה" (cash green, transfer gray) that never wraps.
function RowAmount({ row }) {
  const parts = cashParts(row);
  if (!parts || parts.transfer) {
    return (
      <div className="flex shrink-0 flex-col items-center px-1">
        <span className="text-lg font-extrabold text-amber-300">{formatShekel(row.amount)}</span>
        {parts ? (
          <span className="whitespace-nowrap text-[13px] font-bold leading-tight">
            <span className="text-emerald-300">{parts.cash} מזומן</span>
            <span className="text-slate-500"> · </span>
            <span className="text-slate-400">{parts.transfer} העברה</span>
          </span>
        ) : (
          <span className="-mt-1 text-xl leading-none text-slate-400">←</span>
        )}
      </div>
    );
  }
  return (
    <div className="flex shrink-0 flex-col items-center px-1">
      <span className="flex items-center gap-1 whitespace-nowrap text-lg font-extrabold text-emerald-300">
        <span className="text-2xl leading-none" aria-hidden>
          💵
        </span>
        {formatShekel(row.amount)}
      </span>
      <span className="text-sm font-bold leading-tight">
        <span className="text-slate-400">← </span>
        <span className="text-emerald-300">מזומן</span>
      </span>
    </div>
  );
}

// Who pays whom. entries: [{ id, net }] (any numbers; settle() rounds them to
// `rounding` and balances them). date: when the game ended (ms; default now).
// onRoundingChange: shows the "עיגול סכומים" picker (before the game is closed;
// it depends on the night's amounts). cash: [{ from, amount }] paid in cash
// when settling: one list of rows, each with a small "💵 מזומן" or
// "200 מזומן · 70 העברה" note; only the rest is transferred.
// absent: ids of players who are "לא כאן" (cash goes only to winners who are
// present; an absent winner gets a transfer). onAbsentChange(id, absent): shows
// the "מי לא כאן?" toggles (managers, before the game is closed). manager: the
// manager's seat, who takes cash that no present winner is owed and passes it on.
// The line under a stored row (closed online table): its status ("פתוח" /
// "שולם ✓", a toggle for the payer, the receiver and managers) and, for the
// payer only, "העתק טלפון לביט" when the receiver saved a number.
function RowFooter({ row, canMark, onTogglePaid, phone, onBit }) {
  const [busy, setBusy] = useState(false);
  const paid = Boolean(row.paidAt);
  const status = paid ? 'שולם ✓' : 'פתוח';
  const statusClass = paid ? 'bg-emerald-400/15 text-emerald-300' : 'bg-slate-950/50 text-slate-400';
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/5 pt-2">
      {canMark ? (
        <button
          type="button"
          aria-pressed={paid}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onTogglePaid(row, !paid);
            } finally {
              setBusy(false);
            }
          }}
          className={`rounded-xl px-3 py-2 text-sm font-bold transition active:scale-95 disabled:opacity-60 ${statusClass}`}
        >
          {status}
          {!paid && <span className="text-slate-500"> · סמן ששולם</span>}
        </button>
      ) : (
        <span className={`rounded-xl px-3 py-2 text-sm font-bold ${statusClass}`}>{status}</span>
      )}
      {phone && (
        <button
          type="button"
          onClick={() => onBit(row, phone)}
          className="ms-auto rounded-xl bg-sky-400/15 px-3 py-2 text-sm font-bold text-sky-200 transition active:scale-95"
        >
          העתק טלפון לביט 📋
        </button>
      )}
    </div>
  );
}

// stored: the transfers saved when an online table was closed (with paidAt);
// shown instead of recomputing, with "N מתוך M שולמו" on top. canMark(row) /
// onTogglePaid(row, paid): "שולם ✓". phoneFor(row): the receiver's number for
// the viewer (only the payer gets one), onBit(row, phone): copy it and open Bit.
// showPodium: the night's top 3 winners on top (once the table is closed;
// also in the shared image). children: extra buttons under "share".
// "הסכומים לא מתאזנים": before closing, adjust is the manager's choice of who
// covers the difference and onAdjustChange(adjust) lets them choose (null:
// read only); nothing is settled until there's a usable choice. A closed
// table passes `adjustment` instead (what was stored, or null for none).
export default function Settlement({
  players,
  entries,
  rounding = 1,
  cash = NONE,
  absent = NONE,
  onAbsentChange = null,
  manager = null,
  onRoundingChange = null,
  tableName = null,
  date = null,
  notice = null,
  stored = NONE,
  canMark = null,
  onTogglePaid = null,
  phoneFor = null,
  onBit = null,
  showPodium = false,
  adjust = null,
  onAdjustChange = null,
  adjustment: closedAdjustment,
  onBack,
  children,
}) {
  const [shareState, setShareState] = useState(null); // null | 'working' | 'downloaded' | 'error'
  const [file, setFile] = useState(null);
  const [now] = useState(() => Date.now());
  const when = date ?? now;

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const nameOf = (id) => byId.get(id)?.name ?? 'שחקן';
  const computed = useMemo(
    () => settle(entries, { unit: rounding, cash, absent, manager, adjust }),
    [entries, rounding, cash, absent, manager, adjust]
  );
  const { nets } = computed;
  const closed = closedAdjustment !== undefined;
  const asking = !closed && needsAdjust(entries, rounding);
  // Results that don't add up: nothing is settled until the manager chooses.
  const waiting = !closed && !adjustReady(entries, rounding, adjust);
  const adjustment = closed ? closedAdjustment : computed.adjustment;
  // A closed online table shows exactly what was stored when it was closed.
  const transfers = stored.length > 0 ? stored : computed.transfers;
  const paidCount = stored.filter((t) => t.paidAt).length;
  const away = new Set(absent);
  // The header: table name and date only.
  const details = [tableName, formatDate(when)].filter(Boolean).join(' · ');

  // Prepare the image up front: iPhone Safari opens the share sheet only right
  // after a tap, so the tap itself must not wait for drawing.
  useEffect(() => {
    let active = true;
    setFile(null);
    renderSettlementPng({ subtitle: details, date: when, transfers, nets, players: byId, podium: showPodium })
      .then((f) => active && setFile(f))
      .catch(() => active && setFile(null));
    return () => {
      active = false;
    };
  }, [details, when, transfers, nets, byId, showPodium]);

  async function share() {
    setShareState('working');
    try {
      const image = file ?? (await renderSettlementPng({ subtitle: details, date: when, transfers, nets, players: byId, podium: showPodium }));
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

      {showPodium && !waiting && <Podium nets={nets} byId={byId} />}

      {asking && (
        <AdjustChoice
          gap={countingGap(entries)}
          adjust={adjust}
          players={players}
          canWinners={entries.some((e) => roundTo(e.net, rounding) > 0)}
          onChange={onAdjustChange}
        />
      )}

      {onRoundingChange && (
        <div className="mb-4 rounded-3xl bg-slate-800/70 p-3 ring-1 ring-white/5">
          <p className="mb-2 text-sm font-medium text-slate-400">עיגול סכומים</p>
          <RoundingPicker value={rounding} onChange={onRoundingChange} />
        </div>
      )}

      {onAbsentChange && (
        <div className="mb-4 rounded-3xl bg-slate-800/70 p-3 ring-1 ring-white/5">
          <p className="text-sm font-medium text-slate-400">מי לא כאן?</p>
          <p className="mb-2 text-xs text-slate-500">
            מזומן עובר רק למי שנמצא. מי שלא כאן יקבל העברה (אם אף זוכה לא כאן, מי שנמצא לוקח את המזומן ומעביר הלאה)
          </p>
          <div className="flex flex-wrap gap-2">
            {players.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={away.has(p.id)}
                onClick={() => onAbsentChange(p.id, !away.has(p.id))}
                className={`flex max-w-full items-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-bold transition active:scale-95 ${
                  away.has(p.id) ? 'bg-rose-400/15 text-rose-200 ring-1 ring-rose-400/40' : 'bg-slate-950/40 text-slate-300'
                }`}
              >
                <PlayerName name={p.name} />
                {away.has(p.id) && <span className="shrink-0 text-xs">🚪 לא כאן</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {!waiting && adjustment && <AdjustmentNote adjustment={adjustment} nameOf={nameOf} />}

      {stored.length > 0 && (
        <p
          className={`mb-3 rounded-2xl px-4 py-2 text-center text-sm font-bold ${
            paidCount === stored.length ? 'bg-emerald-400/15 text-emerald-200' : 'bg-slate-800/70 text-slate-300'
          }`}
        >
          {paidCount === stored.length ? `כל ההעברות שולמו ✓` : `${paidCount} מתוך ${stored.length} שולמו`}
        </p>
      )}

      {waiting ? (
        <p className="rounded-3xl bg-slate-800/70 p-6 text-center text-slate-300">בחרו מי מכסה את ההפרש, ואז נחשב מי מעביר למי</p>
      ) : transfers.length === 0 ? (
        <p className="rounded-3xl bg-slate-800/70 p-6 text-center text-lg">כולם יצאו מאוזנים 🤝</p>
      ) : (
        <ul className="space-y-2">
          {transfers.map((t, i) => (
            <li
              key={t.id ?? i}
              className="animate-pop-in rounded-3xl bg-slate-800/70 p-3 shadow-lg ring-1 ring-white/5"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Avatar player={byId.get(t.from)} size="h-10 w-10 text-sm" />
                  <PlayerName name={nameOf(t.from)} className="font-bold" />
                </div>
                <RowAmount row={t} />
                <div className="flex min-w-0 flex-1 flex-row-reverse items-center gap-2">
                  <Avatar player={byId.get(t.to)} size="h-10 w-10 text-sm" />
                  <PlayerName name={nameOf(t.to)} className="text-end font-bold" />
                </div>
              </div>
              {t.id && (
                <RowFooter
                  row={t}
                  canMark={Boolean(onTogglePaid && canMark?.(t))}
                  onTogglePaid={onTogglePaid}
                  phone={phoneFor?.(t) ?? null}
                  onBit={onBit}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {!waiting && <h3 className="mt-6 mb-2 text-sm font-medium text-slate-400">תוצאות הערב</h3>}
      <div className={`flex flex-wrap gap-2 ${waiting ? 'hidden' : ''}`}>
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
              <span className="shrink-0">{formatShekel(e.net, { signed: true })}</span>
            </span>
          ))}
      </div>

      <div className="mt-auto space-y-2 pt-6">
        <button
          type="button"
          onClick={share}
          disabled={waiting || shareState === 'working'}
          className="w-full rounded-2xl bg-emerald-400 py-4 text-lg font-extrabold text-slate-900 shadow-lg shadow-emerald-400/20 transition active:scale-[0.98] disabled:opacity-40"
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
