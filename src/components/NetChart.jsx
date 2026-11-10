import { formatDate, formatShekel } from '../lib/format.js';

const W = 320;
const H = 160;
const PAD = 10;

// Net per night (green/red bars) and the running total (line), oldest on the
// right so time reads in the same direction as the Hebrew text.
export default function NetChart({ series }) {
  if (series.length === 0) return null;
  const values = series.flatMap((g) => [g.net, g.cumulative, 0]);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const y = (v) => PAD + ((max - v) / span) * (H - 2 * PAD);
  const step = (W - 2 * PAD) / series.length;
  // RTL: the first (oldest) game sits at the right edge.
  const x = (i) => W - PAD - step * (i + 0.5);
  const bar = Math.max(2, Math.min(28, step * 0.6));
  const line = series.map((g, i) => `${x(i).toFixed(1)},${y(g.cumulative).toFixed(1)}`).join(' ');
  const last = series[series.length - 1];

  return (
    <figure className="rounded-3xl bg-slate-800/70 p-3 ring-1 ring-white/5">
      <figcaption className="mb-1 flex items-center justify-between text-xs text-slate-400">
        <span>רווח/הפסד לכל ערב · והמצטבר</span>
        <span className="font-bold text-slate-200">{formatShekel(last.cumulative, { signed: true })}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" role="img" aria-label="גרף רווח והפסד לאורך זמן">
        <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" />
        {series.map((g, i) => (
          <rect
            key={g.tableId}
            x={x(i) - bar / 2}
            width={bar}
            y={Math.min(y(g.net), y(0))}
            height={Math.max(1, Math.abs(y(g.net) - y(0)))}
            rx={Math.min(4, bar / 2)}
            fill={g.net >= 0 ? '#34d399' : '#fb7185'}
            opacity="0.85"
          >
            <title>{`${g.tableName ?? formatDate(g.endedAt)}: ${formatShekel(g.net, { signed: true })}`}</title>
          </rect>
        ))}
        {series.length > 1 && <polyline points={line} fill="none" stroke="#fcd34d" strokeWidth="2.5" strokeLinejoin="round" />}
        {series.map((g, i) => (
          <circle key={g.tableId} cx={x(i)} cy={y(g.cumulative)} r="2.5" fill="#fcd34d" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
        <span>{formatDate(series[0].endedAt)}</span>
        <span>{formatDate(last.endedAt)}</span>
      </div>
    </figure>
  );
}
