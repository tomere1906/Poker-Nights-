import { useState } from 'react';
import { QUICK_AMOUNTS, totalIn } from '../lib/game.js';
import { formatShekel } from '../lib/format.js';
import BottomSheet from './BottomSheet.jsx';
import AmountInput from './AmountInput.jsx';
import Avatar from './Avatar.jsx';

export default function PlayerSheet({ player, onBuyIn, onUndo, onRemove, onClose }) {
  const [custom, setCustom] = useState(0);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const count = player.buyIns.length;
  const lastBuyIn = player.buyIns[count - 1];

  return (
    <BottomSheet
      onClose={onClose}
      title={
        <div className="mb-5 flex items-center gap-3">
          <Avatar player={player} size="h-14 w-14 text-xl" />
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold">{player.name}</h2>
            <p className="text-sm text-slate-400">
              {formatShekel(totalIn(player))} · {count === 1 ? 'קנייה אחת' : `${count} קניות`}
            </p>
          </div>
        </div>
      }
    >
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
