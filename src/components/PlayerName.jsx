import { splitName } from '../lib/names.js';

// A player's name on up to two lines: the first word, then the rest slightly
// smaller. Each line is cut only if it still doesn't fit. className styles the
// whole name (weight, size, alignment); the parent must let it shrink (min-w-0).
export default function PlayerName({ name, className = '' }) {
  const { first, rest } = splitName(name);
  return (
    <span className={`block min-w-0 leading-tight ${className}`}>
      <span className="block truncate">{first}</span>
      {rest && <span className="block truncate text-[0.85em] opacity-90">{rest}</span>}
    </span>
  );
}
