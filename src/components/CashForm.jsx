import { useState } from 'react';
import { formatShekel } from '../lib/format.js';
import AmountInput from './AmountInput.jsx';
import Avatar from './Avatar.jsx';

// Quick buttons for common bills: each tap adds one bill.
export const BILLS = [200, 100, 50, 20];

// A row of players to pick one from (small avatar + name).
function PlayerChoice({ players, value, onChange, label }) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-slate-400">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {players.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            aria-pressed={value === p.id}
            className={`flex items-center gap-1.5 rounded-full py-1 ps-1 pe-3 text-sm font-bold transition active:scale-95 ${
              value === p.id ? 'bg-emerald-400 text-slate-900' : 'bg-slate-950/50 text-slate-300 ring-1 ring-white/10'
            }`}
          >
            <Avatar player={p} size="h-7 w-7 text-xs" />
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}

// "50 + 50 = 100 ₪" (one bill: "200 ₪").
export function billsTotalText(bills) {
  const total = bills.reduce((s, b) => s + b, 0);
  return bills.length > 1 ? `${bills.join(' + ')} = ${formatShekel(total)}` : formatShekel(total);
}

// Cash paid towards a loss, as bills: each one is a separate, indivisible
// entry (the settlement gives each bill whole to one winner). Quick buttons add
// one common bill per tap; a typed amount is added as one bill too. Who paid is
// fixed when payerId is given, else one of payers. maxFor(id): the most that
// player may still pay (their loss minus cash already recorded); cash is never
// more than the loss. Nobody "holds" it. onSave({ from, bills: [200, 50, ...] }).
export default function CashForm({ players, payers = players, payerId = null, maxFor, saveLabel = 'רשום', onSave, onCancel, cancelLabel = 'ביטול' }) {
  const [from, setFrom] = useState(payerId);
  const [bills, setBills] = useState([]);
  const [typed, setTyped] = useState(0);
  const total = bills.reduce((s, b) => s + b, 0);
  const max = from ? maxFor(from) : null;
  const payerName = players.find((p) => p.id === from)?.name ?? 'השחקן';
  const tooMuch = max !== null && total > max;
  const ready = from && bills.length > 0 && !tooMuch;

  return (
    <div className="space-y-3">
      {!payerId && <PlayerChoice players={payers} value={from} onChange={setFrom} label="מי שילם? (רק מי שהפסיד)" />}
      <div>
        <p className="mb-1.5 text-xs text-slate-400">
          כמה מזומן? כל הקשה מוסיפה שטר{max !== null && max > 0 && ` (עד ${formatShekel(max)})`}
        </p>
        <div className="grid grid-cols-4 gap-2">
          {BILLS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBills((list) => [...list, b])}
              className="rounded-2xl bg-emerald-300/15 py-3 text-lg font-extrabold text-emerald-200 ring-1 ring-emerald-300/30 transition active:scale-95"
            >
              💵 {b}
            </button>
          ))}
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed > 0) {
              setBills((list) => [...list, typed]);
              setTyped(0);
            }
          }}
        >
          <div className="flex-1">
            <AmountInput value={typed} onChange={setTyped} placeholder="סכום אחר (שטר אחד)" />
          </div>
          <button
            type="submit"
            disabled={typed <= 0}
            className="rounded-2xl bg-slate-950/60 px-4 font-bold text-slate-200 active:scale-95 disabled:opacity-40"
          >
            הוסף
          </button>
        </form>

        {bills.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {bills.map((b, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setBills((list) => list.filter((_, j) => j !== i))}
                aria-label={`הסר שטר של ${b}`}
                className="rounded-full bg-slate-950/60 px-2.5 py-1 text-sm font-bold text-slate-200 ring-1 ring-white/10 active:scale-95"
              >
                {b} ✕
              </button>
            ))}
            <span dir="ltr" className="ms-auto text-sm font-bold text-amber-300">
              {billsTotalText(bills)}
            </span>
          </div>
        )}

        {tooMuch && (
          <p className="mt-2 rounded-xl bg-rose-400/15 px-3 py-2 text-sm font-bold text-rose-200" role="alert">
            {max === 0
              ? `${payerName} כבר שילם את כל ההפסד שלו`
              : `אי אפשר לשלם במזומן יותר מההפסד: ${payerName} יכול לשלם עד ${formatShekel(max)}`}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!ready}
          onClick={() => onSave({ from, bills })}
          className="flex-1 rounded-2xl bg-emerald-400 py-3 font-bold text-slate-900 active:scale-[0.98] disabled:bg-slate-700 disabled:text-slate-400"
        >
          {saveLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-2xl bg-slate-950/60 px-4 py-3 font-bold text-slate-300 active:scale-95">
            {cancelLabel}
          </button>
        )}
      </div>
    </div>
  );
}
