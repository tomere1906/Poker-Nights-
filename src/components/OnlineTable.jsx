import { useEffect, useMemo, useRef, useState } from 'react';
import { netOf } from '../lib/game.js';
import { inviteLink, useOnlineTable } from '../lib/onlineTable.js';
import InviteSheet, { inviteMessage } from './InviteSheet.jsx';
import TableScreen from './TableScreen.jsx';
import TableLog from './TableLog.jsx';
import TableManageSheet from './TableManageSheet.jsx';
import OnlineEndGame from './OnlineEndGame.jsx';
import Settlement from './Settlement.jsx';
import { settle } from '../lib/settlement.js';
import { CardsIcon } from './Icons.jsx';

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
  const { view, error, loading, live, actions } = useOnlineTable(tableId, userId);
  const [panel, setPanel] = useState(null); // null | 'log' | 'manage' | 'invite'
  const [step, setStep] = useState('table'); // 'table' | 'end' | 'settle' (managers, before closing)
  const fail = (e) => showToast(`הפעולה נכשלה: ${e.message ?? e}`);

  // Confetti for everyone at the table when the manager closes it.
  const wasEnded = useRef(null);
  useEffect(() => {
    if (!view) return;
    if (wasEnded.current === false && view.ended) onCelebrate?.();
    wasEnded.current = view.ended;
    if (view.ended) setStep('table');
  }, [view, onCelebrate]);

  // Before closing: results as typed. After: the stored, settled results.
  const entries = useMemo(() => {
    if (!view) return [];
    return view.ended
      ? view.players.map((p) => ({ id: p.id, net: p.finalNet ?? 0 }))
      : view.players.map((p) => ({ id: p.id, net: netOf(view, p) ?? 0 }));
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

  const mine = (player) => player.userId === userId;
  const canSelfAdd = (player) => view.buyInMode === 'self_add' && !view.ended && mine(player);
  const missing = view.players.filter((p) => !(p.id in view.finals)).length;

  let body;
  if (view.ended) {
    body = (
      <Settlement
        players={view.players}
        entries={entries}
        rounding={view.settings.rounding}
        tableName={view.name}
        date={view.endedAt}
        notice={<p className="mb-3 rounded-2xl bg-emerald-400/10 px-4 py-2 text-center text-sm font-bold text-emerald-200">השולחן נסגר · התוצאות נשמרו 🔒</p>}
      >
        <button type="button" onClick={onHome} className={`${BIG_BUTTON} bg-slate-800 text-slate-100`}>
          חזרה למסך הבית
        </button>
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
        onRoundingChange={view.isManager ? (unit) => actions.setRounding(unit).catch(fail) : null}
        tableName={view.name}
        onBack={() => setStep('end')}
      >
        <CloseTableButton
          isManager={view.isManager}
          missing={missing}
          onClose={async () => {
            try {
              // The same whole-shekel results everyone will see; the database checks they add up to 0.
              await actions.endGame(settle(entries, { unit: view.settings.rounding }).nets);
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
          onError={(message) => showToast(`הפעולה נכשלה: ${message}`)}
          onDeleted={() => {
            showToast('השולחן נמחק');
            onHome();
          }}
        />
      )}
    </>
  );
}
