import { DEFAULT_ROUNDING, cleanRounding } from './settlement.js';

// Pure game-state logic. The UI dispatches actions; nothing here touches the DOM.
// Before the game starts the table has MAX_PLAYERS fixed seats (gaps allowed).
// Once it starts, seats are compacted to 0..n-1 so the table never shows gaps.

export const MAX_PLAYERS = 9;
export const AVATAR_COLORS = 12; // = PALETTE.length in src/lib/colors.js
export const MIN_REBUY_BUTTONS = 2;
export const MAX_REBUY_BUTTONS = 4;

// "שווי צ'יפ": how many ₪ one chip is worth (e.g. 0.5). Buy-ins stay in ₪; only
// the chip counts typed at the end are converted.
export const DEFAULT_CHIP_VALUE = 1;
export const CHIP_VALUES = [1, 0.5, 0.25, 0.1];
export const MIN_CHIP_VALUE = 0.01;
export const MAX_CHIP_VALUE = 1000;

// A valid chip value (two decimals at most), or the default.
export function cleanChipValue(value) {
  const n = Math.round(Number(value) * 100) / 100;
  return n >= MIN_CHIP_VALUE && n <= MAX_CHIP_VALUE ? n : DEFAULT_CHIP_VALUE;
}

// Chips counted at the end -> whole shekels (1,500 chips × 0.5 = 750 ₪).
export function chipsToShekels(chips, chipValue = DEFAULT_CHIP_VALUE) {
  return Math.round(chips * chipValue);
}

// The chip count behind an amount in ₪ (for showing both numbers).
export function shekelsToChips(amount, chipValue = DEFAULT_CHIP_VALUE) {
  return Math.round(amount / chipValue);
}

// Table settings chosen by the table manager when opening a table.
// rounding: "עיגול סכומים", results are rounded to a multiple of it (1 / 5 / 10 / 50 ₪).
// chipValue: "שווי צ'יפ" in ₪.
export const DEFAULT_SETTINGS = {
  initialBuyIn: 50,
  rebuyAmounts: [50, 100, 200],
  rounding: DEFAULT_ROUNDING,
  chipValue: DEFAULT_CHIP_VALUE,
};

// The whole state is one table. With a backend later this maps onto a
// `tables` row (settings, status) plus `players` and `buy_ins` rows.
// tableOpen: a table exists (opened from the start screen) and hasn't been cleared.
// view: 'table' | 'end' | 'settle'.
// started: false during seating, true once the game is on.
// endMode: 'net' -> finals hold each player's signed profit/loss;
//          'chips' -> finals hold what each player left with, in ₪ (chip
//          counts are converted with settings.chipValue when typed).
// cash: cash paid into the night's pot when settling (leaving or at the end),
//       [{ id, from, amount }]: the pot is split among winners, only the rest is transferred.
export const initialState = {
  tableOpen: false,
  settings: DEFAULT_SETTINGS,
  players: [],
  view: 'table',
  started: false,
  finals: {},
  endMode: 'net',
  cash: [],
};

const positiveInt = (n) => Number.isInteger(n) && n > 0;

// Valid settings: a positive initial buy-in and 2-4 distinct positive
// re-buy amounts, ascending. Anything invalid falls back to the defaults.
export function cleanSettings(settings) {
  const initialBuyIn = positiveInt(settings?.initialBuyIn) ? settings.initialBuyIn : DEFAULT_SETTINGS.initialBuyIn;
  const amounts = [...new Set((settings?.rebuyAmounts ?? []).filter(positiveInt))].sort((a, b) => a - b);
  const rebuyAmounts =
    amounts.length >= MIN_REBUY_BUTTONS ? amounts.slice(0, MAX_REBUY_BUTTONS) : DEFAULT_SETTINGS.rebuyAmounts;
  return {
    initialBuyIn,
    rebuyAmounts,
    rounding: cleanRounding(settings?.rounding),
    chipValue: cleanChipValue(settings?.chipValue ?? DEFAULT_CHIP_VALUE),
  };
}

