import { useRef, useState } from 'react';
import { formatDate, formatShekel } from '../lib/format.js';

const W = 320;
const H = 160;
const PAD = 12;
const DOT = { win: '#34d399', loss: '#fb7185', even: '#94a3b8' };
const dotColor = (net) => (net > 0 ? DOT.win : net < 0 ? DOT.loss : DOT.even);
const signed = (n) => formatShekel(n, { signed: true });

// The running total as one line, a dot per night (green profit, red loss, gray
// break-even), and a dashed zero line. Oldest on the right, newest on the left,
// so time reads in the same direction as the Hebrew text. Tapping (or sliding
// a finger over) the chart picks the nearest night and shows its date and amount.
export default function NetChart({ series }) {
  const svg = useRef(null);
  const [picked, setPicked] = useState(null);
  if (series.length === 0) return null;

  const values = series.map((g) => g.cumulative).concat(0);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const y = (v) => PAD + ((max - v) / span) * (H - 2 * PAD);
  const step = series.length > 1 ? (W - 2 * PAD) / (series.length - 1) : 0;
  // RTL: the first (oldest) night sits at the right edge.
  const x = (i) => (series.length > 1 ? W - PAD - step * i : W / 2);
  const line = series.map((g, i) => `${x(i).toFixed(1)},${y(g.cumulative).toFixed(1)}`).join(' ');
  const last = series[series.length - 1];
  const r = series.length > 40 ? 2.5 : series.length > 20 ? 3 : 4;

  function pick(e) {
    const box = svg.current.getBoundingClientRect();
    const vx = ((e.clientX - box.left) / box.width) * W;
    const i = series.length > 1 ? Math.round((W - PAD - vx) / step) : 0;
    setPicked(Math.max(0, Math.min(series.length - 1, i)));
  }

  const g = picked == null ? null : series[picked];
  return (
    <figure className="rounded-3xl bg-slate-800/70 p-3 ring-1 ring-white/5">
      <figcaption className="mb-1 flex min-h-9 items-center justify-between gap-2 text-xs text-slate-400">
        {g ? (
          <>
            <span className="min-w-0 truncate">
              <b className="text-slate-200">{formatDate(g.endedAt)}</b>
              {g.tableName ? ` · ${g.tableName}` : ''}
            </span>
            <span className="shrink-0 text-end">
              <b className="text-sm" style={{ color: dotColor(g.net) }}>
                {signed(g.net)}
              </b>
              <span className="block text-[11px]">מצטבר {signed(g.cumulative)}</span>
            </span>
          </>
        ) : (
          <>
            <span>רווח/הפסד מצטבר · הקש על הגרף לפרטי ערב</span>
            <span className="shrink-0 font-bold text-slate-200">{signed(last.cumulative)}</span>
          </>
        )}
      </figcaption>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="h-44 w-full touch-pan-y select-none"
        role="img"
        aria-label="גרף רווח והפסד מצטבר לאורך זמן"
        onPointerDown={pick}
        onPointerMove={(e) => e.buttons && pick(e)}
      >
        <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.3)" strokeDasharray="4 4" />
        {g && <line x1={x(picked)} x2={x(picked)} y1={PAD / 2} y2={H - PAD / 2} stroke="rgba(255,255,255,0.25)" />}
        {series.length > 1 && (
          <polyline points={line} fill="none" stroke="#cbd5e1" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.8" />
        )}
        {series.map((s, i) => (
          <circle
            key={s.tableId}
            cx={x(i)}
            cy={y(s.cumulative)}
            r={i === picked ? r + 2.5 : r}
            fill={dotColor(s.net)}
            stroke={i === picked ? '#f8fafc' : '#0f172a'}
            strokeWidth={i === picked ? 2 : 1}
          />
        ))}
      </svg>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>
          {formatDate(series[0].endedAt)} <span className="text-slate-600">(ראשון)</span>
        </span>
        <span aria-hidden className="text-slate-600">הזמן ←</span>
        <span>
          {formatDate(last.endedAt)} <span className="text-slate-600">(אחרון)</span>
        </span>
      </div>
      <div className="mt-1.5 flex justify-center gap-3 text-[11px] text-slate-400">
        <span><span style={{ color: DOT.win }}>●</span> רווח</span>
        <span><span style={{ color: DOT.loss }}>●</span> הפסד</span>
        <span><span style={{ color: DOT.even }}>●</span> מאוזן</span>
      </div>
    </figure>
  );
}
