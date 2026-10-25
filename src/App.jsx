import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { DEFAULT_SETTINGS, cleanSettings, gameReducer, initialState, normalizeState } from './lib/game.js';
import { loadSettings, loadState, saveSettings, saveState } from './lib/storage.js';
import { useAuth } from './lib/auth.js';
import { createOnlineTable } from './lib/onlineTable.js';
import TableScreen from './components/TableScreen.jsx';
import OnlineTable from './components/OnlineTable.jsx';
import EndGame from './components/EndGame.jsx';
import Settlement from './components/Settlement.jsx';
import Confetti from './components/Confetti.jsx';
import Toast from './components/Toast.jsx';
import HomeScreen from './components/HomeScreen.jsx';
import TableSetup from './components/TableSetup.jsx';
import NameSetup from './components/NameSetup.jsx';
import ProfileScreen from './components/ProfileScreen.jsx';
import { CardsIcon } from './components/Icons.jsx';

// Matches the page background (html/body in index.css and the theme-color meta).
const THEME_COLOR = '#0b1120';

export default function App() {
  const [state, dispatch] = useReducer(gameReducer, initialState, (s) => normalizeState(loadState(s)));
  // The app always opens on the start screen. The local game lives in `state`;
  // online tables live in Supabase.
  // 'home' | 'profile' | 'setup-local' | 'setup-online' | 'game' (local) | 'online'
  const [screen, setScreen] = useState('home');
  const [onlineTableId, setOnlineTableId] = useState(null);
  const auth = useAuth();
  // First sign-in: confirm a display name (and pick a color) before anything else.
  const needsName = Boolean(auth.session && auth.profile && !auth.profile.name_confirmed_at);
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

  const showToast = useCallback((text) => {
    clearTimeout(toastTimer.current);
    setToast({ text, key: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);

  const setView = (view) => dispatch({ type: 'setView', view });
  const { players, view, started, settings } = state;
  const goHome = () => setScreen('home');
  const openOnline = (id) => {
    setOnlineTableId(id);
    setScreen('online');
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      {needsName && <NameSetup profile={auth.profile} onSaved={auth.setProfile} />}

      {!needsName && screen === 'home' && (
        <HomeScreen
          state={state}
          auth={auth}
          onOpenProfile={() => setScreen('profile')}
          onContinueLocal={() => setScreen('game')}
          onNewLocal={() => setScreen('setup-local')}
          onContinueOnline={openOnline}
          onNewOnline={() => setScreen('setup-online')}
        />
      )}

      {!needsName && screen === 'profile' && auth.profile && (
        <ProfileScreen
          profile={auth.profile}
          onBack={goHome}
          onSaved={(profile) => {
            auth.setProfile(profile);
            goHome();
            showToast('הפרופיל נשמר ✓');
          }}
        />
      )}

      {!needsName && (screen === 'setup-local' || screen === 'setup-online') && (
        <TableSetup
          online={screen === 'setup-online'}
          defaults={cleanSettings(loadSettings(DEFAULT_SETTINGS))}
          onBack={goHome}
          onOpen={async (newSettings, buyInMode) => {
            saveSettings(newSettings);
            if (screen === 'setup-online') {
              try {
                openOnline(await createOnlineTable(newSettings, buyInMode));
                showToast('השולחן האונליין נפתח 🎉');
              } catch (e) {
                showToast(`לא הצלחנו לפתוח שולחן: ${e.message}`);
              }
              return;
            }
            dispatch({ type: 'openTable', settings: newSettings });
            setScreen('game');
            showToast('השולחן נפתח – הושיבו שחקנים 🎉');
          }}
        />
      )}

      {!needsName && screen === 'online' && onlineTableId && auth.session && (
        <OnlineTable key={onlineTableId} tableId={onlineTableId} userId={auth.session.user.id} onHome={goHome} showToast={showToast} />
      )}

      {!needsName && screen === 'game' && (
        <header className="mb-2 flex items-center gap-2">
          <button type="button" onClick={goHome} aria-label="מסך הבית" className="flex items-center gap-2 rounded-2xl active:scale-95">
            <CardsIcon className="h-9 w-9 drop-shadow" />
            <h1 className="text-2xl font-extrabold tracking-tight">Poker Nights</h1>
          </button>
          <span className="rounded-full bg-slate-700/60 px-2 py-0.5 text-xs font-bold text-slate-300">📱 מקומי</span>
        </header>
      )}

      {!needsName && screen === 'game' && view === 'table' && (
        <TableScreen
          players={players}
          started={started}
          settings={settings}
          onAdd={({ seat, position, name, amount }) =>
            dispatch(
              started
                ? { type: 'addPlayer', position, name, amount, at: Date.now() }
                : { type: 'seatPlayer', seat, name, amount, at: Date.now() }
            )
          }
          onBuyIn={(player, amount) => dispatch({ type: 'addBuyIn', id: player.id, amount, at: Date.now() })}
          onUndo={(player) => dispatch({ type: 'undoBuyIn', id: player.id })}
          onRemove={(player) => dispatch({ type: 'removePlayer', id: player.id })}
          onMove={(id, seat) => dispatch({ type: 'moveSeat', id, seat })}
          onStart={() => dispatch({ type: 'startGame' })}
          onEnd={() => setView('end')}
          showToast={showToast}
        />
      )}

      {!needsName && screen === 'game' && view === 'end' && (
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

      {!needsName && screen === 'game' && view === 'settle' && (
        <Settlement
          state={state}
          onBack={() => setView('end')}
          onNewGame={() => {
            dispatch({ type: 'newGame' });
            goHome();
          }}
        />
      )}

      {confetti > 0 && <Confetti key={confetti} onDone={endConfetti} />}
      <Toast toast={toast} />
    </div>
  );
}
