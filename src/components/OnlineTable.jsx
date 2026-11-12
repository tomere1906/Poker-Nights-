import { useEffect, useMemo, useRef, useState } from 'react';
import { isAbsent, netOf } from '../lib/game.js';
import { inviteLink, useOnlineTable } from '../lib/onlineTable.js';
import InviteSheet, { inviteMessage } from './InviteSheet.jsx';
import TableScreen from './TableScreen.jsx';
import TableLog from './TableLog.jsx';
import TableManageSheet from './TableManageSheet.jsx';
import OnlineEndGame from './OnlineEndGame.jsx';
import Settlement from './Settlement.jsx';
import { settle } from '../lib/settlement.js';
import { openBit } from '../lib/bit.js';
import { copyText } from '../lib/clipboard.js';
import { formatShekel } from '../lib/format.js';
import { formatPhone } from '../lib/phone.js';
import { saveMyPhone } from '../lib/auth.js';
import PhonePrompt from './PhonePrompt.jsx';
import { CardsIcon } from './Icons.jsx';
import { friendlyError } from '../lib/errors.js';

const HEADER_BUTTON = 'rounded-xl bg-slate-800 px-3 py-2 text-sm font-bold text-slate-200 active:scale-95';
const BIG_BUTTON = 'w-full rounded-2xl py-4 text-lg font-extrabold transition active:scale-[0.98]';

// Closing the table: the manager taps twice. Co-managers see who closes it.
function CloseTableButton({ isManager, missing, onClose }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!isManager) {
    return <p className="rounded-2xl bg-slate-800/70 py-3 text-center text-sm text-slate-400">רק מנהל השולחן סוגר את השולחן 🔒</p>;
  }
  return (
    <button
      type="button"
      disabled={missing > 0 || busy}
      onClick={async () => {
        if (!confirm) return setConfirm(true);
        setBusy(true);
        try {
          await onClose();
        } finally {
          setBusy(false);
          setConfirm(false);
        }
      }}
      className={`${BIG_BUTTON} ${
        confirm ? 'bg-amber-300 text-slate-900' : 'bg-slate-800 text-slate-100'
      } disabled:bg-slate-800 disabled:text-slate-500`}
    >
      {missing > 0
        ? 'יש שחקנים בלי תוצאה'
        : busy
          ? 'סוגר…'
          : confirm
            ? 'בטוח? התוצאות יינעלו לכולם – הקש שוב'
            : 'סגור את השולחן 🔒'}
    </button>
  );
}

// Closing the settling by hand (the manager), e.g. when the rest was settled outside the app.
function CloseSettlingButton({ paid, total, onClose }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <button
      type="button"
      onClick={() => (confirm ? onClose() : setConfirm(true))}
      className={`w-full rounded-2xl py-3 text-sm font-bold transition active:scale-[0.98] ${
        confirm ? 'bg-amber-300 text-slate-900' : 'bg-slate-800 text-slate-200'
      }`}
    >
      {confirm ? `לסגור את ההתחשבנות? ${paid} מתוך ${total} שולמו – הקש שוב` : 'סגור את ההתחשבנות 🔒'}
    </button>
  );
}

function ReopenButton({ onReopen }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <button
      type="button"
      onClick={() => (confirm ? onReopen() : setConfirm(true))}
      className={`w-full rounded-2xl py-3 text-sm font-bold transition active:scale-[0.98] ${
        confirm ? 'bg-amber-300 text-slate-900' : 'bg-slate-900 text-slate-400'
      }`}
    >
      {confirm ? 'לפתוח מחדש לתיקונים? הקש שוב' : 'פתח מחדש לתיקונים'}
    </button>
  );
}

