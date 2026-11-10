// Long names wrap to two lines instead of being cut: the first word on the
// first line, the rest on the second ("Tomer Erlichman" → "Tomer" / "Erlichman").
// Single-word names stay on one line. Pure: used by the screens and the image.
export function splitName(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { first: words[0] ?? '', rest: null };
  return { first: words[0], rest: words.slice(1).join(' ') };
}
