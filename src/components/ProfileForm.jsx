import { useEffect, useState } from 'react';
import { PALETTE, suggestedColor } from '../lib/colors.js';
import { MAX_NAME_LENGTH, loadMyBitDetails, saveMyBitDetails, saveProfile } from '../lib/auth.js';
import { cleanPhone, formatPhone } from '../lib/phone.js';
import { cleanBitLink } from '../lib/bitLink.js';
import Avatar from './Avatar.jsx';
import BitLinkField from './BitLinkField.jsx';
import { friendlyError } from '../lib/errors.js';

// Name + color picker for the signed-in user's own profile. withPhone: also the
// optional phone number and personal link for Bit (the profile screen, not the
// first sign-in).
export default function ProfileForm({ profile, submitLabel, onSaved, withPhone = false }) {
  // Until the name is confirmed, suggest just the first name (profiles created
  // before the first-name rule may still hold the full Google name).
  const [name, setName] = useState(() => {
    const current = (profile.display_name ?? '').trim();
    return profile.name_confirmed_at ? current : current.split(/\s+/)[0];
  });
  const [color, setColor] = useState(profile.color ?? suggestedColor(profile.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // null = still loading (or couldn't load): the fields wait, and saving leaves them alone.
  const [phone, setPhone] = useState(null);
  const [bitLink, setBitLink] = useState(null);
  const [saved, setSaved] = useState(null);
  useEffect(() => {
    if (!withPhone) return undefined;
    let active = true;
    loadMyBitDetails(profile.id)
      .then((d) => {
        if (!active) return;
        setPhone(formatPhone(d.phone));
        setBitLink(d.bitLink);
        setSaved(d);
      })
      .catch(() => active && setPhone(null));
    return () => {
      active = false;
    };
  }, [withPhone, profile.id]);

  const trimmed = name.trim();
  const cleanedPhone = phone === null ? null : cleanPhone(phone);
  const phoneValid = phone === null || cleanedPhone !== null;
  const cleanedLink = bitLink === null ? null : cleanBitLink(bitLink);
  const linkValid = bitLink === null || cleanedLink !== null;
  const valid = trimmed.length >= 1 && trimmed.length <= MAX_NAME_LENGTH && phoneValid && linkValid;

  async function submit(e) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      if (withPhone && saved && (cleanedPhone !== saved.phone || cleanedLink !== saved.bitLink)) {
        const next = { phone: cleanedPhone, bitLink: cleanedLink };
        await saveMyBitDetails(profile.id, next);
        setSaved(next);
      }
      onSaved(await saveProfile(profile.id, { displayName: trimmed, color }));
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex justify-center">
        <Avatar player={{ name: trimmed || '?', color }} size="h-24 w-24 text-4xl" />
      </div>

      <label className="block">
        <span className="mb-2 block text-sm text-slate-400">השם שכולם יראו בשולחן</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_NAME_LENGTH}
          placeholder="השם שלך"
          className="w-full rounded-2xl bg-slate-800 px-4 py-3 text-lg outline-none ring-2 ring-transparent placeholder:text-slate-500 focus:ring-emerald-400"
        />
        <span className="mt-1 block text-xs text-slate-500">
          אפשר לשנות בכל זמן. כתובת המייל שלך לא מוצגת לאף אחד.
        </span>
      </label>

      <fieldset>
        <legend className="mb-2 text-sm text-slate-400">הצבע שלך</legend>
        <div className="grid grid-cols-4 gap-3">
          {PALETTE.map((c, i) => (
            <button
              key={c.name}
              type="button"
              onClick={() => setColor(i)}
              aria-label={c.name}
              aria-pressed={color === i}
              className={`flex h-14 items-center justify-center rounded-2xl bg-gradient-to-br text-xl font-extrabold transition active:scale-90 ${c.gradient} ${c.text} ${
                color === i ? 'ring-4 ring-white' : 'opacity-80'
              }`}
            >
              {color === i ? '✓' : ''}
            </button>
          ))}
        </div>
      </fieldset>

      {withPhone && (
        <label className="block">
          <span className="mb-2 block text-sm text-slate-400">מספר טלפון (לביט) · לא חובה</span>
          <input
            value={phone ?? ''}
            onChange={(e) => setPhone(e.target.value)}
            disabled={phone === null}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            placeholder="050-123-4567"
            className={`w-full rounded-2xl bg-slate-800 px-4 py-3 text-end text-lg outline-none ring-2 placeholder:text-slate-500 focus:ring-emerald-400 ${
              phoneValid ? 'ring-transparent' : 'ring-rose-400'
            }`}
          />
          <span className={`mt-1 block text-xs ${phoneValid ? 'text-slate-500' : 'text-rose-300'}`}>
            {phoneValid
              ? 'רק מי שצריך להעביר לך כסף במשחק שנסגר יראה אותו, כדי להעביר בביט. לא מופיע בתמונה, ביומן או בהזמנה. למחיקה: מחקו את המספר ושמרו.'
              : 'מספר נייד ישראלי, למשל 050-123-4567'}
          </span>
        </label>
      )}

      {withPhone && (
        <BitLinkField value={bitLink ?? ''} onChange={setBitLink} disabled={bitLink === null} />
      )}

      {error && (
        <p className="rounded-xl bg-rose-500/15 px-3 py-2 text-sm text-rose-200 ring-1 ring-rose-400/30">
          השמירה לא הצליחה: {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!valid || busy}
        className="w-full rounded-3xl bg-emerald-400 py-4 text-lg font-extrabold text-slate-900 shadow-lg shadow-emerald-400/20 transition active:scale-[0.98] disabled:opacity-40"
      >
        {busy ? 'שומר…' : submitLabel}
      </button>
    </form>
  );
}
