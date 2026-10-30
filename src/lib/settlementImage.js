// "שתף כתמונה": draws the settlement card on a canvas (same layout and colors
// as the card in the app) and shares it as a PNG. Drawn directly instead of
// capturing the DOM: DOM-to-image libraries are unreliable on iPhone Safari
// (web fonts, emoji), while canvas text handles Hebrew RTL and Rubik natively.
import { formatShekel } from './format.js';
import { initials } from './game.js';
import { paletteColor } from './colors.js';
import { splitName } from './names.js';
import { cashNote } from './settlement.js';

export const CARD_WIDTH = 390; // CSS px, like a phone screen
const PAD = 16;
const ROW_H = 64;
const ROW_NOTE_H = 92; // a row with a "💵 מזומן" label under the amount
const ROW_GAP = 8;
const PILL_H = 30;
const PILL_TWO_LINES_H = 46;
const PILL_GAP = 8;
const PILL_PAD = 24;
const FONT = 'Rubik, "Segoe UI", Arial, sans-serif';

const COLORS = {
  page: '#0b1120',
  card: '#1e293b',
  text: '#f1f5f9',
  muted: '#94a3b8',
  amount: '#fcd34d',
  note: { bg: '#34d399', fg: '#0f172a' },
  win: { bg: 'rgba(52, 211, 153, 0.15)', fg: '#6ee7b7' },
  loss: { bg: 'rgba(251, 113, 133, 0.15)', fg: '#fda4af' },
  even: { bg: 'rgba(255, 255, 255, 0.1)', fg: '#cbd5e1' },
};

const NAME_FONT = `700 16px ${FONT}`;
const NAME_REST_FONT = `600 13px ${FONT}`;
const PILL_FONT = `700 14px ${FONT}`;
const PILL_REST_FONT = `600 12px ${FONT}`;
const SHEEP_FONT = `400 17px ${FONT}`;

const signed = (n) => formatShekel(n, { signed: true });

// Fits text into maxWidth, cutting with "…". measure(text) -> width.
export function ellipsize(text, maxWidth, measure) {
  if (measure(text) <= maxWidth) return text;
  const chars = [...text];
  while (chars.length > 1 && measure(chars.join('') + '…') > maxWidth) chars.pop();
  return chars.join('').trimEnd() + '…';
}

// Wraps pills into lines (right to left). widthOf(item) -> its width.
// Returns [{ item, width }][] per line.
export function layoutPills(items, maxWidth, widthOf) {
  const lines = [[]];
  let used = 0;
  for (const item of items) {
    const width = Math.ceil(widthOf(item));
    const line = lines[lines.length - 1];
    if (line.length > 0 && used + PILL_GAP + width > maxWidth) {
      lines.push([{ item, width }]);
      used = width;
    } else {
      used += (line.length ? PILL_GAP : 0) + width;
      line.push({ item, width });
    }
  }
  return lines.filter((l) => l.length > 0);
}

