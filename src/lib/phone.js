// Phone numbers for Bit: Israeli mobile numbers only, stored as 05XXXXXXXX
// (same rule as the database check profile_phones_phone).

const MOBILE = /^05\d{8}$/;

// Typed input → '05XXXXXXXX', '' for empty, or null if it isn't an Israeli mobile.
// Accepts spaces, dashes, dots, brackets and a +972 / 972 prefix.
export function cleanPhone(input) {
  let digits = String(input ?? '').replace(/[\s\-().]/g, '');
  if (digits === '') return '';
  if (digits.startsWith('+972')) digits = '0' + digits.slice(4);
  else if (digits.startsWith('972')) digits = '0' + digits.slice(3);
  if (digits.startsWith('00')) return null;
  return MOBILE.test(digits) ? digits : null;
}

// '0521234567' → '052-123-4567' (for display).
export function formatPhone(phone) {
  return MOBILE.test(phone ?? '') ? `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}` : phone ?? '';
}
