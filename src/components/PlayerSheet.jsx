import { useState } from 'react';
import { timesOf, totalIn } from '../lib/game.js';
import { formatShekel, formatTime } from '../lib/format.js';
import { PALETTE } from '../lib/colors.js';
import BottomSheet from './BottomSheet.jsx';
import AmountInput from './AmountInput.jsx';
import Avatar from './Avatar.jsx';

function buyInCountLabel(count) {
  if (count === 0) return 'אין קניות';
  return count === 1 ? 'קנייה אחת' : `${count} קניות`;
}

// Per-table name + color, set by a manager. For a signed-in user, "reset"
// goes back to their own profile name/color; guests always need both.
function IdentityEditor({ player, onSave }) {
  const isUser = Boolean(player.userId);
  const [name, setName] = useState(player.nickname ?? player.name);
  const [color, setColor] = useState(player.color);
  const trimmed = name.trim();

  return (
    <div className="mb-5 space-y-3 rounded-2xl bg-slate-800/70 p-3">
      <p className="text-sm text-slate-400">שם וצבע בשולחן הזה בלבד</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={30}
        className="w-full rounded-xl bg-slate-950/60 px-3 py-2.5 text-lg outline-none ring-2 ring-transparent focus:ring-emerald-400"
      />
      <div className="grid grid-cols-6 gap-1.5">
        {PALETTE.map((c, i) => (
          <button
            key={c.name}
            type="button"
            onClick={() => setColor(i)}
            aria-label={c.name}
            aria-pressed={color === i}
            className={`h-9 rounded-xl bg-gradient-to-br ${c.gradient} ${color === i ? 'ring-2 ring-white' : 'opacity-70'}`}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!trimmed}
          onClick={() => onSave({ nickname: trimmed, color })}
          className="flex-1 rounded-xl bg-emerald-400 py-2.5 font-bold text-slate-900 disabled:opacity-40"
        >
          שמור
        </button>
        {isUser && (player.nickname !== null || player.colorOverride !== null) && (
          <button
            type="button"
            onClick={() => onSave({ nickname: null, color: null })}
            className="rounded-xl bg-slate-950/60 px-3 py-2.5 text-sm font-bold text-slate-300"
          >
            חזרה לשם ולצבע שלו
          </button>
        )}
      </div>
    </div>
  );
}

export default function PlayerSheet({
  player,
  rebuyAmounts,
  canManage = true,
  canSelfAdd = false,
  onBuyIn,
  onUndo,
  onRemove,
  onEditIdentity,
  onClose,
}) {
  const [custom, setCustom] = useState(0);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showHistory, setShowHistory] = useState(!canManage && !canSelfAdd);
  const [editing, setEditing] = useState(false);
  const count = player.buyIns.length;
  const lastBuyIn = player.buyIns[count - 1];
  const times = timesOf(player);
  const canAdd = canManage || canSelfAdd;

  return (
    <BottomSheet
      onClose={onClose}
      title={
        <div className="mb-5 flex items-center gap-3">
          <Avatar player={player} size="h-14 w-14 text-xl" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-bold">{player.name}</h2>
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              aria-expanded={showHistory}
              className="-mx-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-sm text-slate-400 active:bg-white/5"
            >
              {formatShekel(totalIn(player))} ·{' '}
              <span className="font-bold text-slate-200 underline decoration-dotted underline-offset-4">
                {buyInCountLabel(count)}
              </span>
              <span className={`text-xs transition-transform ${showHistory ? 'rotate-180' : ''}`}>▾</span>
            </button>
          </div>
          {canManage && onEditIdentity && (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              aria-label="שם וצבע בשולחן"
              className="rounded-xl bg-slate-800 px-3 py-2 text-sm font-bold text-slate-200 active:scale-95"
            >
              ✏️ שם/צבע
            </button>
          )}
        </div>
      }
    >
      {editing && <IdentityEditor player={player} onSave={onEditIdentity} />}

      {showHistory && count > 0 && (
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

      {canAdd && (
        <>
          <p className="mb-2 text-sm text-slate-400">{canManage ? 'קנייה חוזרת' : 'הוסף לעצמך קנייה'}</p>
          <div className="mb-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${rebuyAmounts.length}, 1fr)` }}>
            {rebuyAmounts.map((a) => (
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
        </>
      )}

      {!canManage && canSelfAdd && (
        <p className="mb-2 text-center text-xs text-slate-500">תיקונים ומחיקות – רק אצל המנהלים</p>
      )}

      {canManage && (
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
      )}
    </BottomSheet>
  );
}
