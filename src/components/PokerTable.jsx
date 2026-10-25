import { useRef, useState } from 'react';
import { MAX_PLAYERS, potTotal } from '../lib/game.js';
import { formatShekel } from '../lib/format.js';
import Avatar from './Avatar.jsx';
import Seat from './Seat.jsx';
import { ChipIcon } from './Icons.jsx';

// Players are spread evenly on an ellipse around the table, clockwise from the top.
// `slot` may be fractional: n + 0.5 sits halfway between two players.
function position(slot, count) {
  const angle = (slot / count) * 2 * Math.PI;
  return { left: `${50 + 41 * Math.sin(angle)}%`, top: `${50 - 41 * Math.cos(angle)}%` };
}

const DRAG_THRESHOLD = 8;

function countLabel(players) {
  const out = players.filter((p) => p.out).length;
  const playing = players.length - out;
  if (out === 0) return playing === 1 ? 'שחקן אחד' : `${playing} שחקנים`;
  return `${playing} משחקים · ${out} יצאו`;
}

function seatUnder(x, y) {
  const el = document.elementFromPoint(x, y)?.closest('[data-seat]');
  return el ? Number(el.dataset.seat) : null;
}

// name: the online table's name (optional), shown above the pot.
export default function PokerTable({ players, started, name, placing, onPlace, onEmptySeat, onPlayerTap, onMove }) {
  const pointer = useRef(null);
  const [drag, setDrag] = useState(null); // { id, x, y, over }

  const count = players.length;
  // Setup: fixed seats. Game on: players spread evenly.
  const slots = started ? count : MAX_PLAYERS;
  const taken = new Set(players.map((p) => p.seat));
  // Empty seats get a "+" only for people who may seat players (onEmptySeat given).
  const emptySeats =
    started || !onEmptySeat ? [] : Array.from({ length: MAX_PLAYERS }, (_, i) => i).filter((i) => !taken.has(i));
  const dragged = drag && players.find((p) => p.id === drag.id);

  function dragHandlers(player) {
    return {
      onPointerDown(e) {
        e.currentTarget.setPointerCapture(e.pointerId);
        pointer.current = { id: player.id, x: e.clientX, y: e.clientY, moving: false };
      },
      onPointerMove(e) {
        const p = pointer.current;
        if (!p || !onMove) return; // read-only: taps only, no dragging
        if (!p.moving && Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD) return;
        p.moving = true;
        setDrag({ id: p.id, x: e.clientX, y: e.clientY, over: seatUnder(e.clientX, e.clientY) });
      },
      onPointerUp(e) {
        const p = pointer.current;
        pointer.current = null;
        setDrag(null);
        if (!p) return;
        if (!p.moving) return onPlayerTap(player);
        const target = seatUnder(e.clientX, e.clientY);
        if (target !== null && target !== player.seat) onMove(player.id, target);
      },
      onPointerCancel() {
        pointer.current = null;
        setDrag(null);
      },
    };
  }

  return (
    <div className="relative mx-auto aspect-[3/4.3] w-full max-w-[420px]">
      {/* Wood rim */}
      <div className="absolute inset-x-[15%] inset-y-[11%] rounded-[50%] bg-gradient-to-br from-amber-700 via-amber-900 to-amber-950 p-3 shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
        {/* Felt */}
        <div className="flex h-full w-full flex-col items-center justify-center rounded-[50%] bg-[radial-gradient(ellipse_at_center,#22a35a_0%,#15803d_55%,#0f5e2e_100%)] shadow-[inset_0_0_30px_rgba(0,0,0,0.55)] ring-2 ring-amber-200/20">
          <div className="flex -space-x-2 space-x-reverse">
            <ChipIcon className="h-7 w-7" color="#e11d48" />
            <ChipIcon className="h-7 w-7" color="#2563eb" />
            <ChipIcon className="h-7 w-7" color="#111827" />
          </div>
          {placing ? (
            <p className="mt-3 px-6 text-center text-sm font-bold leading-snug text-amber-200">
              איפה להושיב?
              <br />
              הקש על אחד הפלוסים
            </p>
          ) : count === 0 ? (
            <p className="mt-3 px-6 text-center text-sm font-medium leading-snug text-white/80">
              הקש על + ליד כיסא
              <br />
              כדי להושיב שחקן
            </p>
          ) : (
            <>
              {name && (
                <p className="mt-2 max-w-[80%] truncate text-center text-sm font-extrabold text-amber-100 drop-shadow">{name}</p>
              )}
              <p className={`${name ? 'mt-0.5' : 'mt-2'} text-xs font-medium text-white/70`}>בקופה</p>
              <p className="text-2xl font-extrabold text-white drop-shadow">{formatShekel(potTotal(players))}</p>
              <p className="text-xs text-white/60">{countLabel(players)}</p>
            </>
          )}
        </div>
      </div>

      {emptySeats.map((i) => (
        <button
          key={`empty-${i}`}
          type="button"
          data-seat={i}
          onClick={() => onEmptySeat(i)}
          aria-label={`כיסא פנוי ${i + 1}`}
          style={position(i, slots)}
          className={`absolute flex h-[76px] w-[72px] -translate-x-1/2 -translate-y-1/2 items-center justify-center transition-[scale,filter] ${
            drag?.over === i ? 'scale-110 drop-shadow-[0_0_12px_rgba(252,211,77,0.9)]' : ''
          }`}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-white/30 bg-slate-900/60 text-2xl font-light text-white/60 shadow-inner transition active:scale-90">
            +
          </span>
        </button>
      ))}

      {players.map((player) => (
        <Seat
          key={player.id}
          player={player}
          style={position(player.seat, slots)}
          dimmed={placing || drag?.id === player.id}
          highlighted={drag && drag.over === player.seat && drag.id !== player.id}
          dragHandlers={placing ? undefined : dragHandlers(player)}
        />
      ))}

      {/* Insert slots between neighbours: slot i puts the new player at seat i + 1. */}
      {placing &&
        players.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPlace(i + 1)}
            aria-label="הושב כאן"
            style={position(i + 0.5, count)}
            className="animate-pop-in absolute z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-amber-300 text-3xl font-bold leading-none text-slate-900 shadow-[0_0_20px_rgba(252,211,77,0.7)] active:scale-90"
          >
            +
          </button>
        ))}

      {dragged && (
        <div
          className="pointer-events-none fixed z-30 -translate-x-1/2 -translate-y-1/2 scale-125"
          style={{ left: drag.x, top: drag.y }}
        >
          <Avatar player={dragged} />
        </div>
      )}
    </div>
  );
}
