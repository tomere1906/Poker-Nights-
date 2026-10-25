import { useState } from 'react';
import { potTotal } from '../lib/game.js';
import { formatShekel } from '../lib/format.js';
import { CardsIcon, ChipIcon } from './Icons.jsx';
import AccountBar from './AccountBar.jsx';

export default function HomeScreen({ state, auth, onOpenProfile, onContinue, onNewTable }) {
  const [confirmNew, setConfirmNew] = useState(false);
  const { tableOpen, players } = state;

  return (
    <div className="flex flex-1 flex-col">
      <AccountBar auth={auth} onOpenProfile={onOpenProfile} />
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="relative mb-6">
          <div className="absolute inset-0 -z-10 rounded-full bg-emerald-500/20 blur-3xl" />
          <CardsIcon className="h-28 w-28 drop-shadow-2xl" />
          <div className="absolute -bottom-2 -start-6 flex -space-x-3 space-x-reverse">
            <ChipIcon className="h-10 w-10 drop-shadow-lg" color="#e11d48" />
            <ChipIcon className="h-10 w-10 drop-shadow-lg" color="#2563eb" />
          </div>
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight">Poker Nights</h1>
        <p className="mt-2 text-slate-400">קניות, תוצאות ומי מעביר למי – בלי מחשבון</p>
      </div>

      <div className="space-y-3">
        {tableOpen ? (
          <>
            <button
              type="button"
              onClick={onContinue}
              className="w-full rounded-3xl bg-emerald-400 py-5 text-xl font-extrabold text-slate-900 shadow-xl shadow-emerald-400/25 transition active:scale-[0.98]"
            >
              חזרה לשולחן 🃏
              <span className="mt-0.5 block text-sm font-medium text-slate-800">
                {players.length === 1 ? 'שחקן אחד' : `${players.length} שחקנים`} · בקופה {formatShekel(potTotal(players))}
              </span>
            </button>
            <button
              type="button"
              onClick={() => (confirmNew ? onNewTable() : setConfirmNew(true))}
              className={`w-full rounded-2xl py-3.5 font-bold transition active:scale-[0.98] ${
                confirmNew ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-200'
              }`}
            >
              {confirmNew ? 'השולחן הנוכחי יימחק – הקש שוב' : 'פתח שולחן חדש'}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onNewTable}
            className="w-full rounded-3xl bg-emerald-400 py-6 text-2xl font-extrabold text-slate-900 shadow-xl shadow-emerald-400/25 transition active:scale-[0.98]"
          >
            פתח שולחן 🃏
          </button>
        )}
      </div>
    </div>
  );
}
