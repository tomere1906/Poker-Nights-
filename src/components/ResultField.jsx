import { useEffect, useRef, useState } from 'react';
import { DEFAULT_CHIP_VALUE, shekelsToChips } from '../lib/game.js';
import { formatCount, formatShekel, parseAmount } from '../lib/format.js';
import { RESULT_UNITS, netText, resultShekels, resultShown as shown } from '../lib/result.js';

// One field for a player's result, with a small "רווח/הפסד / צ׳יפים / כסף" selector
// above it and the other forms under it. shekels: what they leave with (₪ or null);
// onChange(₪ | null). unit / onUnit: the chosen input style (kept by the parent).
// Converting uses the chip value and the player's total buy-ins.
export default function ResultField({
  totalIn,
  chipValue = DEFAULT_CHIP_VALUE,
  shekels,
  onChange,
  unit,
  onUnit,
  autoFocus = false,
  enterKeyHint,
}) {
  const [text, setText] = useState(() => {
    const s = shown(shekels, unit, totalIn, chipValue);
    return s.amount === null ? '' : String(s.amount);
  });
  const [sign, setSign] = useState(() => shown(shekels, unit, totalIn, chipValue).sign);
  // The last value sent up: a change from elsewhere (a quick button, another
  // manager's phone) redraws the field; our own echo doesn't.
  const sent = useRef(shekels);
  // While the field is being typed in, outside changes wait until it's left
  // (so a player who left can't have their exit "cleared" mid-typing).
  const typing = useRef(false);

  function redraw(value) {
    sent.current = value;
    const s = shown(value, unit, totalIn, chipValue);
    setText(s.amount === null ? '' : String(s.amount));
    if (value !== null) setSign(s.sign);
  }

  useEffect(() => {
    if (shekels === sent.current || typing.current) return;
    redraw(shekels);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shekels, unit, totalIn, chipValue]);

  const amount = text.trim() === '' ? null : parseAmount(text);
  const computed = resultShekels(amount, sign, unit, totalIn, chipValue);
  const tooBig = computed !== null && computed < 0;

  function send(value) {
    const next = value !== null && value < 0 ? null : value;
    sent.current = next;
    onChange(next);
  }

  function type(value) {
    setText(value);
    const a = value.trim() === '' ? null : parseAmount(value);
    send(resultShekels(a, sign, unit, totalIn, chipValue));
  }

  function chooseSign(next) {
    setSign(next);
    send(resultShekels(amount, next, unit, totalIn, chipValue));
  }

  // Switching the style keeps the same money and redraws the field in the new terms.
  function chooseUnit(next) {
    if (next === unit) return;
    if (shekels !== null) {
      const s = shown(shekels, next, totalIn, chipValue);
      setText(s.amount === null ? '' : String(s.amount));
      setSign(s.sign);
    } else if (next !== 'net') {
      setSign(null);
    }
    onUnit(next);
  }

  // The other forms, small under the field.
  let hint = null;
  if (tooBig) hint = <span className="text-rose-300">אי אפשר להפסיד יותר מ־{formatShekel(totalIn)} שנכנסו</span>;
  else if (unit === 'net' && amount > 0 && !sign) hint = <span className="font-bold text-amber-300">פלוס או מינוס?</span>;
  else if (computed !== null) {
    const parts = [];
    if (unit !== 'shekels') parts.push(`יצא עם ${formatShekel(computed)}`);
    if (unit !== 'chips' && chipValue !== DEFAULT_CHIP_VALUE) parts.push(`${formatCount(shekelsToChips(computed, chipValue))} צ׳יפים`);
    if (unit !== 'net') parts.push(netText(computed - totalIn));
    hint = <span>= {parts.join(' · ')}</span>;
  }

  const signButton = (value, label, on) => (
    <button
      type="button"
      onClick={() => chooseSign(value)}
      aria-label={value > 0 ? 'פלוס' : 'מינוס'}
      aria-pressed={sign === value}
      className={`w-10 rounded-xl text-2xl font-extrabold leading-none transition active:scale-95 ${
        sign === value ? on : 'text-slate-300'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1 rounded-full bg-slate-950/50 p-0.5 ring-1 ring-white/10" role="group" aria-label="איך הוא מספר">
        {RESULT_UNITS.map((u) => (
          <button
            key={u.id}
            type="button"
            aria-pressed={unit === u.id}
            onClick={() => chooseUnit(u.id)}
            className={`h-8 flex-1 rounded-full px-2 text-xs font-bold transition ${
              unit === u.id ? 'bg-emerald-400 text-slate-900' : 'text-slate-400'
            }`}
          >
            {u.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        {unit === 'net' && (
          // One rounded pill as tall as the field, with two rounded buttons inside.
          <div
            className={`flex shrink-0 gap-1 rounded-2xl bg-slate-950/60 p-1 ring-2 ${
              amount > 0 && !sign ? 'ring-amber-300' : 'ring-transparent'
            }`}
          >
            {signButton(1, '+', 'bg-emerald-400 text-slate-900')}
            {signButton(-1, '−', 'bg-rose-400 text-slate-900')}
          </div>
        )}
        <div className="relative min-w-0 flex-1">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            autoFocus={autoFocus}
            enterKeyHint={enterKeyHint}
            value={text}
            onChange={(e) => type(e.target.value)}
            onFocus={() => (typing.current = true)}
            onBlur={() => {
              typing.current = false;
              if (shekels !== sent.current) redraw(shekels);
            }}
            placeholder={unit === 'chips' ? 'כמה צ׳יפים' : unit === 'shekels' ? 'כמה ₪ ביד' : 'כמה ברווח / בהפסד'}
            className={`w-full rounded-2xl bg-slate-950/60 px-4 py-3 ${unit === 'chips' ? 'pe-16' : 'pe-10'} text-lg font-bold outline-none ring-2 placeholder:text-sm placeholder:font-normal placeholder:text-slate-500 focus:ring-emerald-400 ${
              tooBig ? 'ring-rose-400' : 'ring-transparent'
            }`}
          />
          <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm text-slate-400">
            {unit === 'chips' ? 'צ׳יפים' : '₪'}
          </span>
        </div>
      </div>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
