import { useRef, useState } from 'react';
import { netOf, potTotal, totalIn } from '../lib/game.js';
import { formatShekel, parseAmount } from '../lib/format.js';
import Avatar from './Avatar.jsx';

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

const MODES = [
  { id: 'net', label: 'רווח / הפסד' },
  { id: 'chips', label: 'צ׳יפים בסוף' },
];

function AmountField({ value, onChange, placeholder, inputRef, enterKeyHint }) {
  return (
    <div className="relative w-24">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        enterKeyHint={enterKeyHint}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl bg-slate-950/60 px-3 py-3 pe-7 text-lg font-bold outline-none ring-2 ring-transparent placeholder:text-sm placeholder:font-normal placeholder:text-slate-500 focus:ring-emerald-400"
      />
      <span className="pointer-events-none absolute inset-y-0 end-2.5 flex items-center text-slate-400">₪</span>
    </div>
  );
}

export default function EndGame({ state, onMode, onFinal, onBack, onSettle }) {
  const { players, finals, endMode } = state;
  // In net mode, a typed amount waits here until a +/− is chosen.
  const [signs, setSigns] = useState({});
  const [drafts, setDrafts] = useState({});
  const inputs = useRef({});

  const ordered = [...players].sort((a, b) => a.seat - b.seat);
  const nets = players.map((p) => netOf(state, p));
  const missing = nets.filter((n) => n === null).length;
  const diff = nets.reduce((sum, n) => sum + (n ?? 0), 0);
  const gains = nets.reduce((sum, n) => sum + Math.max(n ?? 0, 0), 0);
  const losses = nets.reduce((sum, n) => sum + Math.min(n ?? 0, 0), 0);

  const signOf = (id) => (finals[id] > 0 ? 1 : finals[id] < 0 ? -1 : signs[id]);

  function setNet(id, amount, sign) {
    if (sign) setSigns((s) => ({ ...s, [id]: sign }));
    if (amount === null) {
      onFinal(id, null);
      setDrafts((d) => ({ ...d, [id]: undefined }));
    } else if (amount === 0 || sign) {
      onFinal(id, amount * (sign ?? 1));
      setDrafts((d) => ({ ...d, [id]: undefined }));
    } else {
      onFinal(id, null);
      setDrafts((d) => ({ ...d, [id]: amount }));
    }
  }

  function chooseSign(id, sign) {
    setSigns((s) => ({ ...s, [id]: sign }));
    const amount = id in finals ? Math.abs(finals[id]) : drafts[id];
    if (amount) onFinal(id, amount * sign);
    setDrafts((d) => ({ ...d, [id]: undefined }));
    inputs.current[id]?.focus();
  }

  // One-tap result: net is the player's profit/loss, stored in the current mode's terms.
  function quick(player, net) {
    onFinal(player.id, endMode === 'chips' ? net + totalIn(player) : net);
    setDrafts((d) => ({ ...d, [player.id]: undefined }));
    if (net < 0) setSigns((s) => ({ ...s, [player.id]: -1 }));
  }

  const parse = (text) => (text.trim() === '' ? null : parseAmount(text));

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

      <div className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-slate-800/70 p-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onMode(m.id)}
            className={`rounded-xl py-2.5 font-bold transition ${
              endMode === m.id ? 'bg-slate-100 text-slate-900 shadow' : 'text-slate-400'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="mb-3 text-sm text-slate-400">
        {endMode === 'net' ? 'כמה כל אחד הרוויח או הפסיד? בחר + או − ורשום סכום' : 'עם כמה צ׳יפים כל אחד יצא?'}
      </p>

      <ul className="space-y-2">
        {ordered.map((p, i) => {
          const net = netOf(state, p);
          const sign = signOf(p.id);
          const needsSign = endMode === 'net' && drafts[p.id] > 0;
          const enterKeyHint = i < ordered.length - 1 ? 'next' : 'done';
          return (
            <li key={p.id} className="rounded-3xl bg-slate-800/70 p-3 shadow-lg ring-1 ring-white/5">
              <div className="flex items-center gap-2">
                <Avatar player={p} size="h-11 w-11 text-base" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{p.name}</p>
                  <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-400">
                    <span>בפנים {formatShekel(totalIn(p))}</span>
                    {net !== null && <NetBadge net={net} />}
                    {needsSign && <span className="font-bold text-amber-300">+ או −?</span>}
                  </p>
                </div>
  
                {endMode === 'net' ? (
                  <>
                    <div className={`flex overflow-hidden rounded-2xl ${needsSign ? 'ring-2 ring-amber-300' : ''}`}>
                      <button
                        type="button"
                        onClick={() => chooseSign(p.id, 1)}
                        aria-label="רווח"
                        className={`h-12 w-11 text-2xl font-extrabold transition ${
                          sign === 1 ? 'bg-emerald-400 text-slate-900' : 'bg-slate-950/60 text-emerald-300'
                        }`}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => chooseSign(p.id, -1)}
                        aria-label="הפסד"
                        className={`h-12 w-11 text-2xl font-extrabold transition ${
                          sign === -1 ? 'bg-rose-400 text-slate-900' : 'bg-slate-950/60 text-rose-300'
                        }`}
                      >
                        −
                      </button>
                    </div>
                    <AmountField
                      inputRef={(el) => (inputs.current[p.id] = el)}
                      enterKeyHint={enterKeyHint}
                      value={p.id in finals ? String(Math.abs(finals[p.id])) : drafts[p.id] ?? ''}
                      onChange={(text) => setNet(p.id, parse(text), sign)}
                      placeholder="סכום"
                    />
                  </>
                ) : (
                  <AmountField
                    enterKeyHint={enterKeyHint}
                    value={p.id in finals ? String(finals[p.id]) : ''}
                    onChange={(text) => onFinal(p.id, parse(text))}
                    placeholder="יוצא עם"
                  />
                )}
              </div>

              {/* Quick results, aligned under the name (avatar 2.75rem + gap 0.5rem). */}
              <div className="mt-2 flex gap-2 ps-[3.25rem]">
                <QuickPill active={net === 0} tone="even" onClick={() => quick(p, 0)}>
                  🤝 מאוזן
                </QuickPill>
                <QuickPill active={net === -totalIn(p)} tone="lost" onClick={() => quick(p, -totalIn(p))}>
                  💀 הפסיד הכל
                </QuickPill>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-0 mt-auto space-y-3 bg-gradient-to-t from-[#0b1120] via-[#0b1120] to-transparent pt-6">
        <div className="flex justify-between rounded-2xl bg-slate-800/70 px-4 py-3 text-sm">
          {endMode === 'net' ? (
            <>
              <span>
                רווחים <b className="text-emerald-300">{formatShekel(gains, { signed: true })}</b>
              </span>
              <span>
                הפסדים <b className="text-rose-300">{formatShekel(losses, { signed: true })}</b>
              </span>
            </>
          ) : (
            <>
              <span>
                נכנס לקופה <b>{formatShekel(potTotal(players))}</b>
              </span>
              <span>
                יוצא <b>{formatShekel(players.reduce((sum, p) => sum + (finals[p.id] ?? 0), 0))}</b>
              </span>
            </>
          )}
        </div>

        {missing === 0 && diff !== 0 && (
          <div className="rounded-2xl bg-amber-300/15 px-4 py-3 text-sm text-amber-200 ring-1 ring-amber-300/30">
            ⚠️ {diff > 0 ? 'הרווחים גדולים מההפסדים' : 'ההפסדים גדולים מהרווחים'} ב־{formatShekel(Math.abs(diff))}.
            <br />
            אפשר לבדוק שוב, או להמשיך – ההפרש ייספג אצל המנצח הגדול.
          </div>
        )}

        <button
          type="button"
          disabled={missing > 0}
          onClick={onSettle}
          className="w-full rounded-2xl bg-emerald-400 py-4 text-lg font-extrabold text-slate-900 shadow-lg shadow-emerald-400/20 transition active:scale-[0.98] disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
        >
          {missing > 0 ? `נשארו ${missing === 1 ? 'שחקן אחד' : `${missing} שחקנים`} למלא` : 'מי מעביר למי 💸'}
        </button>
      </div>
    </div>
  );
}
