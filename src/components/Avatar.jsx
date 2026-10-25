import { initials } from '../lib/game.js';
import { paletteColor, suggestedColor } from '../lib/colors.js';

// The one avatar used everywhere (table seats, sheets, profile, start screen):
// a circle filled with the player's color and up to 2 initials.
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

// Avatar props for a signed-in user's profile (suggested color until they pick one).
export function profileAvatar(profile) {
  return { name: profile.display_name || '?', color: profile.color ?? suggestedColor(profile.id) };
}
