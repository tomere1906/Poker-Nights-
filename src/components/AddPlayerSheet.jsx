import { useState } from 'react';
import { MAX_REBUY_BUTTONS } from '../lib/game.js';
import { formatShekel } from '../lib/format.js';
import { PALETTE, firstFreeColor } from '../lib/colors.js';
import BottomSheet from './BottomSheet.jsx';
import AmountInput from './AmountInput.jsx';
import Avatar from './Avatar.jsx';
import { initials } from '../lib/game.js';

// people: signed-in users at the table who aren't seated yet (online tables).
// Picking one seats their account; otherwise a guest is added by name.
// usedColors: colors already at the table; a free one is preselected.
// colorOwners: { color: name } so a taken color shows whose it is.
export default function AddPlayerSheet({ settings, people = [], usedColors = [], colorOwners = {}, onAdd, onClose }) {
  // The table's initial buy-in comes first (and is preselected); latecomers
  // who enter with more can pick a re-buy amount or type their own.
  const others = settings.rebuyAmounts.filter((a) => a !== settings.initialBuyIn);
  const choices = [settings.initialBuyIn, ...others].slice(0, MAX_REBUY_BUTTONS);
  const [name, setName] = useState('');
  const [person, setPerson] = useState(null);
  const [amount, setAmount] = useState(settings.initialBuyIn);
  const [color, setColor] = useState(() => firstFreeColor(usedColors));
  const valid = (person || name.trim() !== '') && amount > 0;

  // A signed-in user keeps their own color unless someone at the table already has it.
  function pickPerson(p) {
    const next = person?.userId === p.userId ? null : p;
    setPerson(next);
    setColor(next && !usedColors.includes(next.color) ? next.color : firstFreeColor(usedColors));
  }

  function submit(e) {
    e.preventDefault();
    if (!valid) return;
    onAdd(person ? { name: person.name, amount, color, userId: person.userId } : { name: name.trim(), amount, color });
  }

  return (
    <BottomSheet onClose={onClose} title={<h2 className="mb-4 text-xl font-bold">הוסף שחקן</h2>}>
      <form onSubmit={submit} className="space-y-4">
        {people.length > 0 && (
          <div>
            <p className="mb-2 text-sm text-slate-400">מחוברים לשולחן</p>
            <div className="flex flex-wrap gap-2">
              {people.map((p) => (
                <button
                  key={p.userId}
                  type="button"
                  onClick={() => pickPerson(p)}
                  aria-pressed={person?.userId === p.userId}
                  className={`flex items-center gap-2 rounded-full py-1.5 ps-1.5 pe-3 font-bold transition active:scale-95 ${
                    person?.userId === p.userId ? 'bg-emerald-400 text-slate-900' : 'bg-slate-800 text-slate-200'
                  }`}
                >
                  <Avatar player={p} size="h-8 w-8 text-xs" />
                  {p.name}
                  {p.isMe ? ' (אני)' : ''}
                </button>
              ))}
            </div>
            <p className="mt-3 text-sm text-slate-400">או אורח לפי שם</p>
          </div>
        )}
        <input
          autoFocus={people.length === 0}
          value={person ? '' : name}
          disabled={Boolean(person)}
          onChange={(e) => setName(e.target.value)}
          // A guest's name, not the phone owner's: no contact autofill.
          name="guest-label"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          placeholder={person ? `נבחר: ${person.name}` : 'שם השחקן'}
          maxLength={20}
          className="w-full rounded-2xl bg-slate-800 px-4 py-3 text-lg outline-none ring-2 ring-transparent placeholder:text-slate-500 focus:ring-emerald-400 disabled:opacity-60"
        />
        <div>
          <p className="mb-2 text-sm text-slate-400">צבע בשולחן</p>
          <div className="grid grid-cols-6 gap-2">
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
        <div>
          <p className="mb-2 text-sm text-slate-400">קנייה ראשונה</p>
          <div className="mb-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${choices.length}, 1fr)` }}>
            {choices.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAmount(a)}
                className={`rounded-2xl py-3 text-lg font-bold transition active:scale-95 ${
                  amount === a ? 'bg-amber-300 text-slate-900 shadow-lg shadow-amber-300/20' : 'bg-slate-800 text-slate-200'
                }`}
              >
                {formatShekel(a)}
              </button>
            ))}
          </div>
          <AmountInput value={choices.includes(amount) ? 0 : amount} onChange={setAmount} />
        </div>
        <button
          type="submit"
          disabled={!valid}
          className="w-full rounded-2xl bg-emerald-400 py-4 text-lg font-extrabold text-slate-900 shadow-lg shadow-emerald-400/20 transition active:scale-[0.98] disabled:opacity-40"
        >
          הוסף שחקן
        </button>
      </form>
    </BottomSheet>
  );
}
