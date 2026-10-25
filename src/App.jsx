import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, MAX_PLAYERS, cleanSettings, gameReducer, initialState, normalizeState } from './lib/game.js';
import { loadSettings, loadState, saveSettings, saveState } from './lib/storage.js';
import { useAuth } from './lib/auth.js';
import { formatShekel } from './lib/format.js';
import PokerTable from './components/PokerTable.jsx';
import AddPlayerSheet from './components/AddPlayerSheet.jsx';
import PlayerSheet from './components/PlayerSheet.jsx';
import EndGame from './components/EndGame.jsx';
import Settlement from './components/Settlement.jsx';
import Confetti from './components/Confetti.jsx';
import Toast from './components/Toast.jsx';
import HomeScreen from './components/HomeScreen.jsx';
import TableSetup from './components/TableSetup.jsx';
import { CardsIcon } from './components/Icons.jsx';

// Matches the page background (html/body in index.css and the theme-color meta).
const THEME_COLOR = '#0b1120';

export default function App() {
  const [state, dispatch] = useReducer(gameReducer, initialState, (s) => normalizeState(loadState(s)));
  // The app always opens on the start screen; the game itself is in `state`.
  const [screen, setScreen] = useState('home'); // 'home' | 'setup' | 'game'
  const auth = useAuth();
  const [sheet, setSheet] = useState(null); // { type: 'add', position } | { type: 'player', id }
  const [placing, setPlacing] = useState(false);
  const [confetti, setConfetti] = useState(0);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef();

  useEffect(() => saveState(state), [state]);

  // Every screen uses the same dark background; re-assert the theme color on
  // each screen change so the browser toolbar never keeps a stale tint.
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR);
  }, [screen, state.view]);

  const endConfetti = useCallback(() => setConfetti(0), []);

  function showToast(text) {
    clearTimeout(toastTimer.current);
    setToast({ text, key: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }

  const setView = (view) => dispatch({ type: 'setView', view });
  const close = () => setSheet(null);
  const { players, view, started, settings } = state;
  const full = players.length >= MAX_PLAYERS;
  const activePlayer = sheet?.type === 'player' && players.find((p) => p.id === sheet.id);

  function startAdd() {
    // Setup: next free seat. Game on with fewer than two players: nowhere "between" to choose.
    if (!started) setSheet({ type: 'add', seat: null });
    else if (players.length < 2) setSheet({ type: 'add', position: players.length });
    else setPlacing(true);
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      {screen === 'home' && (
        <HomeScreen state={state} auth={auth} onContinue={() => setScreen('game')} onNewTable={() => setScreen('setup')} />
      )}

      {screen === 'setup' && (
        <TableSetup
          defaults={cleanSettings(loadSettings(DEFAULT_SETTINGS))}
          onBack={() => setScreen('home')}
          onOpen={(newSettings) => {
            saveSettings(newSettings);
            dispatch({ type: 'openTable', settings: newSettings });
            setScreen('game');
            showToast('השולחן נפתח – הושיבו שחקנים 🎉');
          }}
        />
      )}

      {screen === 'game' && (
        <header className="mb-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setScreen('home')}
            aria-label="מסך הבית"
            className="flex items-center gap-2 rounded-2xl active:scale-95"
          >
            <CardsIcon className="h-9 w-9 drop-shadow" />
            <h1 className="text-2xl font-extrabold tracking-tight">Poker Nights</h1>
          </button>
        </header>
      )}

      {screen === 'game' && view === 'table' && (
        <>
          <main className="flex flex-1 items-center">
            <PokerTable
              players={players}
              started={started}
              placing={placing}
              onPlace={(position) => {
                setPlacing(false);
                setSheet({ type: 'add', position });
              }}
              onEmptySeat={(seat) => setSheet({ type: 'add', seat })}
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
                <p className="mb-2 text-center text-xs text-slate-500">
                  {started ? 'הקש על שחקן לקנייה חוזרת' : 'הקש על שחקן לעריכה'} · גרור כדי להחליף מקום
                </p>
              )}
              <div className="flex gap-2">
                {started ? (
                  <button
                    type="button"
                    disabled={players.length < 2}
                    onClick={() => setView('end')}
                    className="flex-1 rounded-2xl bg-emerald-400 py-4 text-lg font-extrabold text-slate-900 shadow-lg shadow-emerald-400/20 transition active:scale-[0.98] disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
                  >
                    סיום משחק 🏁
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={players.length < 2}
                    onClick={() => {
                      dispatch({ type: 'startGame' });
                      showToast('המשחק התחיל – בהצלחה! 🍀');
                    }}
                    className="flex-1 rounded-2xl bg-emerald-400 py-4 text-lg font-extrabold text-slate-900 shadow-lg shadow-emerald-400/20 transition active:scale-[0.98] disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none"
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
          )}
        </>
      )}

      {screen === 'game' && view === 'end' && (
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

      {screen === 'game' && view === 'settle' && (
        <Settlement
          state={state}
          onBack={() => setView('end')}
          onNewGame={() => {
            dispatch({ type: 'newGame' });
            setScreen('home');
          }}
        />
      )}

      {sheet?.type === 'add' && (
        <AddPlayerSheet
          settings={settings}
          onClose={close}
          onAdd={(name, amount) => {
            dispatch(
              started
                ? { type: 'addPlayer', position: sheet.position, name, amount, at: Date.now() }
                : { type: 'seatPlayer', seat: sheet.seat, name, amount, at: Date.now() }
            );
            close();
            showToast(`${name} הצטרף/ה לשולחן 🎉`);
          }}
        />
      )}

      {activePlayer && (
        <PlayerSheet
          key={activePlayer.id}
          player={activePlayer}
          rebuyAmounts={settings.rebuyAmounts}
          onClose={close}
          onBuyIn={(amount) => {
            dispatch({ type: 'addBuyIn', id: activePlayer.id, amount, at: Date.now() });
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

      {confetti > 0 && <Confetti key={confetti} onDone={endConfetti} />}
      <Toast toast={toast} />
    </div>
  );
}
