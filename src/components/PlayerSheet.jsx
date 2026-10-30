import { useState } from 'react';
import { EXITS, timesOf, totalIn } from '../lib/game.js';
import { formatShekel, formatTime } from '../lib/format.js';
import { PALETTE } from '../lib/colors.js';
import BottomSheet from './BottomSheet.jsx';
import AmountInput from './AmountInput.jsx';
import Avatar from './Avatar.jsx';
import CashForm from './CashForm.jsx';

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

const EXIT_BUTTON =
  'flex w-full items-center gap-3 rounded-2xl bg-slate-950/50 p-3 text-start font-bold ring-1 ring-white/10 transition active:scale-[0.98]';

// "יצא מהמשחק": lost everything, left even, or left with a typed amount.
function ExitPicker({ player, onPick }) {
  const [typing, setTyping] = useState(false);
  const [amount, setAmount] = useState(0);
  return (
    <div className="animate-fade-in mb-5 space-y-2 rounded-2xl bg-slate-800/70 p-3">
      <p className="text-sm text-slate-400">איך {player.name} יצא? הסכום יופיע במסך סיום המשחק</p>
      <button type="button" onClick={() => onPick('lost_all')} className={EXIT_BUTTON}>
        <span className="text-2xl">{EXITS.lost_all.icon}</span>
        <span className="flex-1">{EXITS.lost_all.label}</span>
        <span className="text-sm text-slate-400">{formatShekel(0)}</span>
      </button>
      <button type="button" onClick={() => onPick('even')} className={EXIT_BUTTON}>
        <span className="text-2xl">{EXITS.even.icon}</span>
        <span className="flex-1">{EXITS.even.label}</span>
        <span className="text-sm text-slate-400">{formatShekel(totalIn(player))}</span>
      </button>
      {typing ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onPick('amount', amount);
          }}
        >
          <div className="flex-1">
            <AmountInput value={amount} onChange={setAmount} placeholder="יצא עם" autoFocus />
          </div>
          <button type="submit" className="rounded-2xl bg-emerald-400 px-5 font-bold text-slate-900 active:scale-95">
            אישור
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setTyping(true)} className={EXIT_BUTTON}>
          <span className="text-2xl">{EXITS.amount.icon}</span>
          <span className="flex-1">{EXITS.amount.label}</span>
        </button>
      )}
    </div>
  );
}

// After a losing exit: "השאיר מזומן?" (how much, up to the loss), or no.
function LeftCash({ player, players, loss, alreadyPaid, onDone }) {
  const max = Math.max(0, loss - alreadyPaid);
  return (
    <div className="animate-fade-in mb-5 space-y-2 rounded-2xl bg-slate-800/70 p-3">
      <p className="font-bold">השאיר מזומן? 💵</p>
      <p className="text-sm text-slate-400">אם {player.name} שילם חלק מההפסד במזומן, הוא יחושב בסוף ורק היתרה תועבר</p>
      <CashForm
        players={players}
        payerId={player.id}
        maxFor={() => max}
        defaultAmount={max}
        saveLabel="השאיר מזומן ✓"
        onSave={(cash) => onDone(cash)}
        onCancel={() => onDone(null)}
        cancelLabel="לא השאיר"
      />
    </div>
  );
}

export default function PlayerSheet({
  player,
  players = [],
  cashLeft = [],
  rebuyAmounts,
  canManage = true,
  canSelfAdd = false,
  onBuyIn,
  onUndo,
  onRemove,
  onEditIdentity,
  onMarkOut,
  onMarkBack,
  onClose,
}) {
  const [custom, setCustom] = useState(0);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showHistory, setShowHistory] = useState(!canManage && !canSelfAdd);
  const [editing, setEditing] = useState(false);
  const [pickingExit, setPickingExit] = useState(false);
  // An exit with a loss waits here for the "השאיר מזומן?" answer.
  const [pendingExit, setPendingExit] = useState(null);

  const count = player.buyIns.length;
  const lastBuyIn = player.buyIns[count - 1];
  const times = timesOf(player);
  const exit = player.out && EXITS[player.out.kind];
  // A player who is out gets no buy-ins until they're back.
  const canAdd = (canManage || canSelfAdd) && !player.out;

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

      {exit && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl bg-slate-800/70 p-3">
          <span className="text-3xl">{exit.icon}</span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">{exit.label}</p>
            <p className="text-sm text-slate-400">יצא מהמשחק עם {formatShekel(player.out.chips)}</p>
            {cashLeft.map((c) => (
              <p key={c.id} className="text-sm text-amber-200">
                💵 השאיר {formatShekel(c.amount)} מזומן
              </p>
            ))}
          </div>
          {canManage && onMarkBack && (
            <button
              type="button"
              onClick={onMarkBack}
              className="rounded-xl bg-emerald-400 px-3 py-2.5 text-sm font-extrabold text-slate-900 active:scale-95"
            >
              חזר לשחק 🎲
            </button>
          )}
        </div>
      )}

      {pickingExit && !exit && (
        <ExitPicker
          player={player}
          onPick={(kind, amount) => {
            setPickingExit(false);
            const loss = totalIn(player) - (kind === 'lost_all' ? 0 : kind === 'amount' ? amount : totalIn(player));
            if (loss > 0) setPendingExit({ kind, amount, loss });
            else onMarkOut(kind, amount, null);
          }}
        />
      )}

      {pendingExit && !exit && (
        <LeftCash
          player={player}
          players={players}
          loss={pendingExit.loss}
          alreadyPaid={cashLeft.reduce((s, c) => s + c.amount, 0)}
          onDone={(cash) => {
            setPendingExit(null);
            onMarkOut(pendingExit.kind, pendingExit.amount, cash);
          }}
        />
      )}

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

      {canManage && onMarkOut && !exit && !pickingExit && !pendingExit && (
        <button
          type="button"
          onClick={() => setPickingExit(true)}
          className="mb-2 w-full rounded-2xl bg-slate-800 py-3 font-bold text-slate-200 transition active:scale-[0.98]"
        >
          יצא מהמשחק 🚪
        </button>
      )}

      {canManage && (
        <div className="flex gap-2">
          {count > 1 && !exit && (
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
