import { useState } from 'react';
import { saveMyBitDetails } from '../lib/auth.js';
import { cleanPhone } from '../lib/phone.js';
import { cleanBitLink } from '../lib/bitLink.js';
import { friendlyError } from '../lib/errors.js';
import ProfileForm from './ProfileForm.jsx';
import BitDetailsFields, { bitDetailsValid } from './BitDetailsFields.jsx';

// Step 2 of the first sign-in (optional): how friends pay you in Bit.
function BitStep({ profile, onDone }) {
  const [phone, setPhone] = useState('');
  const [bitLink, setBitLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const details = { phone: cleanPhone(phone), bitLink: cleanBitLink(bitLink) };
  const filled = Boolean(details.phone || details.bitLink);
  const valid = bitDetailsValid(phone, bitLink);

  async function submit(e) {
    e.preventDefault();
    if (!valid) return;
    if (!filled) return onDone();
    setBusy(true);
    setError(null);
    try {
      await saveMyBitDetails(profile.id, details);
      onDone();
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="text-center">
        <h2 className="text-3xl font-extrabold">איך יעבירו לך כסף? 💸</h2>
        <p className="mt-2 text-slate-400">
          לא חובה. אם תוסיף, מי שיפסיד לך יוכל להעביר לך בביט בלחיצה. אפשר להוסיף גם אחר כך בפרופיל.
        </p>
      </div>
      <BitDetailsFields phone={phone} onPhone={setPhone} bitLink={bitLink} onBitLink={setBitLink} />
      {error && (
        <p className="rounded-xl bg-rose-500/15 px-3 py-2 text-sm text-rose-200 ring-1 ring-rose-400/30">השמירה לא הצליחה: {error}</p>
      )}
      <button
        type="submit"
        disabled={!valid || busy}
        className="w-full rounded-3xl bg-emerald-400 py-4 text-lg font-extrabold text-slate-900 shadow-lg shadow-emerald-400/20 transition active:scale-[0.98] disabled:opacity-40"
      >
        {busy ? 'שומר…' : filled ? 'שמור והמשך' : 'המשך'}
      </button>
      <button type="button" onClick={onDone} className="w-full rounded-2xl py-3 font-bold text-slate-400 active:bg-white/5">
        דלג
      </button>
    </form>
  );
}

// First sign-in: 1. confirm the name (prefilled with the Google first name) and
// pick a color; 2. optionally, a Bit link and/or a phone for Bit. The app moves
// on (onSaved) only after step 2, so it isn't skipped.
export default function NameSetup({ profile, onSaved }) {
  const [saved, setSaved] = useState(null);
  return (
    <div className="flex flex-1 flex-col justify-center py-6">
      {saved ? (
        <BitStep profile={saved} onDone={() => onSaved(saved)} />
      ) : (
        <>
          <h2 className="text-center text-3xl font-extrabold">ברוכים הבאים! 👋</h2>
          <p className="mt-2 mb-8 text-center text-slate-400">איך יקראו לך בשולחן, ובאיזה צבע?</p>
          <ProfileForm profile={profile} submitLabel="המשך" onSaved={setSaved} />
        </>
      )}
    </div>
  );
}
