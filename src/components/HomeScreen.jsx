import { useEffect, useState } from 'react';
import { potTotal } from '../lib/game.js';
import { formatShekel } from '../lib/format.js';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { listOpenTables } from '../lib/onlineTable.js';
import { CardsIcon, ChipIcon } from './Icons.jsx';
import AccountBar from './AccountBar.jsx';

const PRIMARY =
  'w-full rounded-3xl bg-emerald-400 py-4 text-lg font-extrabold text-slate-900 shadow-xl shadow-emerald-400/25 transition active:scale-[0.98]';
const SECONDARY = 'w-full rounded-2xl bg-slate-800 py-3.5 font-bold text-slate-200 transition active:scale-[0.98]';

function Section({ icon, title, hint, children }) {
  return (
    <section className="rounded-3xl bg-slate-900/70 p-4 ring-1 ring-white/5">
      <h2 className="font-extrabold">
        {icon} {title}
      </h2>
      <p className="mb-3 text-sm text-slate-400">{hint}</p>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function OnlineSection({ auth, onContinueOnline, onNewOnline }) {
  const [tables, setTables] = useState(null);
  const [error, setError] = useState(null);
  const signedIn = Boolean(auth.session);

  useEffect(() => {
    if (!signedIn) return;
    listOpenTables()
      .then(setTables)
      .catch((e) => setError(e.message));
  }, [signedIn]);

  const latest = tables?.[0];
  return (
    <Section icon="🌐" title="שולחן אונליין עם חברים" hint="כולם רואים את השולחן מהטלפון שלהם · דורש התחברות">
      {!signedIn ? (
        <p className="rounded-2xl bg-slate-800/60 p-3 text-center text-sm text-slate-300">
          התחבר עם Google למעלה כדי לפתוח שולחן עם חברים
        </p>
      ) : tables === null && !error ? (
        <div className="h-14 animate-pulse rounded-3xl bg-slate-800/60" aria-label="טוען" />
      ) : (
        <>
          {error && <p className="text-sm text-rose-300">לא הצלחנו לטעון שולחנות: {error}</p>}
          {latest && (
            <button type="button" onClick={() => onContinueOnline(latest.id)} className={PRIMARY}>
              חזרה לשולחן האונליין 🌐
              <span className="mt-0.5 block text-sm font-medium text-slate-800">
                {latest.table_players?.[0]?.count ?? 0} שחקנים · {latest.status === 'seating' ? 'בהושבה' : 'במשחק'}
              </span>
            </button>
          )}
          <button type="button" onClick={onNewOnline} className={latest ? SECONDARY : PRIMARY}>
            פתח שולחן אונליין {latest ? 'חדש' : '🌐'}
          </button>
        </>
      )}
    </Section>
  );
}

function LocalSection({ state, onContinueLocal, onNewLocal }) {
  const [confirmNew, setConfirmNew] = useState(false);
  const { tableOpen, players } = state;
  return (
    <Section icon="📱" title="שולחן מקומי (בלי התחברות)" hint="הכול נשמר רק בטלפון הזה">
      {tableOpen ? (
        <>
          <button type="button" onClick={onContinueLocal} className={SECONDARY}>
            חזרה לשולחן המקומי · {players.length} שחקנים · {formatShekel(potTotal(players))}
          </button>
          <button
            type="button"
            onClick={() => (confirmNew ? onNewLocal() : setConfirmNew(true))}
            className={`w-full rounded-2xl py-3 text-sm font-bold transition active:scale-[0.98] ${
              confirmNew ? 'bg-rose-500 text-white' : 'bg-slate-800/60 text-slate-300'
            }`}
          >
            {confirmNew ? 'השולחן המקומי הנוכחי יימחק – הקש שוב' : 'פתח שולחן מקומי חדש'}
          </button>
        </>
      ) : (
        <button type="button" onClick={onNewLocal} className={SECONDARY}>
          פתח שולחן מקומי 📱
        </button>
      )}
    </Section>
  );
}

export default function HomeScreen({ state, auth, onOpenProfile, onContinueLocal, onNewLocal, onContinueOnline, onNewOnline }) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <AccountBar auth={auth} onOpenProfile={onOpenProfile} />

      <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
        <div className="relative mb-4">
          <div className="absolute inset-0 -z-10 rounded-full bg-emerald-500/20 blur-3xl" />
          <CardsIcon className="h-20 w-20 drop-shadow-2xl" />
          <div className="absolute -bottom-2 -start-5 flex -space-x-3 space-x-reverse">
            <ChipIcon className="h-8 w-8 drop-shadow-lg" color="#e11d48" />
            <ChipIcon className="h-8 w-8 drop-shadow-lg" color="#2563eb" />
          </div>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Poker Nights</h1>
        <p className="mt-1 text-slate-400">קניות, תוצאות ומי מעביר למי – בלי מחשבון</p>
      </div>

      {isSupabaseConfigured && !auth.loading && (
        <OnlineSection auth={auth} onContinueOnline={onContinueOnline} onNewOnline={onNewOnline} />
      )}
      <LocalSection state={state} onContinueLocal={onContinueLocal} onNewLocal={onNewLocal} />
    </div>
  );
}
