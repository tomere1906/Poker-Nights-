import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import BottomSheet from './BottomSheet.jsx';

export function inviteMessage(link) {
  return `בוא לשחק פוקר! 🃏 הצטרף לשולחן: ${link}`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

// "הזמן חברים": share sheet (WhatsApp etc.), wa.me fallback, copy, and a QR
// for people sitting at the table.
export default function InviteSheet({ link, onClose }) {
  const [qr, setQr] = useState(null);
  const [copied, setCopied] = useState(false);
  const message = inviteMessage(link);
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(message)}`;

  useEffect(() => {
    QRCode.toString(link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b1120', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [link]);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ text: message });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return; // user closed the share sheet
      }
    }
    window.open(whatsapp, '_blank', 'noopener');
  }

  return (
    <BottomSheet onClose={onClose} title={<h2 className="mb-1 text-xl font-bold">הזמן חברים 💌</h2>}>
      <p className="mb-4 text-sm text-slate-400">מי שפותח את הקישור מתחבר עם Google ומצטרף לשולחן</p>

      <button
        type="button"
        onClick={share}
        className="mb-2 w-full rounded-2xl bg-emerald-400 py-4 text-lg font-extrabold text-slate-900 shadow-lg shadow-emerald-400/20 active:scale-[0.98]"
      >
        שתף בוואטסאפ ובעוד 📤
      </button>
      <div className="mb-5 flex gap-2">
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 rounded-2xl bg-slate-800 py-3 text-center font-bold text-slate-200 active:scale-[0.98]"
        >
          פתח וואטסאפ
        </a>
        <button
          type="button"
          onClick={async () => {
            if (await copyText(link)) {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }
          }}
          className="flex-1 rounded-2xl bg-slate-800 py-3 font-bold text-slate-200 active:scale-[0.98]"
        >
          {copied ? 'הועתק ✓' : 'העתק קישור'}
        </button>
      </div>

      <p className="mb-2 text-center text-sm text-slate-400">יושבים לידך? שיסרקו:</p>
      <div className="mx-auto w-56 rounded-3xl bg-white p-3 shadow-xl">
        {qr ? (
          <div aria-label="קוד QR להצטרפות" className="[&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
        ) : (
          <div className="aspect-square animate-pulse rounded-2xl bg-slate-200" />
        )}
      </div>
    </BottomSheet>
  );
}