// How a player left mid-game. The same labels and icons as the quick results on
// the end-game screen; the icon replaces the player's initials while they're out.
// A player who left gives up their seat (seat: null) and is shown next to the table.
export const EXITS = {
  lost_all: { icon: '💀', label: 'הפסיד הכל' },
  even: { icon: '🤝', label: 'מאוזן' },
  amount: { icon: '🚪', label: 'יצא עם סכום' },
};

// Players sitting at the table (not those who left mid-game).
export function seatedPlayers(players) {
  return players.filter((p) => !p.out);
}

// The chips a player leaves with for each exit kind (`amount` is typed in).
export function exitChips(player, kind, amount = 0) {
  if (kind === 'lost_all') return 0;
  if (kind === 'even') return totalIn(player);
  return amount;
}

// "לא כאן" on the settlement screen: marked by hand (player.absent true/false),
// otherwise anyone who left mid-game. Cash is handed only to those present.
export function isAbsent(player) {
  return player.absent ?? Boolean(player.out);
}

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

// Game on: the seated players take seats 0..n-1 in their order; those who left have none.
function compactSeats(players) {
  const order = new Map(
    seatedPlayers(players)
      .sort((a, b) => a.seat - b.seat)
      .map((p, i) => [p.id, i])
  );
  return players.map((p) => ({ ...p, seat: order.get(p.id) ?? null }));
}

export function firstFreeSeat(players) {
  const taken = new Set(players.map((p) => p.seat));
  for (let i = 0; i < MAX_PLAYERS; i++) if (!taken.has(i)) return i;
  return null;
}

// A save from the first version (before the start screen): it has players but
// no `tableOpen`. That game was on screen, so it opens straight away.
export function isLegacyGame(saved) {
  return saved?.tableOpen === undefined && Array.isArray(saved?.players) && saved.players.length > 0;
}

