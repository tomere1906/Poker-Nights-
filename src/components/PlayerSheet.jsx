import { useState } from 'react';
import { QUICK_AMOUNTS, timesOf, totalIn } from '../lib/game.js';
import { formatShekel, formatTime } from '../lib/format.js';
import BottomSheet from './BottomSheet.jsx';
import AmountInput from './AmountInput.jsx';
import Avatar from './Avatar.jsx';

export default function PlayerSheet({ player, onBuyIn, onUndo, onRemove, onClose }) {
  const [custom, setCustom] = useState(0);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const count = player.buyIns.length;
  const lastBuyIn = player.buyIns[count - 1];
  const times = timesOf(player);

  return (
    <BottomSheet
      onClose={onClose}
      title={
        <div className="mb-5 flex items-center gap-3">
          <Avatar player={player} size="h-14 w-14 text-xl" />
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold">{player.name}</h2>
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              aria-expanded={showHistory}
              className="-mx-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-sm text-slate-400 active:bg-white/5"
            >
              {formatShekel(totalIn(player))} ·{' '}
              <span className="font-bold text-slate-200 underline decoration-dotted underline-offset-4">
                {count === 1 ? 'קנייה אחת' : `${count} קניות`}
              </span>
              <span className={`text-xs transition-transform ${showHistory ? 'rotate-180' : ''}`}>▾</span>
            </button>
          </div>
        </div>
      }
    >
      {showHistory && (
        <ol className="animate-fade-in mb-5 divide-y divide-white/5 rounded-2xl bg-slate-800/70 px-4 text-sm">
          {player.buyIns.map((amount, i) => (
            <li key={i} className="flex items-center gap-3 py-2.5">
              <span className="w-5 text-slate-500">{i + 1}</span>
              <span className="flex-1 text-slate-300">{i === 0 ? 'כניסה' : 'קנייה חוזרת'}</span>
              <span className="font-bold">{formatShekel(amount)}</span>
              <span className="w-12 text-end tabular-nums text-slate-400">{formatTime(times[i])}</span>
            </li>
          ))}
        </ol>
      )}

      <p className="mb-2 text-sm text-slate-400">קנייה חוזרת</p>
      <div className="mb-2 grid grid-cols-3 gap-2">
        {QUICK_AMOUNTS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => onBuyIn(a)}
            className="rounded-2xl bg-amber-300 py-4 text-lg font-extrabold text-slate-900 shadow-lg shadow-amber-300/20 transition active:scale-95"
          >
            <span dir="ltr">+{a}</span>
          </button>
        ))}
      </div>
      <form
        className="mb-5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (custom > 0) onBuyIn(custom);
        }}
      >
        <div className="flex-1">
          <AmountInput value={custom} onChange={setCustom} />
        </div>
        <button
          type="submit"
          disabled={custom <= 0}
          className="rounded-2xl bg-amber-300 px-5 font-bold text-slate-900 transition active:scale-95 disabled:opacity-40"
        >
          הוסף
        </button>
      </form>

      <div className="flex gap-2">
        {count > 1 && (
          <button
            type="button"
            onClick={onUndo}
            className="flex-1 rounded-2xl bg-slate-800 py-3 font-medium text-slate-200 transition active:scale-95"
          >
            בטל קנייה אחרונה ({formatShekel(lastBuyIn)})
          </button>
        )}
        <button
          type="button"
          onClick={() => (confirmRemove ? onRemove() : setConfirmRemove(true))}
          className={`flex-1 rounded-2xl py-3 font-medium transition active:scale-95 ${
            confirmRemove ? 'bg-rose-500 text-white' : 'bg-slate-800 text-rose-300'
          }`}
        >
          {confirmRemove ? 'בטוח? הקש שוב' : 'הסר שחקן'}
        </button>
      </div>
    </BottomSheet>
  );
}
