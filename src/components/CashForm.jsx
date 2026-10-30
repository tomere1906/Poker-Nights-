import { useState } from 'react';
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

// Cash paid during the night: who paid (fixed when payerId is given), how much,
// and who at the table holds it. onSave({ from, holder, amount }).
export default function CashForm({ players, payerId = null, defaultAmount = 0, defaultHolderId = null, saveLabel = 'רשום', onSave, onCancel, cancelLabel = 'ביטול' }) {
  const [from, setFrom] = useState(payerId);
  const [amount, setAmount] = useState(defaultAmount);
  const holders = players.filter((p) => p.id !== from);
  const [holder, setHolder] = useState(defaultHolderId !== payerId ? defaultHolderId : null);
  const validHolder = holders.some((p) => p.id === holder) ? holder : null;
  const ready = from && validHolder && amount > 0;

  return (
    <div className="space-y-3">
      {!payerId && <PlayerChoice players={players} value={from} onChange={setFrom} label="מי שילם?" />}
      <div>
        <p className="mb-1.5 text-xs text-slate-400">כמה מזומן?</p>
        <AmountInput value={amount} onChange={setAmount} placeholder="סכום" />
      </div>
      {from && <PlayerChoice players={holders} value={validHolder} onChange={setHolder} label="אצל מי המזומן?" />}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!ready}
          onClick={() => onSave({ from, holder: validHolder, amount })}
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
