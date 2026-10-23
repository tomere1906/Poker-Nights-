import { useEffect, useReducer, useRef, useState } from 'react';
import { MAX_PLAYERS, gameReducer, initialState, normalizeState } from './lib/game.js';
import { loadState, saveState } from './lib/storage.js';
import { formatShekel } from './lib/format.js';
import PokerTable from './components/PokerTable.jsx';
import AddPlayerSheet from './components/AddPlayerSheet.jsx';
import PlayerSheet from './components/PlayerSheet.jsx';
import EndGame from './components/EndGame.jsx';
import Settlement from './components/Settlement.jsx';
import Confetti from './components/Confetti.jsx';
import Toast from './components/Toast.jsx';
import { CardsIcon } from './components/Icons.jsx';

export default function App() {
  const [state, dispatch] = useReducer(gameReducer, initialState, (s) => normalizeState(loadState(s)));
  const [sheet, setSheet] = useState(null); // { type: 'add', position } | { type: 'player', id }
  const [placing, setPlacing] = useState(false);
  const [confetti, setConfetti] = useState(0);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef();

  useEffect(() => saveState(state), [state]);

  function showToast(text) {
    clearTimeout(toastTimer.current);
    setToast({ text, key: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }

  const setView = (view) => dispatch({ type: 'setView', view });
  const close = () => setSheet(null);
  const { players, view } = state;
  const full = players.length >= MAX_PLAYERS;
  const activePlayer = sheet?.type === 'player' && players.find((p) => p.id === sheet.id);

  function startAdd() {
    // With fewer than two players there's nowhere "between" to choose.
    if (players.length < 2) setSheet({ type: 'add', position: players.length });
    else setPlacing(true);
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <header className="mb-2 flex items-center gap-2">
        <CardsIcon className="h-9 w-9 drop-shadow" />
        <h1 className="text-2xl font-extrabold tracking-tight">Poker Nights</h1>
      </header>

      {view === 'table' && (
        <>
          <main className="flex flex-1 items-center">
            <PokerTable
              players={players}
              placing={placing}
              onPlace={(position) => {
                setPlacing(false);
                setSheet({ type: 'add', position });
              }}
              onPlayerTap={(p) => setSheet({ type: 'player', id: p.id })}
              onMove={(id, seat) => dispatch({ type: 'moveSeat', id, seat })}
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
          ) : (
            <>
              {players.length > 0 && (
                <p className="mb-2 text-center text-xs text-slate-500">הקש על שחקן לקנייה חוזרת · גרור כדי להחליף מקום</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={players.length < 2}
                  onClick={() => setView('end')}
                  className="flex-1 rounded-2xl bg-emerald-400 py-4 text-lg font-extrabold text-slate-900 shadow-lg shadow-emerald-400/20 transition active:scale-[0.98] disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
                >
                  סיום משחק 🏁
                </button>
                {!full && (
                  <button
                    type="button"
                    onClick={startAdd}
                    className={`flex items-center gap-1 rounded-2xl bg-amber-300 font-extrabold text-slate-900 shadow-lg shadow-amber-300/20 transition active:scale-95 ${
                      players.length === 0 ? 'flex-1 justify-center py-4 text-lg' : 'px-4'
                    }`}
                  >
                    <span className="text-2xl leading-none">+</span>
                    {players.length === 0 ? 'הוסף שחקן' : 'שחקן'}
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}

      {view === 'end' && (
        <EndGame
          state={state}
          onMode={(mode) => dispatch({ type: 'setEndMode', mode })}
          onFinal={(id, amount) => dispatch({ type: 'setFinal', id, amount })}
          onBack={() => setView('table')}
          onSettle={() => {
            setView('settle');
            setConfetti((n) => n + 1);
          }}
        />
      )}

      {view === 'settle' && (
        <Settlement
          state={state}
          onBack={() => setView('end')}
          onNewGame={() => {
            dispatch({ type: 'newGame' });
            showToast('משחק חדש – בהצלחה! 🍀');
          }}
        />
      )}

      {sheet?.type === 'add' && (
        <AddPlayerSheet
          onClose={close}
          onAdd={(name, amount) => {
            dispatch({ type: 'addPlayer', position: sheet.position, name, amount });
            close();
            showToast(`${name} הצטרף/ה לשולחן 🎉`);
          }}
        />
      )}

      {activePlayer && (
        <PlayerSheet
          key={activePlayer.id}
          player={activePlayer}
          onClose={close}
          onBuyIn={(amount) => {
            dispatch({ type: 'addBuyIn', id: activePlayer.id, amount });
            close();
            showToast(`${activePlayer.name}: קנייה חוזרת ${formatShekel(amount)}`);
          }}
          onUndo={() => dispatch({ type: 'undoBuyIn', id: activePlayer.id })}
          onRemove={() => {
            dispatch({ type: 'removePlayer', id: activePlayer.id });
            close();
          }}
        />
      )}

      {confetti > 0 && <Confetti key={confetti} />}
      <Toast toast={toast} />
    </div>
  );
}
