import { useState } from 'react';
import { DEFAULT_CHIP_VALUE, EXITS, netOf, potTotal, totalIn } from '../lib/game.js';
import { formatChipValue, formatShekel } from '../lib/format.js';
import Avatar from './Avatar.jsx';
import PlayerName from './PlayerName.jsx';
import CashForm from './CashForm.jsx';
import ResultField from './ResultField.jsx';
import { cashRoom } from '../lib/settlement.js';

// "מזומן ששולם": cash already paid (when leaving, or at the end). Only the rest
// is settled by transfers. Without onAdd/onRemove it's read-only.
// netOf(player): their profit/loss, or null before it's entered. Only players
// with a loss can pay cash, and never more than that loss.
function CashSection({ players, cash, netOf, onAdd, onRemove }) {
  const [adding, setAdding] = useState(false);
  const nameOf = (id) => players.find((p) => p.id === id)?.name ?? 'שחקן';
  const netById = new Map(players.map((p) => [p.id, netOf(p)]));
  const losers = players.filter((p) => netById.get(p.id) < 0);
  if (cash.length === 0 && !onAdd) return null;
  return (
    <section className="mt-4 rounded-3xl bg-slate-800/70 p-3 shadow-lg ring-1 ring-white/5">
      <h3 className="font-bold">מזומן ששולם 💵</h3>
      <p className="mb-2 text-xs text-slate-400">מה שכבר שולם במזומן יקוזז, ורק היתרה תועבר</p>
      {cash.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {cash.map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-2xl bg-slate-950/40 px-3 py-2 text-sm">
              <span className="flex-1">
                <b>{nameOf(c.from)}</b> שילם <b className="text-amber-200">{formatShekel(c.amount)}</b>
              </span>
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(c.id)}
                  aria-label="מחק"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 active:scale-90 active:bg-white/10"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {onAdd &&
        (adding ? (
          <CashForm
            players={players}
            payers={losers}
            maxFor={(id) => cashRoom(netById.get(id), cash, id)}
            onSave={(entry) => {
              setAdding(false);
              onAdd(entry);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            disabled={losers.length === 0}
            onClick={() => setAdding(true)}
            className="w-full rounded-2xl border-2 border-dashed border-white/15 py-2.5 text-sm font-bold text-slate-300 active:scale-[0.98] disabled:text-slate-500"
          >
            {losers.length === 0 ? 'קודם הזינו תוצאות – מזומן רק ממי שהפסיד' : '+ רשום מזומן ששולם'}
          </button>
        ))}
    </section>
  );
}

function NetBadge({ net }) {
  const tone = net > 0 ? 'bg-emerald-400/15 text-emerald-300' : net < 0 ? 'bg-rose-400/15 text-rose-300' : 'bg-white/10 text-slate-300';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${tone}`}>{formatShekel(net, { signed: true })}</span>
  );
}

function QuickPill({ active, tone, onClick, children }) {
  const on = tone === 'lost' ? 'bg-rose-400 text-slate-900' : 'bg-slate-200 text-slate-900';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 rounded-full px-3.5 text-sm font-bold transition active:scale-95 ${
        active ? on : 'bg-slate-950/50 text-slate-300 ring-1 ring-white/10'
      }`}
    >
      {children}
    </button>
  );
}

