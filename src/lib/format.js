// Whole shekels, number then ₪. The number is wrapped in a left-to-right
// isolate so a minus sign stays on the correct side inside RTL text.
export function formatShekel(amount, { signed = false } = {}) {
  const n = Math.round(amount);
  const sign = n < 0 ? '−' : signed && n > 0 ? '+' : '';
  return `\u2066${sign}${Math.abs(n).toLocaleString('he-IL')}\u2069\u00a0₪`;
}

// Keep only digits; returns 0 for empty input.
export function parseAmount(text) {
  const digits = String(text).replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}
