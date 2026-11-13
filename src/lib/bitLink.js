// "קישור ביט אישי": every Bit user's personal QR code holds a link like
// https://www.bitpay.co.il/app/me/<ID>; opening it opens Bit straight on
// "transfer to <name>". Stored as exactly that form (same rule as the database
// check profile_bit_link).

export const BIT_LINK_PREFIX = 'https://www.bitpay.co.il/app/me/';
const ID = /^[A-Za-z0-9._~-]{1,200}$/;
const FIND = /(?:https?:\/\/)?(?:www\.)?bitpay\.co\.il\/app\/me\/[^\s"'<>]+/i;

// Pasted text or the text of a QR code → the link, '' for empty, or null when
// it isn't a personal Bit link. Accepts the link inside other text, without
// https:// or www., with a trailing slash, a query string or a #hash (dropped).
export function cleanBitLink(input) {
  const text = String(input ?? '').trim();
  if (text === '') return '';
  const found = text.match(FIND);
  if (!found) return null;
  const url = found[0].replace(/^(?:https?:\/\/)?(?:www\.)?/i, '');
  const id = url.slice('bitpay.co.il/app/me/'.length).split(/[?#]/)[0].replace(/\/+$/, '');
  return ID.test(id) ? BIT_LINK_PREFIX + id : null;
}
