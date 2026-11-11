import { useState } from 'react';
import { cleanPhone } from '../lib/phone.js';

// On a closed table, for a winner who should get at least one transfer (not
// only cash) and has no phone number saved: save one right here, so the payers
// get "העתק טלפון לביט". onSave(phone) saves it ('05XXXXXXXX'); onLater hides
// the card for this table.
export default function PhonePrompt({ onSave, onLater }) {
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const cleaned = cleanPhone(phone);
  const valid = Boolean(cleaned);
  const showInvalid = phone.trim() !== '' && cleaned === null;

  async function submit(e) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(cleaned);
    } catch (err) {
      setError(err.message ?? String(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="animate-pop-in mb-4 rounded-3xl bg-sky-400/10 p-4 ring-1 ring-sky-300/30">
      <p className="font-bold text-sky-100">הוסף מספר טלפון כדי שיוכלו להעביר לך בביט 📱</p>
      <p className="mb-3 mt-1 text-xs text-slate-400">
        רק מי שצריך להעביר לך כסף יראה אותו. לא מופיע בתמונה, ביומן או בהזמנה. אפשר לשנות או למחוק בפרופיל.
      </p>
      <div className="flex gap-2">
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          placeholder="050-123-4567"
          aria-label="מספר טלפון לביט"
          className={`min-w-0 flex-1 rounded-2xl bg-slate-950/60 px-4 py-3 text-end text-lg outline-none ring-2 placeholder:text-slate-500 focus:ring-emerald-400 ${
            showInvalid ? 'ring-rose-400' : 'ring-transparent'
          }`}
        />
        <button
          type="submit"
          disabled={!valid || busy}
          className="rounded-2xl bg-emerald-400 px-5 font-extrabold text-slate-900 transition active:scale-95 disabled:opacity-40"
        >
          {busy ? '…' : 'שמור'}
        </button>
      </div>
      {showInvalid && <p className="mt-1 text-xs text-rose-300">מספר נייד ישראלי, למשל 050-123-4567</p>}
      {error && <p className="mt-1 text-xs text-rose-300">השמירה לא הצליחה: {error}</p>}
      <button type="button" onClick={onLater} className="mt-2 w-full rounded-xl py-2 text-sm font-bold text-slate-400 active:bg-white/5">
        לא עכשיו
      </button>
    </form>
  );
}
