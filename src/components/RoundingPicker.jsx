import { ROUNDING_UNITS } from '../lib/settlement.js';

// "עיגול סכומים": 1 / 5 / 10 / 50 ₪.
export function roundingLabel(unit) {
  return unit === 1 ? 'מעוגל לשקל' : `מעוגל ל־${unit} ₪`;
}

export default function RoundingPicker({ value, onChange, disabled = false }) {
  return (
    <div className="grid grid-cols-4 gap-1 rounded-2xl bg-slate-950/50 p-1" role="radiogroup" aria-label="עיגול סכומים">
      {ROUNDING_UNITS.map((unit) => (
        <button
          key={unit}
          type="button"
          role="radio"
          aria-checked={value === unit}
          disabled={disabled}
          onClick={() => onChange(unit)}
          className={`rounded-xl py-2.5 font-bold transition ${
            value === unit ? 'bg-slate-100 text-slate-900 shadow' : 'text-slate-400'
          } disabled:cursor-default`}
        >
          {unit} ₪
        </button>
      ))}
    </div>
  );
}