// End of the night: every player's result on one screen. Each player says it
// their own way ("600 צ׳יפים", "300 ₪", "מינוס 100"), picked per row with a
// small selector (ResultField); everything is stored as what they leave with,
// so the totals check works with mixed styles. `state.finals` keeps the
// table's endMode terms (profit/loss or ₪ at the end); `onMode` is kept for
// callers but the screen no longer switches it.
export default function EndGame({ state, onFinal, onBack, onSettle, onAddCash, onRemoveCash }) {
  const { players, finals, endMode } = state;
  const cash = state.cash ?? [];
  const chipValue = state.settings?.chipValue ?? DEFAULT_CHIP_VALUE;
  // Per player, how the result is told; the default follows the table.
  const [units, setUnits] = useState({});
  const unitOf = (id) => units[id] ?? (endMode === 'net' ? 'net' : chipValue === DEFAULT_CHIP_VALUE ? 'shekels' : 'chips');

  // Seat order; players who left mid-game (no seat) last.
  const ordered = [...players].sort((a, b) => (a.seat ?? 99) - (b.seat ?? 99));
  const nets = players.map((p) => netOf(state, p));
  const missing = nets.filter((n) => n === null).length;
  const diff = nets.reduce((sum, n) => sum + (n ?? 0), 0);

  // What a player leaves with (₪), or null before it's entered.
  // (netOf reads the exit for a player who left: one source per player.)
  const shekelsOf = (p) => {
    const net = netOf(state, p);
    return net === null ? null : net + totalIn(p);
  };
  const leaving = players.reduce((sum, p) => sum + (shekelsOf(p) ?? 0), 0);

  function setShekels(p, shekels) {
    onFinal(p.id, shekels === null ? null : endMode === 'chips' ? shekels : shekels - totalIn(p));
  }

  // Cash above a loss (e.g. the result was changed after the cash was recorded).
  const overpaid = players.filter((p) => {
    const paid = cash.filter((c) => c.from === p.id).reduce((s, c) => s + c.amount, 0);
    const net = netOf(state, p);
    return paid > 0 && net !== null && paid > Math.max(0, -net);
  });

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="חזרה לשולחן"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xl active:scale-90"
        >
          →
        </button>
        <h2 className="text-2xl font-extrabold">סיום משחק 🏁</h2>
      </div>

      <p className="mb-3 text-sm text-slate-400">
        מה כל אחד אומר? בכל שורה בוחרים איך הוא מספר: צ׳יפים, כסף או פלוס/מינוס
        {chipValue !== DEFAULT_CHIP_VALUE && ` (צ׳יפ שווה ${formatChipValue(chipValue)})`}
      </p>

      <ul className="space-y-2">
        {ordered.map((p, i) => {
          const net = netOf(state, p);
          const paidCash = cash.filter((c) => c.from === p.id).reduce((s, c) => s + c.amount, 0);
          return (
            <li key={p.id} className="space-y-2 rounded-3xl bg-slate-800/70 p-3 shadow-lg ring-1 ring-white/5">
              <div className="flex items-center gap-2">
                <Avatar player={p} size="h-11 w-11 text-base" />
                <div className="min-w-0 flex-1">
                  <PlayerName name={p.name} className="font-bold" />
                  <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-400">
                    <span>בפנים {formatShekel(totalIn(p))}</span>
                    {net !== null && <NetBadge net={net} />}
                    {paidCash > 0 && <span className="text-amber-200">💵 שילם {formatShekel(paidCash)}</span>}
                  </p>
                </div>
              </div>

              <ResultField
                totalIn={totalIn(p)}
                chipValue={chipValue}
                shekels={shekelsOf(p)}
                onChange={(shekels) => setShekels(p, shekels)}
                unit={unitOf(p.id)}
                onUnit={(unit) => setUnits((u) => ({ ...u, [p.id]: unit }))}
                enterKeyHint={i < ordered.length - 1 ? 'next' : 'done'}
              />

              <div className="flex gap-2">
                <QuickPill active={net === 0} tone="even" onClick={() => setShekels(p, totalIn(p))}>
                  {EXITS.even.icon} {EXITS.even.label}
                </QuickPill>
                <QuickPill active={net === -totalIn(p)} tone="lost" onClick={() => setShekels(p, 0)}>
                  {EXITS.lost_all.icon} {EXITS.lost_all.label}
                </QuickPill>
              </div>
            </li>
          );
        })}
      </ul>

      <CashSection players={ordered} cash={cash} netOf={(p) => netOf(state, p)} onAdd={onAddCash} onRemove={onRemoveCash} />

      {/* The dark band under the button (pb) keeps the screen's bottom edge the page
          color: iOS Safari tints its toolbar from what touches that edge. */}
      <div className="sticky bottom-0 mt-auto space-y-3 bg-gradient-to-t from-[#0b1120] via-[#0b1120] to-transparent pt-6 pb-3">
        <div className="flex justify-between rounded-2xl bg-slate-800/70 px-4 py-3 text-sm">
          <span>
            נכנס לקופה <b>{formatShekel(potTotal(players))}</b>
          </span>
          <span>
            יוצא <b>{formatShekel(leaving)}</b>
          </span>
        </div>

        {missing === 0 && diff !== 0 && (
          <div className="rounded-2xl bg-amber-300/15 px-4 py-3 text-sm text-amber-200 ring-1 ring-amber-300/30">
            ⚠️ {diff > 0 ? 'הרווחים גדולים מההפסדים' : 'ההפסדים גדולים מהרווחים'} ב־{formatShekel(Math.abs(diff))}.
            <br />
            אפשר לבדוק שוב, או להמשיך – ההפרש ייספג אצל המנצח הגדול.
          </div>
        )}

        {overpaid.length > 0 && (
          <div className="rounded-2xl bg-rose-400/15 px-4 py-3 text-sm font-bold text-rose-200 ring-1 ring-rose-400/30" role="alert">
            💵 המזומן של {overpaid.map((p) => p.name).join(', ')} גדול מההפסד. מזומן הוא רק תשלום על חשבון ההפסד – תקנו את
            התוצאה או מחקו את המזומן.
          </div>
        )}

        <button
          type="button"
          disabled={missing > 0 || overpaid.length > 0}
          onClick={onSettle}
          className="w-full rounded-2xl bg-emerald-400 py-4 text-lg font-extrabold text-slate-900 shadow-lg shadow-emerald-400/20 transition active:scale-[0.98] disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
        >
          {missing > 0 ? `נשארו ${missing === 1 ? 'שחקן אחד' : `${missing} שחקנים`} למלא` : 'מי מעביר למי 💸'}
        </button>
      </div>
    </div>
  );
}
