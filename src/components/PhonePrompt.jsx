import { useState } from 'react';
import { cleanPhone } from '../lib/phone.js';
import { cleanBitLink } from '../lib/bitLink.js';
import { friendlyError } from '../lib/errors.js';
import BitDetailsFields, { bitDetailsValid } from './BitDetailsFields.jsx';

// On a closed table, for a winner who should get at least one transfer (not
// only cash) and has neither a phone number nor a Bit link saved: save one (or
// both) right here, so the payers get "שלם בביט" / "העתק טלפון לביט".
// onSave({ phone, bitLink }) saves them ('' = none); onLater hides the card for this table.
export default function PhonePrompt({ onSave, onLater }) {
  const [phone, setPhone] = useState('');
  const [bitLink, setBitLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const details = { phone: cleanPhone(phone), bitLink: cleanBitLink(bitLink) };
  const valid = bitDetailsValid(phone, bitLink) && Boolean(details.phone || details.bitLink);

  async function submit(e) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(details);
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="animate-pop-in mb-4 space-y-4 rounded-3xl bg-sky-400/10 p-4 ring-1 ring-sky-300/30">
      <p className="font-bold text-sky-100">הוסף קישור ביט או מספר טלפון כדי שיוכלו להעביר לך בביט 📱</p>
      <BitDetailsFields phone={phone} onPhone={setPhone} bitLink={bitLink} onBitLink={setBitLink} />
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
