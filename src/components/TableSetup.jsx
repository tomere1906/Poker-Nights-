import { useState } from 'react';
import { MAX_REBUY_BUTTONS, MIN_REBUY_BUTTONS, cleanSettings } from '../lib/game.js';
import AmountInput from './AmountInput.jsx';

function Card({ title, hint, children }) {
  return (
    <section className="rounded-3xl bg-slate-800/70 p-4 shadow-lg ring-1 ring-white/5">
      <h3 className="font-bold">{title}</h3>
      {hint && <p className="mb-3 text-sm text-slate-400">{hint}</p>}
      {children}
    </section>
  );
}

export default function TableSetup({ defaults, onBack, onOpen }) {
  const [initialBuyIn, setInitialBuyIn] = useState(defaults.initialBuyIn);
  const [amounts, setAmounts] = useState(defaults.rebuyAmounts);

  const distinct = new Set(amounts.filter((a) => a > 0));
  const allFilled = initialBuyIn > 0 && amounts.every((a) => a > 0);
  const valid = allFilled && distinct.size >= MIN_REBUY_BUTTONS;
  const preview = [...distinct].sort((a, b) => a - b);

  const setAmount = (i, value) => setAmounts((list) => list.map((a, j) => (j === i ? value : a)));

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="חזרה"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xl active:scale-90"
        >
          →
        </button>
        <h2 className="text-2xl font-extrabold">הגדרות שולחן</h2>
      </div>

      <div className="space-y-3">
        <Card title="כניסה ראשונה" hint="כל שחקן חדש ייכנס בסכום הזה (אפשר לשנות לשחקן מסוים)">
          <AmountInput value={initialBuyIn} onChange={setInitialBuyIn} placeholder="סכום" />
        </Card>

        <Card title="כפתורי קנייה חוזרת" hint={`${MIN_REBUY_BUTTONS}–${MAX_REBUY_BUTTONS} כפתורים. ״סכום אחר״ תמיד זמין בנוסף.`}>
          <div className="space-y-2">
            {amounts.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1">
                  <AmountInput value={a} onChange={(v) => setAmount(i, v)} placeholder="סכום" />
                </div>
                {amounts.length > MIN_REBUY_BUTTONS && (
                  <button
                    type="button"
                    onClick={() => setAmounts((list) => list.filter((_, j) => j !== i))}
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
              onClick={() => setAmounts((list) => [...list, 0])}
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
        </Card>
      </div>

      <div className="mt-auto pt-6">
        <button
          type="button"
          disabled={!valid}
          onClick={() => onOpen(cleanSettings({ initialBuyIn, rebuyAmounts: amounts }))}
          className="w-full rounded-3xl bg-emerald-400 py-5 text-xl font-extrabold text-slate-900 shadow-xl shadow-emerald-400/25 transition active:scale-[0.98] disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
        >
          פתח שולחן 🃏
        </button>
      </div>
    </div>
  );
}
