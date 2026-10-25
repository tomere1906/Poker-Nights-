import { initials } from '../lib/game.js';
import { paletteColor } from '../lib/colors.js';

export default function Avatar({ player, size = 'h-12 w-12 text-lg' }) {
  const color = paletteColor(player.color);
  return (
    <div
      className={`${size} ${color.gradient} ${color.text} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-extrabold shadow-lg ring-2 ring-white/80`}
    >
      {initials(player.name)}
    </div>
  );
}
