import { useState } from 'react';
import { MAX_REBUY_BUTTONS, initials } from '../lib/game.js';
import { formatShekel } from '../lib/format.js';
import { PALETTE, firstFreeColor } from '../lib/colors.js';
import BottomSheet from './BottomSheet.jsx';
import AmountInput from './AmountInput.jsx';
import Avatar from './Avatar.jsx';
import PlayerName from './PlayerName.jsx';

// "הוסף שחקן" in two steps, so nothing hides behind the keyboard:
// 1. who: people who joined by invite and aren't seated (online tables) as big
//    names, or a guest by name + color. Nothing opens the keyboard by itself.
// 2. the first buy-in: the amount buttons or "סכום אחר", then "הוסף שחקן".
// people: signed-in users at the table who aren't seated yet.
// usedColors: colors already at the table; colorOwners: { color: name } so a
// taken color shows whose it is.
export default function AddPlayerSheet({ settings, people = [], usedColors = [], colorOwners = {}, onAdd, onClose }) {
  // The table's initial buy-in comes first (and is preselected); latecomers
  // who enter with more can pick a re-buy amount or type their own.
  const others = settings.rebuyAmounts.filter((a) => a !== settings.initialBuyIn);
  const choices = [settings.initialBuyIn, ...others].slice(0, MAX_REBUY_BUTTONS);
  const [chosen, setChosen] = useState(null); // step 2: { name, color, userId? }
  const [name, setName] = useState('');
  const [color, setColor] = useState(() => firstFreeColor(usedColors));
  const [amount, setAmount] = useState(settings.initialBuyIn);

  // A signed-in user keeps their own color unless someone at the table already has it.
  function pickPerson(p) {
    setChosen({ name: p.name, userId: p.userId, color: usedColors.includes(p.color) ? firstFreeColor(usedColors) : p.color });
  }

  function pickGuest(e) {
    e.preventDefault();
    if (name.trim()) setChosen({ name: name.trim(), color });
  }

  function submit(e) {
    e.preventDefault();
    if (amount > 0) onAdd({ ...chosen, amount });
  }

  if (chosen) {
    return (
      <BottomSheet
        onClose={onClose}
        title={
          <div className="mb-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setChosen(null)}
              aria-label="חזרה"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-lg active:scale-90"
            >
              →
            </button>
            <Avatar player={chosen} size="h-10 w-10 text-sm" />
            <div className="min-w-0">
              <h2 className="text-xl font-bold">
                <PlayerName name={chosen.name} />
              </h2>
              <p className="text-sm text-slate-400">{chosen.userId ? 'מחובר לשולחן' : 'אורח'} · קנייה ראשונה</p>
            </div>
          </div>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${choices.length}, 1fr)` }}>
            {choices.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAmount(a)}
                className={`rounded-2xl py-4 text-lg font-bold transition active:scale-95 ${
                  amount === a ? 'bg-amber-300 text-slate-900 shadow-lg shadow-amber-300/20' : 'bg-slate-800 text-slate-200'
                }`}
              >
                {formatShekel(a)}
              </button>
            ))}
          </div>
          <AmountInput value={choices.includes(amount) ? 0 : amount} onChange={setAmount} />
          <button
            type="submit"
            disabled={amount <= 0}
            className="w-full rounded-2xl bg-emerald-400 py-4 text-lg font-extrabold text-slate-900 shadow-lg shadow-emerald-400/20 transition active:scale-[0.98] disabled:opacity-40"
          >
            הוסף שחקן · {formatShekel(amount)}
          </button>
        </form>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet onClose={onClose} title={<h2 className="mb-4 text-xl font-bold">הוסף שחקן</h2>}>
      <div className="space-y-5">
        {people.length > 0 && (
          <section>
            <p className="mb-2 text-sm text-slate-400">הצטרפו בהזמנה ועוד לא יושבים</p>
            <div className="space-y-2">
              {people.map((p) => (
                <button
                  key={p.userId}
                  type="button"
                  onClick={() => pickPerson(p)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-slate-800 p-3 text-start text-lg font-bold transition active:scale-[0.98]"
                >
                  <Avatar player={p} size="h-11 w-11 text-base" />
                  <span className="min-w-0 flex-1">
                    <PlayerName name={p.name} />
                    {p.isMe && <span className="text-sm font-medium text-slate-400"> (אני)</span>}
                  </span>
                  <span className="text-slate-500">←</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <form onSubmit={pickGuest} className="space-y-3">
          <p className="text-sm text-slate-400">{people.length > 0 ? 'או הוסף אורח' : 'אורח לפי שם'}</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            // A guest's name, not the phone owner's: no contact autofill.
            name="guest-label"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            placeholder="שם האורח"
            maxLength={20}
            className="w-full rounded-2xl bg-slate-800 px-4 py-3 text-lg outline-none ring-2 ring-transparent placeholder:text-slate-500 focus:ring-emerald-400"
          />
          <div>
            <p className="mb-2 text-sm text-slate-400">צבע בשולחן</p>
            <div className="grid grid-cols-6 gap-2 pt-1">
              {PALETTE.map((c, i) => {
                const taken = usedColors.includes(i);
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => setColor(i)}
                    aria-label={`${c.name}${taken ? ` (תפוס${colorOwners[i] ? ` – ${colorOwners[i]}` : ''})` : ''}`}
                    aria-pressed={color === i}
                    className={`relative h-10 rounded-xl bg-gradient-to-br ${c.gradient} transition active:scale-90 ${
                      color === i ? 'ring-[3px] ring-white' : taken ? 'opacity-45 saturate-50' : 'opacity-90'
                    }`}
                  >
                    {color === i ? (
                      <span className={`text-lg font-extrabold ${c.text}`}>✓</span>
                    ) : (
                      taken && (
                        // Taken: whose it is, and a small ✕ in the corner.
                        <>
                          <span className={`text-sm font-extrabold ${c.text}`}>{colorOwners[i] ? initials(colorOwners[i]) : ''}</span>
                          <span className="absolute -end-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-950 text-[9px] font-bold text-slate-300 ring-1 ring-white/20">
                            ✕
                          </span>
                        </>
                      )
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full rounded-2xl bg-emerald-400 py-4 text-lg font-extrabold text-slate-900 shadow-lg shadow-emerald-400/20 transition active:scale-[0.98] disabled:opacity-40"
          >
            המשך לקנייה ראשונה ←
          </button>
        </form>
      </div>
    </BottomSheet>
  );
}
