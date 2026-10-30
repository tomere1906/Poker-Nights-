import { useState } from 'react';
import { cleanSettings } from '../lib/game.js';
import { MAX_TABLE_NAME, cleanTableName } from '../lib/onlineTable.js';
import AmountsEditor, { amountsValid } from './AmountsEditor.jsx';
import RoundingPicker from './RoundingPicker.jsx';
import Toggle from './Toggle.jsx';

function Card({ title, hint, children }) {
  return (
    <section className="rounded-3xl bg-slate-800/70 p-4 shadow-lg ring-1 ring-white/5">
      <h3 className="font-bold">{title}</h3>
      {hint && <p className="mb-3 text-sm text-slate-400">{hint}</p>}
      {children}
    </section>
  );
}

const BUY_IN_MODES = [
  { id: 'managers', title: 'רק מנהלים', hint: 'רק אתה והמנהלים המשותפים מוסיפים כניסות' },
  { id: 'self_add', title: 'כל אחד את שלו', hint: 'כל שחקן יכול גם להוסיף כניסות לעצמו. תיקונים רק אצל המנהלים' },
];

// online: an online table also has an optional name and chooses who adds
// buy-ins. onOpen(settings, buyInMode, name).
export default function TableSetup({ defaults, online = false, onBack, onOpen }) {
  const [initialBuyIn, setInitialBuyIn] = useState(defaults.initialBuyIn);
  const [amounts, setAmounts] = useState(defaults.rebuyAmounts);
  const [buyInMode, setBuyInMode] = useState('managers');
  const [name, setName] = useState('');
  const [rounding, setRounding] = useState(defaults.rounding);
  const [sheep, setSheep] = useState(defaults.sheep !== false);
  const [busy, setBusy] = useState(false);

  const valid = amountsValid(initialBuyIn, amounts);

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
        <h2 className="text-2xl font-extrabold">{online ? 'שולחן אונליין 🌐' : 'שולחן מקומי 📱'}</h2>
      </div>

      <div className="space-y-3">
        {online && (
          <Card title="שם השולחן" hint="לא חובה. יופיע בשולחן, בהזמנה וביומן">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_TABLE_NAME}
              placeholder="למשל: שישי אצל אסף"
              className="w-full rounded-2xl bg-slate-950/60 px-4 py-3 text-lg outline-none ring-2 ring-transparent placeholder:text-base placeholder:text-slate-500 focus:ring-emerald-400"
            />
          </Card>
        )}

        <AmountsEditor
          initialBuyIn={initialBuyIn}
          amounts={amounts}
          onInitialChange={setInitialBuyIn}
          onAmountsChange={setAmounts}
          Wrap={Card}
        />

        <Card title="עיגול סכומים" hint="התוצאות וההעברות יעוגלו לסכום הזה, כדי שיהיה נוח להעביר">
          <RoundingPicker value={rounding} onChange={setRounding} />
        </Card>

        <section className="rounded-3xl bg-slate-800/70 p-4 shadow-lg ring-1 ring-white/5">
          <Toggle checked={sheep} onChange={setSheep} label="🐑 כבש הערב" hint="כבש ליד מי שהפסיד הכי הרבה בתוצאות הערב" />
        </section>

        {online && (
          <Card title="מי מוסיף כניסות?" hint="אפשר לשנות גם אחר כך, בניהול השולחן">
            <div className="space-y-2">
              {BUY_IN_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setBuyInMode(m.id)}
                  aria-pressed={buyInMode === m.id}
                  className={`w-full rounded-2xl p-3 text-start transition active:scale-[0.99] ${
                    buyInMode === m.id ? 'bg-emerald-400/15 ring-2 ring-emerald-400' : 'bg-slate-950/40'
                  }`}
                >
                  <span className="block font-bold">
                    {buyInMode === m.id ? '● ' : '○ '}
                    {m.title}
                  </span>
                  <span className="block text-sm text-slate-400">{m.hint}</span>
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>

      <div className="mt-auto pt-6">
        <button
          type="button"
          disabled={!valid || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onOpen(cleanSettings({ initialBuyIn, rebuyAmounts: amounts, rounding, sheep }), buyInMode, cleanTableName(name));
            } finally {
              setBusy(false);
            }
          }}
          className="w-full rounded-3xl bg-emerald-400 py-5 text-xl font-extrabold text-slate-900 shadow-xl shadow-emerald-400/25 transition active:scale-[0.98] disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
        >
          פתח שולחן 🃏
        </button>
      </div>
    </div>
  );
}
