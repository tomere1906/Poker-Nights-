import { useState } from 'react';
import { QUICK_AMOUNTS } from '../lib/game.js';
import { formatShekel } from '../lib/format.js';
import BottomSheet from './BottomSheet.jsx';
import AmountInput from './AmountInput.jsx';

export default function AddPlayerSheet({ onAdd, onClose }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState(QUICK_AMOUNTS[0]);
  const valid = name.trim() !== '' && amount > 0;

  function submit(e) {
    e.preventDefault();
    if (valid) onAdd(name.trim(), amount);
  }

  return (
    <BottomSheet
      onClose={onClose}
      title={<h2 className="mb-4 text-xl font-bold">הוסף שחקן</h2>}
    >
      <form onSubmit={submit} className="space-y-4">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="שם השחקן"
          maxLength={20}
          className="w-full rounded-2xl bg-slate-800 px-4 py-3 text-lg outline-none ring-2 ring-transparent placeholder:text-slate-500 focus:ring-emerald-400"
        />
        <div>
          <p className="mb-2 text-sm text-slate-400">קנייה ראשונה</p>
          <div className="mb-2 grid grid-cols-3 gap-2">
            {QUICK_AMOUNTS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAmount(a)}
                className={`rounded-2xl py-3 text-lg font-bold transition active:scale-95 ${
                  amount === a ? 'bg-amber-300 text-slate-900 shadow-lg shadow-amber-300/20' : 'bg-slate-800 text-slate-200'
                }`}
              >
                {formatShekel(a)}
              </button>
            ))}
          </div>
          <AmountInput value={QUICK_AMOUNTS.includes(amount) ? 0 : amount} onChange={setAmount} />
        </div>
        <button
          type="submit"
          disabled={!valid}
          className="w-full rounded-2xl bg-emerald-400 py-4 text-lg font-extrabold text-slate-900 shadow-lg shadow-emerald-400/20 transition active:scale-[0.98] disabled:opacity-40"
        >
          הוסף שחקן
        </button>
      </form>
    </BottomSheet>
  );
}
