import { useRef, useState } from 'react';
import { cleanBitLink } from '../lib/bitLink.js';
import { readQrFromFile } from '../lib/qrImage.js';

// "קישור ביט אישי": paste the link, or pick a screenshot of the personal QR
// code in Bit and the link is read from it right here on the phone (the
// picture isn't uploaded anywhere). value: the text in the field; onChange(text).
// disabled: still loading the saved link.
export default function BitLinkField({ value, onChange, disabled = false, label = 'קישור ביט אישי · לא חובה' }) {
  const fileRef = useRef(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState(null);
  const cleaned = cleanBitLink(value);
  const invalid = cleaned === null;

  async function readPicture(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setReading(true);
    setReadError(null);
    try {
      const link = cleanBitLink(await readQrFromFile(file));
      if (link) onChange(link);
      else setReadError('לא מצאנו קישור ביט בתמונה. ודאו שקוד ה־QR של ביט שלם וברור בצילום, או הדביקו את הקישור');
    } catch {
      setReadError('לא הצלחנו לקרוא את התמונה. נסו צילום מסך אחר, או הדביקו את הקישור');
    } finally {
      setReading(false);
    }
  }

  return (
    <div>
      <span className="mb-2 block text-sm text-slate-400">{label}</span>
      <button
        type="button"
        disabled={disabled || reading}
        onClick={() => fileRef.current?.click()}
        className="mb-2 w-full rounded-2xl bg-sky-400/15 py-3 font-bold text-sky-100 transition active:scale-[0.98] disabled:opacity-50"
      >
        {reading ? 'קורא את התמונה…' : '📷 בחר צילום מסך של קוד ה־QR בביט'}
      </button>
      <input ref={fileRef} type="file" accept="image/*" onChange={readPicture} className="hidden" />
      <input
        value={value}
        onChange={(e) => {
          setReadError(null);
          onChange(e.target.value);
        }}
        disabled={disabled}
        type="url"
        inputMode="url"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        dir="ltr"
        placeholder="https://www.bitpay.co.il/app/me/…"
        aria-label="קישור ביט אישי"
        className={`w-full rounded-2xl bg-slate-800 px-4 py-3 text-sm outline-none ring-2 placeholder:text-slate-500 focus:ring-emerald-400 ${
          invalid ? 'ring-rose-400' : 'ring-transparent'
        }`}
      />
      {readError && <p className="mt-1 text-xs text-rose-300">{readError}</p>}
      {invalid && !readError && <p className="mt-1 text-xs text-rose-300">רק קישור אישי של ביט: https://www.bitpay.co.il/app/me/…</p>}
      {cleaned && <p className="mt-1 text-xs text-emerald-300">✓ קישור ביט אישי</p>}
      <p className="mt-1 text-xs text-slate-500">
        איך מוצאים: באפליקציית ביט פותחים את קוד ה־QR האישי שלכם ומצלמים מסך, ואז בוחרים את הצילום כאן. הקישור נקרא מהתמונה בטלפון
        שלכם, והתמונה לא נשלחת לשום מקום. מי שצריך להעביר לכם כסף יפתח איתו את ביט ישר על העברה אליכם.
      </p>
    </div>
  );
}
