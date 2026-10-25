import { useEffect, useRef, useState } from 'react';
import { joinTable } from '../lib/onlineTable.js';
import { clearPendingInvite } from '../lib/invite.js';
import AccountBar from './AccountBar.jsx';
import { CardsIcon } from './Icons.jsx';

// Shown while there's a pending invite. Signed out: ask to sign in with Google.
// Signed in: join the table (RLS checks the code) and open it.
export default function JoinScreen({ invite, auth, onJoined, onCancel }) {
  const [error, setError] = useState(null);
  const started = useRef(false);
  const signedIn = Boolean(auth.session);

  useEffect(() => {
    if (!signedIn || started.current) return;
    started.current = true;
    joinTable(invite.tableId, invite.code)
      .then(() => {
        clearPendingInvite();
        onJoined(invite.tableId);
      })
      .catch((e) => {
        clearPendingInvite();
        setError(e.code === '42501' ? 'הקישור לא תקף, או שהמשחק בשולחן הזה כבר נגמר.' : e.message);
      });
  }, [signedIn, invite, onJoined]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <CardsIcon className="h-24 w-24 drop-shadow-2xl" />
      <div>
        <h2 className="text-3xl font-extrabold">הוזמנת לשולחן! 🃏</h2>
        <p className="mt-2 text-slate-400">
          {error ? '' : signedIn ? 'מצטרף לשולחן…' : 'התחבר עם Google כדי להצטרף ולבחור כיסא'}
        </p>
      </div>

      {error ? (
        <div className="w-full space-y-3">
          <p className="rounded-2xl bg-rose-500/15 p-3 text-rose-200 ring-1 ring-rose-400/30">{error}</p>
          <button type="button" onClick={onCancel} className="w-full rounded-2xl bg-slate-800 py-3.5 font-bold">
            למסך הבית
          </button>
        </div>
      ) : !signedIn ? (
        <div className="w-full space-y-3">
          <AccountBar auth={auth} />
          <button
            type="button"
            onClick={() => {
              clearPendingInvite();
              onCancel();
            }}
            className="w-full py-2 text-sm text-slate-400"
          >
            לא עכשיו
          </button>
        </div>
      ) : (
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-400 border-t-transparent" />
      )}
    </div>
  );
}
