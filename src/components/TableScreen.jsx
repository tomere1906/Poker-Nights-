import { useState } from 'react';
import { MAX_PLAYERS } from '../lib/game.js';
import { formatShekel } from '../lib/format.js';
import PokerTable from './PokerTable.jsx';
import AddPlayerSheet from './AddPlayerSheet.jsx';
import PlayerSheet from './PlayerSheet.jsx';
import BottomSheet from './BottomSheet.jsx';

const PRIMARY =
  'flex-1 rounded-2xl bg-emerald-400 py-4 text-lg font-extrabold text-slate-900 shadow-lg shadow-emerald-400/20 transition active:scale-[0.98] disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none';

// The table, its bottom bar and the add/player sheets. Shared by the local
// table (reducer actions) and the online table (Supabase actions). Handlers
// may be async; failures are shown as a toast.
export default function TableScreen({
  players,
  started,
  settings,
  canManage = true,
  canSelfAdd = () => false,
  people = [],
  onAdd,
  onBuyIn,
  onUndo,
  onRemove,
  onMove,
  onStart,
  onEnd,
  onEditIdentity,
  onSeatSelf,
  onMarkOut,
  onMarkBack,
  tableName = null,
  cash = [],
  showToast,
}) {
  // { type: 'add', seat | position } | { type: 'player', id } | { type: 'seat-self', seat }
  const [sheet, setSheet] = useState(null);
  const [placing, setPlacing] = useState(false);
  const close = () => setSheet(null);
  const full = players.length >= MAX_PLAYERS;
  const activePlayer = sheet?.type === 'player' && players.find((p) => p.id === sheet.id);

  async function act(fn, success) {
    try {
      await fn();
      if (success) showToast(success);
    } catch (e) {
      showToast(`הפעולה נכשלה: ${e.message}`);
    }
  }

  function startAdd() {
    // Setup: next free seat. Game on with fewer than two players: nowhere "between" to choose.
    if (!started) setSheet({ type: 'add', seat: null });
    else if (players.length < 2) setSheet({ type: 'add', position: players.length });
    else setPlacing(true);
  }

  return (
    <>
      <main className="flex flex-1 items-center">
        <PokerTable
          players={players}
          started={started}
          name={tableName}
          placing={placing}
          onPlace={(position) => {
            setPlacing(false);
            setSheet({ type: 'add', position });
          }}
          onEmptySeat={
            canManage
              ? (seat) => setSheet({ type: 'add', seat })
              : onSeatSelf
                ? (seat) => setSheet({ type: 'seat-self', seat })
                : undefined
          }
          onPlayerTap={(p) => setSheet({ type: 'player', id: p.id })}
          onMove={canManage ? (id, seat) => act(() => onMove(id, seat)) : undefined}
        />
      </main>

      {placing ? (
        <button
          type="button"
          onClick={() => setPlacing(false)}
          className="w-full rounded-2xl bg-slate-800 py-4 text-lg font-bold text-slate-200 active:scale-[0.98]"
        >
          ביטול
        </button>
      ) : canManage ? (
        <>
          {players.length > 0 && (
            <p className="mb-2 text-center text-xs text-slate-500">
              {started ? 'הקש על שחקן לקנייה חוזרת' : 'הקש על שחקן לעריכה'} · גרור כדי להחליף מקום
            </p>
          )}
          <div className="flex gap-2">
            {started ? (
              <button type="button" disabled={players.length < 2 || !onEnd} onClick={onEnd} className={PRIMARY}>
                {onEnd ? 'סיום משחק 🏁' : 'סיום משחק – בשלב הבא'}
              </button>
            ) : (
              <button
                type="button"
                disabled={players.length < 2}
                onClick={() => act(onStart, 'המשחק התחיל – בהצלחה! 🍀')}
                className={PRIMARY}
              >
                המשחק התחיל 🎲
              </button>
            )}
            {!full && (
              <button
                type="button"
                onClick={startAdd}
                className={`flex items-center gap-1 rounded-2xl bg-amber-300 font-extrabold text-slate-900 shadow-lg shadow-amber-300/20 transition active:scale-95 ${
                  started ? 'px-4' : 'justify-center px-4 text-base'
                }`}
              >
                <span className="text-2xl leading-none">+</span>
                {started ? 'שחקן' : 'הוסף שחקן'}
              </button>
            )}
          </div>
        </>
      ) : onSeatSelf ? (
        started ? (
          <button type="button" onClick={() => setSheet({ type: 'seat-self', seat: null })} className={PRIMARY}>
            שב לשולחן 🪑
          </button>
        ) : (
          <p className="rounded-2xl bg-emerald-400/15 py-3 text-center font-bold text-emerald-200">
            הקש על + ליד כיסא פנוי כדי לשבת
          </p>
        )
      ) : (
        <p className="rounded-2xl bg-slate-800/60 py-3 text-center text-sm text-slate-400">
          צפייה בשולחן · רק המנהלים מעדכנים
        </p>
      )}

      {sheet?.type === 'seat-self' && (
        <BottomSheet
          onClose={close}
          title={
            <h2 className="mb-2 text-xl font-bold">
              {sheet.seat === null ? 'להצטרף לשולחן?' : `לשבת בכיסא ${sheet.seat + 1}?`}
            </h2>
          }
        >
          <p className="mb-4 text-sm text-slate-400">
            {sheet.seat === null ? 'תשב בסוף השולחן. ' : ''}מנהל השולחן יכול להעביר אותך מקום אחר כך.
          </p>
          <button
            type="button"
            onClick={() => {
              close();
              act(() => onSeatSelf(sheet.seat), 'התיישבת! בהצלחה 🍀');
            }}
            className="w-full rounded-2xl bg-emerald-400 py-4 text-lg font-extrabold text-slate-900 active:scale-[0.98]"
          >
            שב כאן 🪑
          </button>
        </BottomSheet>
      )}

      {sheet?.type === 'add' && (
        <AddPlayerSheet
          settings={settings}
          people={people}
          usedColors={players.map((p) => p.color)}
          onClose={close}
          onAdd={({ name, amount, color, userId }) => {
            close();
            act(
              () => onAdd({ seat: sheet.seat, position: sheet.position, name, amount, color, userId }),
              `${name} הצטרף/ה לשולחן 🎉`
            );
          }}
        />
      )}

      {activePlayer && (
        <PlayerSheet
          key={activePlayer.id}
          player={activePlayer}
          players={players}
          cashLeft={cash.filter((c) => c.from === activePlayer.id)}
          rebuyAmounts={settings.rebuyAmounts}
          canManage={canManage}
          canSelfAdd={canSelfAdd(activePlayer)}
          onClose={close}
          onBuyIn={(amount) => {
            close();
            act(() => onBuyIn(activePlayer, amount), `${activePlayer.name}: קנייה ${formatShekel(amount)}`);
          }}
          onUndo={() => act(() => onUndo(activePlayer))}
          onRemove={() => {
            close();
            act(() => onRemove(activePlayer));
          }}
          // Leaving mid-game only makes sense once the game is on.
          onMarkOut={
            started && onMarkOut
              ? (kind, amount, cashLeft) => {
                  close();
                  act(() => onMarkOut(activePlayer, kind, amount, cashLeft), `${activePlayer.name} יצא מהמשחק`);
                }
              : undefined
          }
          onMarkBack={
            onMarkBack &&
            // The sheet stays open: a re-buy usually comes right after.
            (() => act(() => onMarkBack(activePlayer), `${activePlayer.name} חזר לשחק 🎉`))
          }
          onEditIdentity={
            onEditIdentity &&
            ((identity) => {
              close();
              act(() => onEditIdentity(activePlayer, identity), 'השם והצבע עודכנו ✓');
            })
          }
        />
      )}
    </>
  );
}
