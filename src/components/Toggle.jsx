// An on/off switch with a label (RTL: the label on the right, the switch on the left).
export default function Toggle({ checked, onChange, label, hint, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-2xl text-start disabled:opacity-60"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{label}</span>
        {hint && <span className="block text-sm text-slate-400">{hint}</span>}
      </span>
      <span
        aria-hidden
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-emerald-400' : 'bg-slate-700'}`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'start-6' : 'start-1'}`}
        />
      </span>
    </button>
  );
}
