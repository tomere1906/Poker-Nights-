import { useState } from 'react';
import { formatShekel } from '../lib/format.js';
import AmountInput from './AmountInput.jsx';
import Avatar from './Avatar.jsx';

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

// Cash paid into the pot towards a loss: who paid (fixed when payerId is given,
// else one of payers) and how much. maxFor(id): the most that player may still
// pay (their loss minus cash already recorded); cash is never more than the
// loss. Nobody "holds" it: the settlement splits the pot among the winners.
// onSave({ from, amount }).
export default function CashForm({
  players,
  payers = players,
  payerId = null,
  maxFor,
  defaultAmount = 0,
  saveLabel = 'רשום',
  onSave,
  onCancel,
  cancelLabel = 'ביטול',
}) {
  const [from, setFrom] = useState(payerId);
  const [amount, setAmount] = useState(defaultAmount);
  const max = from ? maxFor(from) : null;
  const payerName = players.find((p) => p.id === from)?.name ?? 'השחקן';
  const tooMuch = max !== null && amount > max;
  const ready = from && amount > 0 && !tooMuch;

  return (
    <div className="space-y-3">
      {!payerId && <PlayerChoice players={payers} value={from} onChange={setFrom} label="מי שילם? (רק מי שהפסיד)" />}
      <div>
        <p className="mb-1.5 text-xs text-slate-400">
          כמה מזומן?{max !== null && max > 0 && ` (עד ${formatShekel(max)})`}
        </p>
        <AmountInput value={amount} onChange={setAmount} placeholder="סכום" />
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
          onClick={() => onSave({ from, amount })}
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
