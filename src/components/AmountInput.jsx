import { parseAmount } from '../lib/format.js';

export default function AmountInput({ value, onChange, placeholder = 'סכום אחר', autoFocus }) {
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        autoFocus={autoFocus}
        value={value || ''}
        onChange={(e) => onChange(parseAmount(e.target.value))}
        placeholder={placeholder}
        className="w-full rounded-2xl bg-slate-800 px-4 py-3 pe-10 text-lg outline-none ring-2 ring-transparent placeholder:text-slate-500 focus:ring-emerald-400"
      />
      <span className="pointer-events-none absolute inset-y-0 end-4 flex items-center text-slate-400">₪</span>
    </div>
  );
}
