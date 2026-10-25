import { useState } from 'react';
import { inviteLink, useOnlineTable } from '../lib/onlineTable.js';
import InviteSheet from './InviteSheet.jsx';
import TableScreen from './TableScreen.jsx';
import TableLog from './TableLog.jsx';
import TableManageSheet from './TableManageSheet.jsx';
import { CardsIcon } from './Icons.jsx';

const HEADER_BUTTON = 'rounded-xl bg-slate-800 px-3 py-2 text-sm font-bold text-slate-200 active:scale-95';

// An online table. The manager/co-managers run it; players watch it (and in
// "כל אחד את שלו" mode add buy-ins for themselves).
export default function OnlineTable({ tableId, userId, onHome, showToast }) {
  const { view, error, loading, live, actions } = useOnlineTable(tableId, userId);
  const [panel, setPanel] = useState(null); // null | 'log' | 'manage'

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
          {view.canManage && view.status !== 'ended' && (
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

  if (panel === 'log') return <TableLog entries={view.log} onBack={() => setPanel(null)} />;

  const mine = (player) => player.userId === userId;
  const canSelfAdd = (player) => view.buyInMode === 'self_add' && view.status !== 'ended' && mine(player);

  return (
    <>
      {header}
      <TableScreen
        players={view.players}
        started={view.started}
        settings={view.settings}
        canManage={view.canManage}
        canSelfAdd={canSelfAdd}
        people={view.unseated}
        onAdd={actions.add}
        onBuyIn={actions.buyIn}
        onUndo={actions.undoBuyIn}
        onRemove={actions.remove}
        onMove={actions.move}
        onStart={actions.start}
        onEnd={null}
        onEditIdentity={actions.setIdentity}
        onSeatSelf={view.canSeatSelf ? actions.seatSelf : undefined}
        showToast={showToast}
      />
      {panel === 'invite' && <InviteSheet link={inviteLink(view)} onClose={() => setPanel(null)} />}
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
