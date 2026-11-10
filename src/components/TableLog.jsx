import { describeLog } from '../lib/logText.js';
import { formatTime } from '../lib/format.js';

// The table's change log, newest first. Everyone at the table sees it.
export default function TableLog({ entries, tableName = null, onBack }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="חזרה לשולחן"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xl active:scale-90"
        >
          →
        </button>
        <div>
          <h2 className="text-2xl font-extrabold">יומן השולחן 📜</h2>
          <p className="text-sm text-slate-400">
            {tableName ? `${tableName} · ` : ''}מי שינה מה ומתי · כולם בשולחן רואים
          </p>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-3xl bg-slate-800/70 p-6 text-center text-slate-400">עוד לא קרה כלום בשולחן</p>
      ) : (
        <ol className="divide-y divide-white/5 rounded-3xl bg-slate-800/70 px-4">
          {entries.map((e) => (
            <li key={e.id} className="flex items-baseline gap-3 py-3">
              <span className="flex-1 leading-snug">{describeLog(e)}</span>
              <span className="shrink-0 text-sm tabular-nums text-slate-400">{formatTime(Date.parse(e.created_at))}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
