import { useState } from 'react';
import { MAX_REBUY_BUTTONS, MIN_REBUY_BUTTONS, cleanSettings } from '../lib/game.js';
import AmountInput from './AmountInput.jsx';

function Plain({ title, hint, children }) {
  return (
    <section>
      <p className="text-sm font-bold text-slate-300">{title}</p>
      {hint && <p className="mb-2 text-xs text-slate-500">{hint}</p>}
      {children}
    </section>
  );
}

export function amountsValid(initialBuyIn, amounts) {
  const distinct = new Set(amounts.filter((a) => a > 0));
  return initialBuyIn > 0 && amounts.every((a) => a > 0) && distinct.size >= MIN_REBUY_BUTTONS;
}

// The initial buy-in + the 2-4 re-buy buttons. Wrap: the section frame (a card
// on the setup screen, plain inside a sheet).
export default function AmountsEditor({ initialBuyIn, amounts, onInitialChange, onAmountsChange, Wrap = Plain }) {
  const distinct = new Set(amounts.filter((a) => a > 0));
  const allFilled = initialBuyIn > 0 && amounts.every((a) => a > 0);
  const preview = [...distinct].sort((a, b) => a - b);
  const setAmount = (i, value) => onAmountsChange(amounts.map((a, j) => (j === i ? value : a)));

  return (
    <>
      <Wrap title="כניסה ראשונה" hint="כל שחקן חדש ייכנס בסכום הזה (אפשר לשנות לשחקן מסוים)">
        <AmountInput value={initialBuyIn} onChange={onInitialChange} placeholder="סכום" />
      </Wrap>

      <Wrap title="כפתורי קנייה חוזרת" hint={`${MIN_REBUY_BUTTONS}–${MAX_REBUY_BUTTONS} כפתורים. ״סכום אחר״ תמיד זמין בנוסף.`}>
        <div className="space-y-2">
          {amounts.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex-1">
                <AmountInput value={a} onChange={(v) => setAmount(i, v)} placeholder="סכום" />
              </div>
              {amounts.length > MIN_REBUY_BUTTONS && (
                <button
                  type="button"
                  onClick={() => onAmountsChange(amounts.filter((_, j) => j !== i))}
                  aria-label="הסר כפתור"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950/60 text-xl text-slate-400 active:scale-90"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
        {amounts.length < MAX_REBUY_BUTTONS && (
          <button
            type="button"
            onClick={() => onAmountsChange([...amounts, 0])}
            className="mt-2 w-full rounded-2xl border-2 border-dashed border-white/15 py-3 font-bold text-slate-300 active:scale-[0.98]"
          >
            + הוסף כפתור
          </button>
        )}

        {preview.length > 0 && (
          <>
            <p className="mt-4 mb-2 text-xs text-slate-500">כך זה ייראה:</p>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${preview.length}, 1fr)` }}>
              {preview.map((a) => (
                <span
                  key={a}
                  dir="ltr"
                  className="rounded-2xl bg-amber-300 py-3 text-center text-lg font-extrabold text-slate-900 shadow-lg shadow-amber-300/20"
                >
                  +{a}
                </span>
              ))}
            </div>
          </>
        )}
        {allFilled && distinct.size < MIN_REBUY_BUTTONS && (
          <p className="mt-3 text-sm text-amber-300">צריך לפחות {MIN_REBUY_BUTTONS} סכומים שונים</p>
        )}
      </Wrap>
    </>
  );
}

// During the game (local ⚙️ and online ⚙️): edit, then "שמור סכומים".
// onSave({ initialBuyIn, rebuyAmounts }) may be async.
export function AmountsForm({ settings, onSave }) {
  const [initialBuyIn, setInitialBuyIn] = useState(settings.initialBuyIn);
  const [amounts, setAmounts] = useState(settings.rebuyAmounts);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const next = cleanSettings({ initialBuyIn, rebuyAmounts: amounts, rounding: settings.rounding });
  const changed =
    next.initialBuyIn !== settings.initialBuyIn || next.rebuyAmounts.join() !== settings.rebuyAmounts.join();
  const valid = amountsValid(initialBuyIn, amounts);

  return (
    <div className="space-y-4">
      <AmountsEditor
        initialBuyIn={initialBuyIn}
        amounts={amounts}
        onInitialChange={(v) => {
          setInitialBuyIn(v);
          setSaved(false);
        }}
        onAmountsChange={(list) => {
          setAmounts(list);
          setSaved(false);
        }}
      />
      <button
        type="button"
        disabled={!valid || !changed || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onSave({ initialBuyIn: next.initialBuyIn, rebuyAmounts: next.rebuyAmounts });
            setAmounts(next.rebuyAmounts);
            setSaved(true);
          } catch {
            // The caller shows the error; the edits stay so they can retry.
          } finally {
            setBusy(false);
          }
        }}
        className="w-full rounded-2xl bg-emerald-400 py-3 font-bold text-slate-900 active:scale-[0.98] disabled:bg-slate-800 disabled:text-slate-500"
      >
        {busy ? 'שומר…' : saved && !changed ? 'הסכומים נשמרו ✓' : 'שמור סכומים'}
      </button>
    </div>
  );
}
