import { cleanPhone } from '../lib/phone.js';
import { cleanBitLink } from '../lib/bitLink.js';
import BitLinkField from './BitLinkField.jsx';

// The two optional ways to get paid in Bit: the personal Bit link (first: it
// opens Bit straight on a transfer to you) and the phone number. Used on the
// profile, in the first sign-in and in the card that asks winners.
// phone / bitLink: the typed text (null = still loading: the field waits).
export default function BitDetailsFields({ phone, onPhone, bitLink, onBitLink }) {
  const phoneValid = phone === null || cleanPhone(phone) !== null;
  return (
    <div className="space-y-5">
      <BitLinkField
        value={bitLink ?? ''}
        onChange={onBitLink}
        disabled={bitLink === null}
        label="קישור ביט אישי · לא חובה (הכי נוח: נפתח ישר על העברה אליך)"
      />
      <label className="block">
        <span className="mb-2 block text-sm text-slate-400">מספר טלפון (לביט) · לא חובה</span>
        <input
          value={phone ?? ''}
          onChange={(e) => onPhone(e.target.value)}
          disabled={phone === null}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          placeholder="050-123-4567"
          aria-label="מספר טלפון לביט"
          className={`w-full rounded-2xl bg-slate-800 px-4 py-3 text-end text-lg outline-none ring-2 placeholder:text-slate-500 focus:ring-emerald-400 ${
            phoneValid ? 'ring-transparent' : 'ring-rose-400'
          }`}
        />
        <span className={`mt-1 block text-xs ${phoneValid ? 'text-slate-500' : 'text-rose-300'}`}>
          {phoneValid
            ? 'רק מי שצריך להעביר לך כסף במשחק שנסגר יראה אותם, כדי להעביר בביט. לא מופיעים בתמונה, ביומן או בהזמנה. למחיקה: מחקו ושמרו.'
            : 'מספר נייד ישראלי, למשל 050-123-4567'}
        </span>
      </label>
    </div>
  );
}

// Both fields are valid (empty is fine).
export function bitDetailsValid(phone, bitLink) {
  return (phone === null || cleanPhone(phone) !== null) && (bitLink === null || cleanBitLink(bitLink) !== null);
}