// Repairs saved state from older versions (seat gaps, missing fields).
// state: the save exactly as stored (never pre-merged with initialState, or an
// old save's missing fields would look like "false" instead of "missing").
export function normalizeState(state) {
  const saved = Array.isArray(state?.players) ? state.players : [];
  state = { ...state, players: saved };
  // Saves from before `started` existed with players seated were mid-game.
  const started = state.started ?? saved.length > 0;
  const players = started ? compactSeats(saved) : saved;
  const finals = state.finals ?? {};
  // Saves from before endMode existed always held chip counts.
  const endMode = state.endMode ?? (Object.keys(finals).length > 0 ? 'chips' : 'net');
  // Saves from before the start screen: a table with players is still open.
  const tableOpen = state.tableOpen ?? players.length > 0;
  const settings = cleanSettings(state.settings ?? DEFAULT_SETTINGS);
  const cash = Array.isArray(state.cash) ? state.cash : [];
  return { ...initialState, ...state, players, started, finals, endMode, tableOpen, settings, cash };
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
// `color` is the color picked in the add sheet; otherwise the first free one.
function newPlayer(state, name, seat, amount, at = null, color = null) {
  return { id: newId(), name, seat, color: color ?? nextColor(state.players), buyIns: [amount], buyInTimes: [at] };
}

export function gameReducer(state, action) {
  switch (action.type) {
    case 'seatPlayer': {
      // Setup mode: take exactly `seat`, or the first free seat when it's null.
      const { name, amount } = action;
      const seat = action.seat ?? firstFreeSeat(state.players);
      if (seat === null || state.players.some((p) => p.seat === seat)) return state;
      return { ...state, players: [...state.players, newPlayer(state, name, seat, amount, action.at, action.color)] };
    }
    case 'addPlayer': {
      // Game on: position is the seat the new player takes; players from there on shift by one.
      const { name, amount } = action;
      const seated = seatedPlayers(state.players).length;
      if (seated >= MAX_PLAYERS) return state;
      const position = Math.min(Math.max(action.position, 0), seated);
      const shifted = state.players.map((p) => (p.seat >= position ? { ...p, seat: p.seat + 1 } : p));
      return { ...state, players: [...shifted, newPlayer(state, name, position, amount, action.at, action.color)] };
    }
    case 'addBuyIn':
      return {
        ...state,
        players: state.players.map((p) =>
          // A player who is out gets no buy-ins until they're back.
          p.id === action.id && !p.out
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
        cash: state.cash.filter((c) => c.from !== action.id),
        // During setup the seat just becomes free; once started, close the gap.
        players: state.started ? rest.map((p) => (p.seat > gone.seat ? { ...p, seat: p.seat - 1 } : p)) : rest,
      };
    }
    case 'markOut': {
      // The player gives up their seat (the others close the gap) and stays in the
      // results; what they left with becomes their final result.
      const player = state.players.find((p) => p.id === action.id);
      if (!player || player.out || !EXITS[action.kind]) return state;
      const chips = exitChips(player, action.kind, action.chips);
      return {
        ...state,
        players: state.players.map((p) => {
          if (p.id === action.id) return { ...p, out: { kind: action.kind, chips }, seat: null };
          return !p.out && p.seat > player.seat ? { ...p, seat: p.seat - 1 } : p;
        }),
        finals: { ...state.finals, [action.id]: state.endMode === 'chips' ? chips : chips - totalIn(player) },
      };
    }
    case 'markBack': {
      // Back in the game at the end of the table (if there's a free seat): no exit, no result yet.
      const player = state.players.find((p) => p.id === action.id);
      const seated = seatedPlayers(state.players).length;
      if (!player?.out || seated >= MAX_PLAYERS) return state;
      const { [action.id]: _, ...finals } = state.finals;
      return {
        ...state,
        finals,
        players: state.players.map((p) => (p.id === action.id ? { ...p, out: null, seat: seated } : p)),
      };
    }
    case 'addCash': {
      // Cash paid into the pot (when leaving, or at the end). The forms keep it
      // within the player's loss.
      const { from, amount } = action;
      if (!state.players.some((p) => p.id === from) || !positiveInt(amount)) return state;
      return { ...state, cash: [...state.cash, { id: newId(), from, amount }] };
    }
    case 'removeCash':
      return { ...state, cash: state.cash.filter((c) => c.id !== action.id) };
    case 'setAbsent':
      // "לא כאן" / "כאן" on the settlement screen (overrides the automatic mark of an exit).
      return {
        ...state,
        players: state.players.map((p) => (p.id === action.id ? { ...p, absent: Boolean(action.absent) } : p)),
      };
    case 'startGame':
      return { ...state, started: true, players: compactSeats(state.players) };
    case 'moveSeat': {
      // Dropping onto another player swaps the two; onto an empty seat just moves.
      const mover = state.players.find((p) => p.id === action.id);
      if (!mover || mover.out || mover.seat === action.seat) return state;
      return {
        ...state,
        players: state.players.map((p) => {
          if (p.id === mover.id) return { ...p, seat: action.seat };
          if (!p.out && p.seat === action.seat) return { ...p, seat: mover.seat };
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
    case 'setRounding':
      // Changed per night (also on the settlement screen); the saved defaults stay.
      return { ...state, settings: { ...state.settings, rounding: cleanRounding(action.unit) } };
    case 'setAmounts':
      // Mid-game change of the buy-in buttons (an extreme night); the saved defaults stay.
      return {
        ...state,
        settings: cleanSettings({ ...state.settings, initialBuyIn: action.initialBuyIn, rebuyAmounts: action.rebuyAmounts }),
      };
    case 'setChipValue':
      return { ...state, settings: { ...state.settings, chipValue: cleanChipValue(action.value) } };
    case 'setView':
      return { ...state, view: action.view };
    case 'openTable': {
      // Chips that aren't worth 1 ₪ are counted at the end: start in chips mode.
      const settings = cleanSettings(action.settings);
      return { ...initialState, tableOpen: true, settings, endMode: settings.chipValue === DEFAULT_CHIP_VALUE ? 'net' : 'chips' };
    }
    case 'newGame':
      // Back to the start screen; keep the settings for the next table.
      return { ...initialState, settings: state.settings };
    default:
      return state;
  }
}
