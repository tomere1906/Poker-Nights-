import { useState } from 'react';
import { cleanPhone } from '../lib/phone.js';
import { cleanBitLink } from '../lib/bitLink.js';
import { friendlyError } from '../lib/errors.js';
import BitLinkField from './BitLinkField.jsx';

// On a closed table, for a winner who should get at least one transfer (not
// only cash) and has neither a phone number nor a Bit link saved: save one (or
// both) right here, so the payers get "שלם בביט" / "העתק טלפון לביט".
// onSave({ phone, bitLink }) saves them ('' = none); onLater hides the card for this table.
export default function PhonePrompt({ onSave, onLater }) {
  const [phone, setPhone] = useState('');
  const [bitLink, setBitLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const cleanedPhone = cleanPhone(phone);
  const cleanedLink = cleanBitLink(bitLink);
  const valid = cleanedPhone !== null && cleanedLink !== null && Boolean(cleanedPhone || cleanedLink);
  const showInvalid = phone.trim() !== '' && cleanedPhone === null;

  async function submit(e) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({ phone: cleanedPhone, bitLink: cleanedLink });
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="animate-pop-in mb-4 space-y-3 rounded-3xl bg-sky-400/10 p-4 ring-1 ring-sky-300/30">
      <div>
        <p className="font-bold text-sky-100">הוסף קישור ביט או מספר טלפון כדי שיוכלו להעביר לך בביט 📱</p>
        <p className="mt-1 text-xs text-slate-400">
          רק מי שצריך להעביר לך כסף יראה אותם. לא מופיעים בתמונה, ביומן או בהזמנה. אפשר לשנות או למחוק בפרופיל.
        </p>
      </div>
      <BitLinkField value={bitLink} onChange={setBitLink} label="קישור ביט אישי (הכי נוח: נפתח ישר על העברה אליך)" />
      <label className="block">
        <span className="mb-2 block text-sm text-slate-400">או מספר טלפון</span>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          placeholder="050-123-4567"
          aria-label="מספר טלפון לביט"
          className={`w-full rounded-2xl bg-slate-950/60 px-4 py-3 text-end text-lg outline-none ring-2 placeholder:text-slate-500 focus:ring-emerald-400 ${
            showInvalid ? 'ring-rose-400' : 'ring-transparent'
          }`}
        />
        {showInvalid && <span className="mt-1 block text-xs text-rose-300">מספר נייד ישראלי, למשל 050-123-4567</span>}
      </label>
      {error && <p className="text-xs text-rose-300">השמירה לא הצליחה: {error}</p>}
      <button
        type="submit"
        disabled={!valid || busy}
        className="w-full rounded-2xl bg-emerald-400 py-3 font-extrabold text-slate-900 transition active:scale-95 disabled:opacity-40"
      >
        {busy ? 'שומר…' : 'שמור'}
      </button>
      <button type="button" onClick={onLater} className="w-full rounded-xl py-2 text-sm font-bold text-slate-400 active:bg-white/5">
        לא עכשיו
      </button>
    </form>
  );
}
