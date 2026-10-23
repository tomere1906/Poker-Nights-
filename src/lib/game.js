// Pure game-state logic. The UI dispatches actions; nothing here touches the DOM.
// Before the game starts the table has MAX_PLAYERS fixed seats (gaps allowed).
// Once it starts, seats are compacted to 0..n-1 so the table never shows gaps.

export const MAX_PLAYERS = 9;
export const QUICK_AMOUNTS = [50, 100, 200];
export const AVATAR_COLORS = 10;

// view: 'table' | 'end' | 'settle'.
// started: false during seating, true once the game is on.
// endMode: 'net' -> finals hold each player's signed profit/loss;
//          'chips' -> finals hold the chips each player left with.
export const initialState = { players: [], view: 'table', started: false, finals: {}, endMode: 'net' };

export function totalIn(player) {
  return player.buyIns.reduce((sum, a) => sum + a, 0);
}

// When each buy-in happened (ms since epoch), aligned with buyIns.
// Null for buy-ins recorded before times were tracked.
export function timesOf(player) {
  return player.buyIns.map((_, i) => player.buyInTimes?.[i] ?? null);
}

export function potTotal(players) {
  return players.reduce((sum, p) => sum + totalIn(p), 0);
}

export function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((w) => [...w][0])
    .join('');
}

// A player's profit/loss, or null if their result hasn't been entered.
export function netOf(state, player) {
  const value = state.finals[player.id];
  if (value === undefined) return null;
  return state.endMode === 'chips' ? value - totalIn(player) : value;
}

function compactSeats(players) {
  return [...players].sort((a, b) => a.seat - b.seat).map((p, i) => ({ ...p, seat: i }));
}

export function firstFreeSeat(players) {
  const taken = new Set(players.map((p) => p.seat));
  for (let i = 0; i < MAX_PLAYERS; i++) if (!taken.has(i)) return i;
  return null;
}

// Repairs saved state from older versions (seat gaps, missing fields).
export function normalizeState(state) {
  // Saves from before `started` existed with players seated were mid-game.
  const started = state.started ?? state.players.length > 0;
  const players = started ? compactSeats(state.players) : state.players;
  const finals = state.finals ?? {};
  // Saves from before endMode existed always held chip counts.
  const endMode = state.endMode ?? (Object.keys(finals).length > 0 ? 'chips' : 'net');
  return { ...initialState, ...state, players, started, finals, endMode };
}

function nextColor(players) {
  const used = new Set(players.map((p) => p.color));
  for (let i = 0; i < AVATAR_COLORS; i++) if (!used.has(i)) return i;
  return players.length % AVATAR_COLORS;
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// `at` is the buy-in time, passed in by the UI so the reducer stays pure.
function newPlayer(state, name, seat, amount, at = null) {
  return { id: newId(), name, seat, color: nextColor(state.players), buyIns: [amount], buyInTimes: [at] };
}

export function gameReducer(state, action) {
  switch (action.type) {
    case 'seatPlayer': {
      // Setup mode: take exactly `seat`, or the first free seat when it's null.
      const { name, amount } = action;
      const seat = action.seat ?? firstFreeSeat(state.players);
      if (seat === null || state.players.some((p) => p.seat === seat)) return state;
      return { ...state, players: [...state.players, newPlayer(state, name, seat, amount, action.at)] };
    }
    case 'addPlayer': {
      // Game on: position is the seat the new player takes; players from there on shift by one.
      const { name, amount } = action;
      if (state.players.length >= MAX_PLAYERS) return state;
      const position = Math.min(Math.max(action.position, 0), state.players.length);
      const shifted = state.players.map((p) => (p.seat >= position ? { ...p, seat: p.seat + 1 } : p));
      return { ...state, players: [...shifted, newPlayer(state, name, position, amount, action.at)] };
    }
    case 'addBuyIn':
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.id
            ? { ...p, buyIns: [...p.buyIns, action.amount], buyInTimes: [...timesOf(p), action.at ?? null] }
            : p
        ),
      };
    case 'undoBuyIn':
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.id && p.buyIns.length > 1
            ? { ...p, buyIns: p.buyIns.slice(0, -1), buyInTimes: timesOf(p).slice(0, -1) }
            : p
        ),
      };
    case 'removePlayer': {
      const gone = state.players.find((p) => p.id === action.id);
      if (!gone) return state;
      const { [action.id]: _, ...finals } = state.finals;
      const rest = state.players.filter((p) => p.id !== action.id);
      return {
        ...state,
        finals,
        // During setup the seat just becomes free; once started, close the gap.
        players: state.started ? rest.map((p) => (p.seat > gone.seat ? { ...p, seat: p.seat - 1 } : p)) : rest,
      };
    }
    case 'startGame':
      return { ...state, started: true, players: compactSeats(state.players) };
    case 'moveSeat': {
      // Dropping onto another player swaps the two; onto an empty seat just moves.
      const mover = state.players.find((p) => p.id === action.id);
      if (!mover || mover.seat === action.seat) return state;
      return {
        ...state,
        players: state.players.map((p) => {
          if (p.id === mover.id) return { ...p, seat: action.seat };
          if (p.seat === action.seat) return { ...p, seat: mover.seat };
          return p;
        }),
      };
    }
    case 'setFinal': {
      const finals = { ...state.finals };
      if (action.amount === null) delete finals[action.id];
      else finals[action.id] = action.amount;
      return { ...state, finals };
    }
    case 'setEndMode': {
      // Convert entries already typed so switching never loses them.
      if (action.mode === state.endMode) return state;
      const sign = action.mode === 'chips' ? 1 : -1;
      const finals = {};
      for (const p of state.players) {
        if (p.id in state.finals) finals[p.id] = state.finals[p.id] + sign * totalIn(p);
      }
      return { ...state, endMode: action.mode, finals };
    }
    case 'setView':
      return { ...state, view: action.view };
    case 'newGame':
      return initialState;
    default:
      return state;
  }
}
