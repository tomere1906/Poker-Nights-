import { formatShekel } from '../lib/format.js';
import PlayerName from './PlayerName.jsx';

// "הסכומים לא מתאזנים": the manager chooses who covers the difference.
export const ADJUST_LABELS = {
  equal: 'חלוקה שווה בין כל השחקנים',
  winners: 'חלוקה בין המנצחים לפי הרווח',
  player: 'שחקן מסוים',
};

// The difference in words, as on the end-game screen.
export function gapText(gap) {
  return `${gap > 0 ? 'הרווחים גדולים מההפסדים' : 'ההפסדים גדולים מהרווחים'} ב־${formatShekel(Math.abs(gap))}`;
}

const OPTION = 'w-full rounded-2xl px-4 py-3 text-start text-sm font-bold transition active:scale-[0.98]';

// The warning and the choice (settlement screen, before the table is closed).
// adjust: the current choice or null. onChange(adjust): the manager (null =
// read only: co-managers see what the manager chose). canWinners: someone won.
export function AdjustChoice({ gap, adjust, players, canWinners, onChange }) {
  const chosen = adjust?.method ?? null;
  return (
    <div className="mb-4 rounded-3xl bg-amber-300/10 p-3 ring-1 ring-amber-300/30" role="alert">
      <p className="font-bold text-amber-100">⚠️ הסכומים לא מתאזנים: {gapText(gap)}</p>
      <p className="mb-3 text-xs text-amber-200/80">
        כנראה טעות בספירה או כניסה שלא נרשמה. אפשר לחזור ולבדוק, או לבחור מי מכסה את ההפרש.
      </p>
      {onChange ? (
        <div className="space-y-2">
          {Object.entries(ADJUST_LABELS).map(([method, label]) => {
            const disabled = method === 'winners' && !canWinners;
            const on = chosen === method;
            return (
              <button
                key={method}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => onChange(method === 'player' ? { method, player: adjust?.player ?? null } : { method })}
                className={`${OPTION} ${
                  on ? 'bg-amber-300 text-slate-900' : 'bg-slate-950/40 text-slate-200'
                } disabled:text-slate-600`}
              >
                {label}
              </button>
            );
          })}
          {chosen === 'player' && (
            <div className="rounded-2xl bg-slate-950/40 p-3">
              <p className="mb-2 text-xs font-medium text-slate-400">מי מכסה את ההפרש?</p>
              <div className="flex flex-wrap gap-2">
                {players.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={adjust.player === p.id}
                    onClick={() => onChange({ method: 'player', player: p.id })}
                    className={`flex max-w-full items-center rounded-2xl px-3 py-2 text-sm font-bold transition active:scale-95 ${
                      adjust.player === p.id ? 'bg-amber-300 text-slate-900' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    <PlayerName name={p.name} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="rounded-2xl bg-slate-950/40 px-3 py-2 text-sm text-slate-300">
          {chosen ? `מנהל השולחן בחר: ${ADJUST_LABELS[chosen]}` : 'מנהל השולחן בוחר מי מכסה את ההפרש'}
        </p>
      )}
    </div>
  );
}

// What the adjustment did: each player's real change from the result as typed
// to the final result, rounding included, so every number matches the results.
// adjustment: { method, player, gap, changes: [{ id, amount, share, rounding }] }
// (see adjustNets). A change made by rounding alone says "(עיגול)".
export function AdjustmentNote({ adjustment, nameOf }) {
  const { method, player, gap, changes } = adjustment;
  let title;
  if (gap === 0) title = 'עיגול הסכומים השאיר הפרש קטן, והוא נלקח מהמנצח הגדול';
  else if (method === 'equal') title = `${gapText(gap)}. ההפרש חולק שווה בין כל השחקנים`;
  else if (method === 'winners') title = `${gapText(gap)}. ההפרש חולק בין המנצחים לפי הרווח`;
  else if (method === 'player') title = `${gapText(gap)}. ${nameOf(player)} כיסה את ההפרש`;
  else if (method === 'biggest') title = `${gapText(gap)}. ההפרש נלקח מהמנצח הגדול`;
  else title = `${gapText(gap)}. התוצאות תוקנו כדי שיתאזנו`;
  return (
    <div className="mb-4 rounded-3xl bg-slate-800/70 p-3 ring-1 ring-amber-300/20">
      <p className="text-sm font-bold text-amber-100">⚖️ תיקון הפרש</p>
      <p className="mb-2 text-xs text-slate-400">{title}</p>
      <div className="flex flex-wrap gap-2">
        {changes.map((c) => (
          <span key={c.id} className="flex max-w-full items-center gap-1.5 rounded-2xl bg-slate-950/40 px-3 py-1.5 text-sm font-bold text-slate-200">
            <PlayerName name={nameOf(c.id)} />
            <span className="shrink-0 text-amber-200">{formatShekel(c.amount, { signed: true })}</span>
            {c.share === 0 && <span className="shrink-0 text-xs font-medium text-slate-400">(עיגול)</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
