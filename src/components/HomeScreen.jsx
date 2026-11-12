import { useEffect, useState } from 'react';
import { potTotal } from '../lib/game.js';
import { formatDate, formatShekel } from '../lib/format.js';
import { isSupabaseConfigured } from '../lib/supabase.js';
import { RECENT_DAYS, listOpenTables, listRecentGames, recentManagedGames } from '../lib/onlineTable.js';
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

// Closed games I managed or co-managed in the last 30 days, so a mistake can
// still be fixed ("פתח מחדש לתיקונים" inside). Collapsed by default.
function RecentGames({ games, onOpen }) {
  const [open, setOpen] = useState(false);
  if (!games.length) return null;
  return (
    <div className="rounded-2xl bg-slate-800/40 ring-1 ring-white/5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-start text-sm font-bold text-slate-300"
      >
        <span>🛠️ משחקים אחרונים שניהלתי ({games.length})</span>
        <span aria-hidden className={`transition ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="space-y-1.5 px-2 pb-2">
          <p className="px-2 text-xs text-slate-500">
            לתיקון טעויות אחרי סגירה · מוצגים {RECENT_DAYS} יום, והמשחק נשאר בסטטיסטיקה גם אחר כך
          </p>
          {games.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onOpen(t.id)}
              className="flex w-full items-center justify-between gap-2 rounded-xl bg-slate-900/70 px-3 py-2.5 text-start transition active:scale-[0.98]"
            >
              <span className="min-w-0">
                <span className="block truncate font-bold text-slate-100">{t.name || 'שולחן בלי שם'}</span>
                <span className="block text-xs text-slate-400">{formatDate(Date.parse(t.ended_at))}</span>
              </span>
              <span className="shrink-0 rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-bold text-emerald-300">
                {t.settled_manually ? 'ההתחשבנות נסגרה 🔒' : 'כולם שילמו ✓'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function OnlineSection({ auth, onContinueOnline, onNewOnline, onOpenStats }) {
  const [tables, setTables] = useState(null);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState(null);
  const signedIn = Boolean(auth.session);
  const userId = auth.session?.user?.id;

  useEffect(() => {
    if (!signedIn) return;
    listOpenTables()
      .then(setTables)
      .catch((e) => setError(e.message));
    // Not essential: if it fails the start screen just doesn't show it.
    listRecentGames()
      .then((rows) => setRecent(recentManagedGames(rows, userId)))
      .catch(() => setRecent([]));
  }, [signedIn, userId]);

  // A game being played, and games that ended but are still open for settling.
  const latest = tables?.find((t) => t.status !== 'ended');
  const settling = tables?.filter((t) => t.status === 'ended') ?? [];
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
                {latest.name ? `${latest.name} · ` : ''}
                {latest.table_players?.[0]?.count ?? 0} שחקנים · {latest.status === 'seating' ? 'בהושבה' : 'במשחק'}
              </span>
            </button>
          )}
          {settling.map((t) => {
            const total = t.settlement_transfers?.length ?? 0;
            const paid = t.settlement_transfers?.filter((x) => x.paid_at).length ?? 0;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onContinueOnline(t.id)}
                className="w-full rounded-2xl bg-amber-300/10 px-4 py-3 text-start ring-1 ring-amber-300/30 transition active:scale-[0.98]"
              >
                <span className="block font-bold text-amber-100">
                  משחק פתוח: {paid} מתוך {total} שולמו 💸
                </span>
                <span className="block text-sm text-slate-400">
                  {t.name ? `${t.name} · ` : ''}
                  {t.ended_at ? formatDate(Date.parse(t.ended_at)) : ''} · מי מעביר למי
                </span>
              </button>
            );
          })}
          <button type="button" onClick={onNewOnline} className={latest ? SECONDARY : PRIMARY}>
            פתח שולחן אונליין {latest ? 'חדש' : '🌐'}
          </button>
          <button type="button" onClick={onOpenStats} className={SECONDARY}>
            📊 סטטיסטיקה והחבר׳ה שלי
          </button>
          <RecentGames games={recent} onOpen={onContinueOnline} />
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

export default function HomeScreen({
  state,
  auth,
  onOpenProfile,
  onContinueLocal,
  onNewLocal,
  onContinueOnline,
  onNewOnline,
  onOpenStats,
}) {
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
        <p className="mt-1 text-slate-400">הקלפים עליכם, החשבון עלינו</p>
      </div>

      {isSupabaseConfigured && !auth.loading && (
        <OnlineSection auth={auth} onContinueOnline={onContinueOnline} onNewOnline={onNewOnline} onOpenStats={onOpenStats} />
      )}
      <LocalSection state={state} onContinueLocal={onContinueLocal} onNewLocal={onNewLocal} />

      <footer className="flex justify-center gap-3 pt-2 text-xs text-slate-500">
        <a href={`${import.meta.env.BASE_URL}privacy.html`} className="underline-offset-4 hover:underline">
          מדיניות פרטיות
        </a>
        <span aria-hidden>·</span>
        <a href={`${import.meta.env.BASE_URL}terms.html`} className="underline-offset-4 hover:underline">
          תנאי שימוש
        </a>
      </footer>
    </div>
  );
}
