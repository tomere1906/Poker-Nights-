import { totalIn } from '../lib/game.js';
import { formatShekel } from '../lib/format.js';
import Avatar from './Avatar.jsx';

export default function Seat({ player, style, dimmed, highlighted, dragHandlers }) {
  return (
    <div
      role="button"
      data-seat={player.seat}
      style={{ ...style, touchAction: 'none' }}
      {...dragHandlers}
      className={`absolute flex w-[76px] -translate-x-1/2 -translate-y-1/2 cursor-grab select-none flex-col items-center transition-[scale,opacity,filter] ${
        highlighted ? 'scale-110 drop-shadow-[0_0_12px_rgba(252,211,77,0.9)]' : ''
      } ${dimmed ? 'opacity-30' : player.out ? 'opacity-50 grayscale-[40%]' : ''}`}
    >
      <Avatar player={player} />
      <span className="mt-1 max-w-full truncate rounded-full bg-slate-950/70 px-2 text-xs font-bold leading-5 text-white">
        {player.name}
      </span>
      <span className="mt-0.5 rounded-full bg-amber-300 px-2 text-[11px] font-extrabold leading-4 text-slate-900 shadow">
        {formatShekel(totalIn(player))}
      </span>
    </div>
  );
}
