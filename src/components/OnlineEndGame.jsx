import { useEffect, useMemo, useRef, useState } from 'react';
import { finalsFor, toChips } from '../lib/onlineTable.js';
import EndGame from './EndGame.jsx';

const SAVE_DELAY = 600;

// Results entry for an online table (managers and co-managers). What this phone
// types shows at once and is saved shortly after; other managers' entries
// arrive live. Results are stored as chips, so the +/− and chips modes are
// just two ways of typing the same thing.
export default function OnlineEndGame({ view, actions, onBack, onSettle, onError }) {
  // player id -> chips typed here and not yet confirmed by the server (null = cleared)
  const [overrides, setOverrides] = useState({});
  const pending = useRef({});
  const timers = useRef({});
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const finals = useMemo(
    () => finalsFor(view.players, view.endMode, (p) => (p.id in overrides ? overrides[p.id] : p.finalChips)),
    [view, overrides]
  );

  // Once the server has what was typed, show the server's value again.
  useEffect(() => {
    setOverrides((current) => {
      let changed = false;
      const next = { ...current };
      for (const p of view.players) {
        if (p.id in next && !(p.id in pending.current) && next[p.id] === (p.finalChips ?? null)) {
          delete next[p.id];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [view]);

  function save(id) {
    const chips = pending.current[id];
    delete pending.current[id];
    return actionsRef.current.setFinalChips(id, chips).catch((e) => onError(e.message));
  }

  async function flush() {
    const ids = Object.keys(pending.current);
    for (const id of ids) clearTimeout(timers.current[id]);
    await Promise.all(ids.map(save));
  }

  // Leaving the screen saves whatever is still waiting.
  useEffect(() => () => void flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function onFinal(id, value) {
    const player = view.players.find((p) => p.id === id);
    if (!player) return;
    const chips = toChips(player, value, view.endMode);
    setOverrides((o) => ({ ...o, [id]: chips }));
    pending.current[id] = chips;
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => save(id), SAVE_DELAY);
  }

  return (
    <EndGame
      state={{ players: view.players, finals, endMode: view.endMode, cash: view.cash }}
      defaultHolderId={view.myPlayerId}
      onAddCash={(cash) => actions.addCash(cash).catch((e) => onError(e.message))}
      onRemoveCash={(id) => actions.removeCash(id).catch((e) => onError(e.message))}
      onMode={(mode) => actions.setEndMode(mode).catch((e) => onError(e.message))}
      onFinal={onFinal}
      onBack={onBack}
      onSettle={async () => {
        await flush();
        onSettle();
      }}
    />
  );
}
