// A player's result, told three ways: "יש לי 600 צ׳יפים", "יש לי 300 ₪",
// "אני במינוס 100". Everything is kept as what they leave with, in ₪.
import { DEFAULT_CHIP_VALUE, chipsToShekels, shekelsToChips } from './game.js';
import { formatCount } from './format.js';

export const RESULT_UNITS = [
  { id: 'chips', label: 'צ׳יפים' },
  { id: 'shekels', label: '₪' },
  { id: 'net', label: 'רווח-הפסד' },
];

// What the player leaves with (₪) from what was typed, or null if not complete.
// net: totalIn ± amount; a net amount other than 0 needs its sign (+1 / −1) first.
// May be negative (a loss bigger than the buy-ins): the caller refuses that.
export function resultShekels(amount, sign, unit, totalIn, chipValue = DEFAULT_CHIP_VALUE) {
  if (amount === null) return null;
  if (unit === 'chips') return chipsToShekels(amount, chipValue);
  if (unit === 'shekels') return amount;
  if (amount === 0) return totalIn;
  return sign ? totalIn + sign * amount : null;
}

// The other way: ₪ shown in a unit, as { amount, sign }.
export function resultShown(shekels, unit, totalIn, chipValue = DEFAULT_CHIP_VALUE) {
  if (shekels === null) return { amount: null, sign: null };
  if (unit === 'chips') return { amount: shekelsToChips(shekels, chipValue), sign: null };
  if (unit === 'shekels') return { amount: shekels, sign: null };
  const net = shekels - totalIn;
  return { amount: Math.abs(net), sign: net > 0 ? 1 : net < 0 ? -1 : null };
}

// "פלוס 50" / "מינוס 100" / "מאוזן".
export function netText(net) {
  if (net > 0) return `פלוס ${formatCount(net)}`;
  if (net < 0) return `מינוס ${formatCount(-net)}`;
  return 'מאוזן';
}
