import { useMemo, useState } from 'react';
import { settle } from '../lib/settlement.js';
import { netOf } from '../lib/game.js';
import { formatShekel } from '../lib/format.js';
import Avatar from './Avatar.jsx';

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API needs HTTPS; fall back for plain-http LAN use.
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

function buildText(transfers, nets, nameOf) {
  const lines = ['🃏 Poker Nights – מי מעביר למי', ''];
  if (transfers.length === 0) lines.push('כולם יצאו מאוזנים 🤝');
  for (const t of transfers) lines.push(`${nameOf(t.from)} ← ${nameOf(t.to)}: ${formatShekel(t.amount)}`);
  lines.push('', 'תוצאות:');
  for (const e of [...nets].sort((a, b) => b.net - a.net)) {
    lines.push(`${e.net > 0 ? '🟢' : e.net < 0 ? '🔴' : '⚪'} ${nameOf(e.id)}: ${formatShekel(e.net, { signed: true })}`);
  }
  return lines.join('\n');
}

export default function Settlement({ state, onBack, onNewGame }) {
  const [copied, setCopied] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);

  const { players } = state;
  const byId = new Map(players.map((p) => [p.id, p]));
  const nameOf = (id) => byId.get(id).name;
  const { nets, transfers } = useMemo(
    () => settle(players.map((p) => ({ id: p.id, net: netOf(state, p) ?? 0 }))),
    [state]
  );

  async function copy() {
    if (await copyText(buildText(transfers, nets, nameOf))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="חזרה"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-800 text-xl active:scale-90"
        >
          →
        </button>
        <h2 className="text-2xl font-extrabold">מי מעביר למי 💸</h2>
      </div>

      {transfers.length === 0 ? (
        <p className="rounded-3xl bg-slate-800/70 p-6 text-center text-lg">כולם יצאו מאוזנים 🤝</p>
      ) : (
        <ul className="space-y-2">
          {transfers.map((t, i) => (
            <li
              key={i}
              className="animate-pop-in flex items-center gap-2 rounded-3xl bg-slate-800/70 p-3 shadow-lg ring-1 ring-white/5"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Avatar player={byId.get(t.from)} size="h-10 w-10 text-sm" />
                <span className="truncate font-bold">{nameOf(t.from)}</span>
              </div>
              <div className="flex shrink-0 flex-col items-center px-1">
                <span className="text-lg font-extrabold text-amber-300">{formatShekel(t.amount)}</span>
                <span className="-mt-1 text-xl leading-none text-slate-400">←</span>
              </div>
              <div className="flex min-w-0 flex-1 flex-row-reverse items-center gap-2">
                <Avatar player={byId.get(t.to)} size="h-10 w-10 text-sm" />
                <span className="truncate font-bold">{nameOf(t.to)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-6 mb-2 text-sm font-medium text-slate-400">תוצאות הערב</h3>
      <div className="flex flex-wrap gap-2">
        {[...nets]
          .sort((a, b) => b.net - a.net)
          .map((e) => (
            <span
              key={e.id}
              className={`rounded-full px-3 py-1.5 text-sm font-bold ${
                e.net > 0 ? 'bg-emerald-400/15 text-emerald-300' : e.net < 0 ? 'bg-rose-400/15 text-rose-300' : 'bg-white/10 text-slate-300'
              }`}
            >
              {nameOf(e.id)} {formatShekel(e.net, { signed: true })}
            </span>
          ))}
      </div>

      <div className="mt-auto space-y-2 pt-6">
        <button
          type="button"
          onClick={copy}
          className="w-full rounded-2xl bg-emerald-400 py-4 text-lg font-extrabold text-slate-900 shadow-lg shadow-emerald-400/20 transition active:scale-[0.98]"
        >
          {copied ? 'הועתק! ✓' : 'העתק לוואטסאפ 📋'}
        </button>
        <button
          type="button"
          onClick={() => (confirmNew ? onNewGame() : setConfirmNew(true))}
          className={`w-full rounded-2xl py-3.5 font-bold transition active:scale-[0.98] ${
            confirmNew ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-200'
          }`}
        >
          {confirmNew ? 'בטוח? כל הנתונים יימחקו – הקש שוב' : 'משחק חדש 🃏'}
        </button>
      </div>
    </div>
  );
}