// "poker-nights-2026-10-25.png"
export function imageFileName(ms) {
  const d = new Date(ms);
  const two = (n) => String(n).padStart(2, '0');
  return `poker-nights-${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}.png`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

// Mixes a #rrggbb color with white (amount 0..1), like the lighter end of the app's avatar gradients.
function lighten(hex, amount = 0.35) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

function avatar(ctx, player, cx, cy, r) {
  const color = paletteColor(player?.color);
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, lighten(color.hex));
  g.addColorStop(1, color.hex);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.stroke();
  ctx.fillStyle = color.text === 'text-white' ? '#ffffff' : '#0f172a';
  ctx.font = `800 ${Math.round(r * 0.8)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials(player?.name ?? '?'), cx, cy + 1);
}

// A name on up to two lines (first word, then the rest smaller), centered on
// y, each line cut only if it still doesn't fit. align: 'right' | 'left'.
function drawName(ctx, name, x, y, maxWidth, align, fonts = [NAME_FONT, NAME_REST_FONT]) {
  const { first, rest } = splitName(name);
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  const fit = (text, font) => {
    ctx.font = font;
    return ellipsize(text, maxWidth, (t) => ctx.measureText(t).width);
  };
  if (!rest) {
    ctx.fillText(fit(first, fonts[0]), x, y);
    return;
  }
  ctx.fillText(fit(first, fonts[0]), x, y - 9);
  ctx.fillText(fit(rest, fonts[1]), x, y + 9);
}

// Width of a name block: the wider of its two lines.
function nameWidth(ctx, name, fonts) {
  const { first, rest } = splitName(name);
  ctx.font = fonts[0];
  const w1 = ctx.measureText(first).width;
  if (!rest) return w1;
  ctx.font = fonts[1];
  return Math.max(w1, ctx.measureText(rest).width);
}

const rowHeight = (t) => (cashNote(t) ? ROW_NOTE_H : ROW_H);

// data: { title, subtitle, transfers: [{ from, to, amount, cash }], nets: [{ id, net }],
//         sheep: Set of ids with "🐑 כבש הערב", players: Map(id -> player) }
export function drawSettlement(data, scale = 3) {
  const measure = document.createElement('canvas').getContext('2d');
  const nameOf = (id) => data.players.get(id)?.name ?? 'שחקן';
  const sorted = [...data.nets].sort((a, b) => b.net - a.net);
  const sheep = data.sheep ?? new Set();
  const pillMax = CARD_WIDTH - 2 * PAD;
  measure.font = SHEEP_FONT;
  const sheepW = measure.measureText('🐑').width + 6;
  const pillWidth = (e) => {
    measure.font = PILL_FONT;
    const amount = measure.measureText(signed(e.net)).width;
    const extra = sheep.has(e.id) ? sheepW : 0;
    return Math.min(pillMax, PILL_PAD + nameWidth(measure, nameOf(e.id), [PILL_FONT, PILL_REST_FONT]) + 6 + amount + extra);
  };
  const pillLines = layoutPills(sorted, pillMax, pillWidth);
  const pillLineH = (line) => (line.some((p) => splitName(nameOf(p.item.id)).rest) ? PILL_TWO_LINES_H : PILL_H);

  const headerH = 96;
  const listH = data.transfers.length
    ? data.transfers.reduce((sum, t) => sum + rowHeight(t) + ROW_GAP, 0) - ROW_GAP
    : 64;
  const resultsH = 34 + pillLines.reduce((sum, l) => sum + pillLineH(l) + PILL_GAP, 0) - PILL_GAP;
  const footerH = 52;
  const height = headerH + listH + 24 + resultsH + footerH;

  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.direction = 'rtl';

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, '#16213a');
  bg.addColorStop(1, COLORS.page);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_WIDTH, height);

  // Header
  const right = CARD_WIDTH - PAD;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COLORS.text;
  ctx.font = `800 26px ${FONT}`;
  ctx.fillText('מי מעביר למי 💸', right, 46);
  ctx.fillStyle = COLORS.muted;
  ctx.font = `400 15px ${FONT}`;
  ctx.fillText(ellipsize(data.subtitle, CARD_WIDTH - 2 * PAD, (t) => ctx.measureText(t).width), right, 72);

  // Rows: payer → receiver, the amount, and a small cash note when there is one.
  let y = headerH;
  if (data.transfers.length === 0) {
    ctx.fillStyle = 'rgba(30, 41, 59, 0.7)';
    roundRect(ctx, PAD, y, CARD_WIDTH - 2 * PAD, 64, 24);
    ctx.fillStyle = COLORS.text;
    ctx.font = `500 18px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('כולם יצאו מאוזנים 🤝', CARD_WIDTH / 2, y + 32);
  }
  const half = (CARD_WIDTH - 2 * PAD) / 2;
  for (const t of data.transfers) {
    const h = rowHeight(t);
    const note = cashNote(t);
    ctx.fillStyle = 'rgba(30, 41, 59, 0.7)';
    roundRect(ctx, PAD, y, CARD_WIDTH - 2 * PAD, h, 24);
    const mid = y + h / 2;
    const r = 18;
    // From (right side): avatar, then the name to its left.
    avatar(ctx, data.players.get(t.from), right - 12 - r, mid, r);
    // To (left side): avatar at the far left, the name to its right.
    avatar(ctx, data.players.get(t.to), PAD + 12 + r, mid, r);

    ctx.fillStyle = COLORS.text;
    const nameMax = half - 2 * r - 24 - 48;
    drawName(ctx, nameOf(t.from), right - 12 - 2 * r - 8, mid, nameMax, 'right');
    drawName(ctx, nameOf(t.to), PAD + 12 + 2 * r + 8, mid, nameMax, 'left');

    // Middle: amount, arrow, and the cash label under them.
    const top = note ? mid - 22 : mid - 8;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.amount;
    ctx.font = `800 18px ${FONT}`;
    ctx.fillText(formatShekel(t.amount), CARD_WIDTH / 2, top);
    ctx.fillStyle = COLORS.muted;
    ctx.font = `400 20px ${FONT}`;
    ctx.fillText('←', CARD_WIDTH / 2, top + 19);
    if (note) {
      ctx.font = `800 14px ${FONT}`;
      const w = ctx.measureText(note).width + 24;
      ctx.fillStyle = COLORS.note.bg;
      roundRect(ctx, CARD_WIDTH / 2 - w / 2, top + 31, w, 26, 13);
      ctx.fillStyle = COLORS.note.fg;
      ctx.fillText(note, CARD_WIDTH / 2, top + 44.5);
    }
    y += h + ROW_GAP;
  }
  y = headerH + listH + 24;

  // Results
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COLORS.muted;
  ctx.font = `500 14px ${FONT}`;
  ctx.fillText('תוצאות הערב', right, y + 14);
  y += 34;
  for (const line of pillLines) {
    const lineH = pillLineH(line);
    let x = right;
    for (const { item: e, width } of line) {
      const tone = e.net > 0 ? COLORS.win : e.net < 0 ? COLORS.loss : COLORS.even;
      ctx.fillStyle = tone.bg;
      roundRect(ctx, x - width, y, width, lineH, Math.min(lineH / 2, 16));
      ctx.fillStyle = tone.fg;
      // Name on the right (up to two lines), the amount on the left.
      ctx.font = PILL_FONT;
      const amount = signed(e.net);
      const amountW = ctx.measureText(amount).width;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(amount, x - width + PILL_PAD / 2, y + lineH / 2 + 1);
      const extra = sheep.has(e.id) ? sheepW : 0;
      if (extra) {
        ctx.font = SHEEP_FONT;
        ctx.fillText('🐑', x - width + PILL_PAD / 2 + amountW + 4, y + lineH / 2 + 1);
        ctx.fillStyle = tone.fg;
      }
      drawName(ctx, nameOf(e.id), x - PILL_PAD / 2, y + lineH / 2 + 1, width - PILL_PAD - amountW - 6 - extra, 'right', [PILL_FONT, PILL_REST_FONT]);
      x -= width + PILL_GAP;
    }
    y += lineH + PILL_GAP;
  }

  // Footer
  ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
  ctx.font = `500 12px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('🃏 Poker Nights · הקלפים עליכם, החשבון עלינו', CARD_WIDTH / 2, height - 20);

  return canvas;
}

// The PNG, after the app font has loaded (otherwise the canvas would use a fallback font).
// subtitle: the line under the title, as on the screen (table name · date · rounding).
export async function renderSettlementPng({ subtitle, date, transfers, nets, sheep, players }) {
  try {
    await Promise.all([document.fonts.load(`800 26px Rubik`), document.fonts.load(`700 16px Rubik`), document.fonts.load(`400 15px Rubik`)]);
  } catch {
    // Offline or blocked: draw with the fallback font.
  }
  const canvas = drawSettlement({ title: 'מי מעביר למי', subtitle, transfers, nets, sheep, players });
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('לא הצלחנו ליצור את התמונה');
  return new File([blob], imageFileName(date), { type: 'image/png' });
}

// Opens the share sheet (iPhone: WhatsApp etc.). Where sharing files isn't
// available (desktop browsers, plain http), downloads the image instead.
// Returns 'shared' | 'cancelled' | 'downloaded'.
export async function shareOrDownload(file) {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
      // e.g. NotAllowedError: fall back to downloading.
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