// An online table. The manager/co-managers run it; players watch it live (and
// in "כל אחד את שלו" mode add buy-ins for themselves). At the end: managers
// enter results, the manager closes the table, everyone sees who pays whom.
export default function OnlineTable({ tableId, userId, onHome, showToast, onCelebrate }) {
  const { view, error, loading, live, actions, refresh } = useOnlineTable(tableId, userId);
  // "לא עכשיו" on the phone card: hidden for this table (on this device).
  const dismissKey = `poker-nights-phone-later:${tableId}`;
  const [phoneLater, setPhoneLater] = useState(() => {
    try {
      return localStorage.getItem(dismissKey) === '1';
    } catch {
      return false;
    }
  });

  // On a closed table, which stored rows I pay by transfer to someone whose number I
  // can't see yet. A number saved later isn't in the change log (it's private),
  // so while I wait for one, check again every 10 seconds.
  const waitingForPhone = useMemo(() => {
    if (!view?.settling) return false;
    const seat = new Map(view.players.map((p) => [p.id, p]));
    return view.transfers.some((t) => {
      const to = seat.get(t.to);
      return !t.paidAt && t.amount > t.cash && seat.get(t.from)?.userId === userId && to?.userId && !view.phones[to.userId];
    });
  }, [view, userId]);
  useEffect(() => {
    if (!waitingForPhone) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 10_000);
    return () => clearInterval(timer);
  }, [waitingForPhone, refresh]);
  const [panel, setPanel] = useState(null); // null | 'log' | 'manage' | 'invite'
  const [step, setStep] = useState('table'); // 'table' | 'end' | 'settle' (managers, before closing)
  const fail = (e) => showToast(friendlyError(e));

  // Confetti for everyone at the table when the manager closes it.
  const wasEnded = useRef(null);
  useEffect(() => {
    if (!view) return;
    if (wasEnded.current === false && view.ended) onCelebrate?.();
    wasEnded.current = view.ended;
    if (view.ended) setStep('table');
  }, [view, onCelebrate]);

  // The settling closing while the table is open: "✓ כולם שילמו" (or closed by hand).
  const wasSettling = useRef(null);
  useEffect(() => {
    if (!view) return;
    if (wasSettling.current === true && view.ended && !view.settling) {
      const allPaid = view.transfers.every((t) => t.paidAt);
      showToast(allPaid ? '✓ כולם שילמו – ההתחשבנות נסגרה' : 'ההתחשבנות נסגרה 🔒');
      if (allPaid) onCelebrate?.();
    }
    wasSettling.current = view.settling;
  }, [view, showToast, onCelebrate]);

  // Before closing: results as typed. After: the stored, settled results.
  const entries = useMemo(() => {
    if (!view) return [];
    return view.ended
      ? view.players.map((p) => ({ id: p.id, net: p.finalNet ?? 0 }))
      : view.players.map((p) => ({ id: p.id, net: netOf(view, p) ?? 0 }));
  }, [view]);

  // "לא כאן": cash is handed only to winners who are present.
  const absent = useMemo(() => (view ? view.players.filter(isAbsent).map((p) => p.id) : []), [view]);
  // The manager's seat takes cash that no present winner is owed (and passes it on).
  const managerSeat = useMemo(() => {
    const managerId = view?.people.find((p) => p.isManager)?.userId;
    return view?.players.find((p) => p.userId && p.userId === managerId)?.id ?? null;
  }, [view]);

  const header = (
    <header className="mb-2 flex items-center gap-2">
      <button type="button" onClick={onHome} aria-label="מסך הבית" className="flex items-center gap-2 rounded-2xl active:scale-95">
        <CardsIcon className="h-9 w-9 drop-shadow" />
        <h1 className="sr-only">Poker Nights</h1>
      </button>
      <span
        className="flex items-center gap-1.5 rounded-full bg-sky-400/15 px-2 py-0.5 text-xs font-bold text-sky-300"
        title={live ? 'מתעדכן בזמן אמת' : 'מתחבר לעדכונים…'}
      >
        <span className={`h-2 w-2 rounded-full ${live ? 'animate-pulse bg-emerald-400' : 'bg-slate-500'}`} aria-hidden />
        {live ? 'אונליין · חי' : 'אונליין'}
      </span>
      {view && (
        <div className="ms-auto flex gap-2">
          {view.canManage && !view.ended && (
            <button type="button" onClick={() => setPanel('invite')} className={HEADER_BUTTON}>
              💌 הזמן
            </button>
          )}
          <button type="button" onClick={() => setPanel('log')} className={HEADER_BUTTON}>
            📜 יומן
          </button>
          <button type="button" onClick={() => setPanel('manage')} className={HEADER_BUTTON} aria-label="ניהול שולחן">
            ⚙️
          </button>
        </div>
      )}
    </header>
  );

  if (loading) {
    return (
      <>
        {header}
        <p className="flex flex-1 items-center justify-center text-slate-400">טוען את השולחן…</p>
      </>
    );
  }

  if (!view) {
    return (
      <>
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-slate-300">לא הצלחנו לטעון את השולחן.</p>
          <p className="text-sm text-slate-500">{error}</p>
          <button type="button" onClick={onHome} className="rounded-2xl bg-slate-800 px-5 py-3 font-bold">
            חזרה למסך הבית
          </button>
        </div>
      </>
    );
  }

  if (panel === 'log') return <TableLog entries={view.log} tableName={view.name} onBack={() => setPanel(null)} />;

  const mine = (player) => Boolean(player?.userId) && player.userId === userId;
  const seatOf = (id) => view.players.find((p) => p.id === id);
  const canSelfAdd = (player) => view.buyInMode === 'self_add' && !view.ended && mine(player);
  const missing = view.players.filter((p) => !(p.id in view.finals)).length;

  // A winner who gets at least one transfer (not only cash) and has no number saved.
  const askPhone =
    view.settling &&
    !phoneLater &&
    !view.phones[userId] &&
    view.transfers.some((t) => !t.paidAt && t.amount > t.cash && mine(seatOf(t.to)));
  const paidCount = view.transfers.filter((t) => t.paidAt).length;
  const allPaid = view.transfers.length > 0 && paidCount === view.transfers.length;

  let body;
  if (view.ended) {
    body = (
      <Settlement
        showPodium
        players={view.players}
        entries={entries}
        rounding={view.settings.rounding}
        cash={view.cash}
        absent={absent}
        manager={managerSeat}
        tableName={view.name}
        date={view.endedAt}
        notice={
          <>
            {view.settling ? (
              <div className="mb-3 rounded-2xl bg-amber-300/10 px-4 py-2 text-center text-sm font-bold text-amber-100 ring-1 ring-amber-300/20">
                פתוח להתחשבנות · המשחק נגמר והתוצאות נשמרו
                <span className="block text-xs font-medium text-amber-200/80">נסגר לבד כשכל ההעברות מסומנות "שולם ✓"</span>
              </div>
            ) : (
              <p className="mb-3 rounded-2xl bg-emerald-400/10 px-4 py-2 text-center text-sm font-bold text-emerald-200">
                {allPaid ? '✓ כולם שילמו · ההתחשבנות נסגרה 🔒' : view.transfers.length > 0 ? 'ההתחשבנות נסגרה 🔒' : 'השולחן נסגר · התוצאות נשמרו 🔒'}
              </p>
            )}
            {askPhone && (
              <PhonePrompt
                onSave={async (phone) => {
                  await saveMyPhone(userId, phone);
                  await refresh();
                  showToast('המספר נשמר ✓ מי שמעביר לך יראה את כפתור הביט');
                }}
                onLater={() => {
                  try {
                    localStorage.setItem(dismissKey, '1');
                  } catch {
                    // Private mode: hidden until the page reloads.
                  }
                  setPhoneLater(true);
                }}
              />
            )}
          </>
        }
        stored={view.transfers}
        canMark={(row) => view.canManage || mine(seatOf(row.from)) || mine(seatOf(row.to))}
        onTogglePaid={(row, paid) => actions.setPaid(row.id, paid).catch(fail)}
        phoneFor={(row) =>
          view.settling && !row.paidAt && row.amount > row.cash && mine(seatOf(row.from))
            ? view.phones[seatOf(row.to)?.userId] ?? null
            : null
        }
        onBit={(row, phone) => {
          // Copy first (still inside the tap), then open Bit.
          copyText(phone).then((ok) =>
            showToast(ok ? `המספר הועתק · ${formatShekel(row.amount - row.cash)} – הדבק בביט` : `לא הצלחנו להעתיק: ${formatPhone(phone)}`)
          );
          openBit();
        }}
      >
        <button type="button" onClick={onHome} className={`${BIG_BUTTON} bg-slate-800 text-slate-100`}>
          חזרה למסך הבית
        </button>
        {view.isManager && view.settling && (
          <CloseSettlingButton paid={paidCount} total={view.transfers.length} onClose={() => actions.closeSettling().catch(fail)} />
        )}
        {view.isManager && <ReopenButton onReopen={() => actions.reopen().catch(fail)} />}
      </Settlement>
    );
  } else if (step === 'end' && view.canManage) {
    body = (
      <OnlineEndGame
        view={view}
        actions={actions}
        onBack={() => setStep('table')}
        onSettle={() => setStep('settle')}
        onError={(message) => showToast(`השמירה נכשלה: ${message}`)}
      />
    );
  } else if (step === 'settle' && view.canManage) {
    body = (
      <Settlement
        players={view.players}
        entries={entries}
        rounding={view.settings.rounding}
        cash={view.cash}
        absent={absent}
        manager={managerSeat}
        onAbsentChange={(id, away) => actions.setAbsent(id, away).catch(fail)}
        onRoundingChange={view.isManager ? (unit) => actions.setRounding(unit).catch(fail) : null}
        tableName={view.name}
        onBack={() => setStep('end')}
      >
        <CloseTableButton
          isManager={view.isManager}
          missing={missing}
          onClose={async () => {
            try {
              // Exactly what this screen shows: the whole-shekel results and who pays whom.
              // The database checks the results add up to 0 and the transfers match them.
              const { nets, transfers } = settle(entries, {
                unit: view.settings.rounding,
                cash: view.cash,
                absent,
                manager: managerSeat,
              });
              await actions.endGame(nets, transfers);
              showToast('השולחן נסגר – התוצאות נשמרו 🎉');
            } catch (e) {
              fail(e);
            }
          }}
        />
      </Settlement>
    );
  } else {
    body = (
      <TableScreen
        players={view.players}
        started={view.started}
        settings={view.settings}
        tableName={view.name}
        cash={view.cash}
        canManage={view.canManage}
        canSelfAdd={canSelfAdd}
        people={view.unseated}
        onAdd={actions.add}
        onBuyIn={actions.buyIn}
        onUndo={actions.undoBuyIn}
        onRemove={actions.remove}
        onMove={actions.move}
        onStart={actions.start}
        onEnd={view.canManage ? () => setStep('end') : null}
        onEditIdentity={actions.setIdentity}
        onSeatSelf={view.canSeatSelf ? actions.seatSelf : undefined}
        onMarkOut={actions.markOut}
        onMarkBack={actions.markBack}
        showToast={showToast}
      />
    );
  }

  return (
    <>
      {header}
      {body}
      {panel === 'invite' && (
        <InviteSheet
          link={inviteLink(view)}
          message={inviteMessage(inviteLink(view), { managerName: view.managerName, tableName: view.name })}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'manage' && (
        <TableManageSheet
          view={view}
          actions={actions}
          onClose={() => setPanel(null)}
          onError={(message) => showToast(message)}
          onDeleted={() => {
            showToast('השולחן נמחק');
            onHome();
          }}
        />
      )}
    </>
  );
}
