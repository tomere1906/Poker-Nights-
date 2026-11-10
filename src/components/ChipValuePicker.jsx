import { useState } from 'react';
import { CHIP_VALUES, MAX_CHIP_VALUE, MIN_CHIP_VALUE, cleanChipValue } from '../lib/game.js';

// "שווי צ'יפ": how many ₪ one chip is worth. Quick values, or "אחר" for any
// amount (e.g. 0.2). Buy-ins stay in ₪; only chip counts at the end are converted.
export default function ChipValuePicker({ value, onChange, disabled = false }) {
  const preset = CHIP_VALUES.includes(value);
  const [custom, setCustom] = useState(!preset);
  const [text, setText] = useState(preset ? '' : String(value));
  const typed = Number(text);
  const valid = typed >= MIN_CHIP_VALUE && typed <= MAX_CHIP_VALUE;
  const option = (active) =>
    `rounded-xl py-2.5 font-bold transition ${active ? 'bg-slate-100 text-slate-900 shadow' : 'text-slate-400'} disabled:cursor-default`;

  return (
    <div>
      <div className="grid grid-cols-5 gap-1 rounded-2xl bg-slate-950/50 p-1" role="radiogroup" aria-label="שווי צ׳יפ">
        {CHIP_VALUES.map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={!custom && value === v}
            disabled={disabled}
            onClick={() => {
              setCustom(false);
              if (v !== value) onChange(v);
            }}
            className={option(!custom && value === v)}
          >
            <span dir="ltr">{v}</span> ₪
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={custom}
          disabled={disabled}
          onClick={() => setCustom(true)}
          className={option(custom)}
        >
          אחר
        </button>
      </div>
      {custom && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onChange(cleanChipValue(typed));
          }}
        >
          <div className="relative flex-1">
            <input
              type="text"
              inputMode="decimal"
              dir="ltr"
              disabled={disabled}
              value={text}
              onChange={(e) => setText(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))}
              placeholder="0.2"
              className="w-full rounded-2xl bg-slate-950/60 px-4 py-3 pe-10 text-end text-lg outline-none ring-2 ring-transparent placeholder:text-slate-500 focus:ring-emerald-400"
            />
            <span className="pointer-events-none absolute inset-y-0 end-4 flex items-center text-slate-400">₪</span>
          </div>
          <button
            type="submit"
            disabled={disabled || !valid || cleanChipValue(typed) === value}
            className="rounded-2xl bg-emerald-400 px-4 font-bold text-slate-900 active:scale-95 disabled:bg-slate-800 disabled:text-slate-500"
          >
            אישור
          </button>
        </form>
      )}
    </div>
  );
}
