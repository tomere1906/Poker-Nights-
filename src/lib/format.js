// Whole shekels, number then ₪. The number is wrapped in a left-to-right
// isolate so a minus sign stays on the correct side inside RTL text.
export function formatShekel(amount, { signed = false } = {}) {
  const n = Math.round(amount);
  const sign = n < 0 ? '−' : signed && n > 0 ? '+' : '';
  return `\u2066${sign}${Math.abs(n).toLocaleString('he-IL')}\u2069\u00a0₪`;
}

// "20:14" (24-hour), or a dash when the time wasn't recorded.
export function formatTime(ms) {
  if (ms == null) return '—';
  return new Date(ms).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// Keep only digits; returns 0 for empty input.
export function parseAmount(text) {
  const digits = String(text).replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}
