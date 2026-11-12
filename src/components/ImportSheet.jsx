import { useMemo, useState } from 'react';
import {
  TEMPLATE_CSV,
  buildImport,
  clean,
  findHeader,
  formatDay,
  guessColumns,
  overlaps,
  parseCsv,
  readXlsx,
} from '../lib/importFile.js';
import { formatShekel } from '../lib/format.js';
import BottomSheet from './BottomSheet.jsx';

const tone = (n) => (n > 0 ? 'text-emerald-300' : n < 0 ? 'text-rose-300' : 'text-slate-200');
const PRIMARY = 'w-full rounded-2xl bg-emerald-400 py-3.5 font-extrabold text-slate-900 transition active:scale-[0.98] disabled:opacity-40';
const SECONDARY = 'w-full rounded-2xl bg-slate-800 py-3 font-bold text-slate-200 transition active:scale-[0.98]';

// CSV from Excel in Hebrew is often windows-1255, not UTF-8.
function decode(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1255').decode(buffer);
  }
}

async function readRows(file) {
  const buffer = await file.arrayBuffer();
  if (/\.xlsx$/i.test(file.name)) return readXlsx(buffer);
  if (/\.(xls|numbers|ods)$/i.test(file.name)) throw new Error('old-format');
  return parseCsv(decode(buffer));
}

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'poker-nights-template.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Pick({ onRows }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function choose(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const rows = await readRows(file);
      if (!rows.some((r) => r.some((c) => clean(c)))) throw new Error('empty');
      onRows(rows, file.name);
    } catch (err) {
      setError(
        err.message === 'old-format'
          ? 'הקובץ בפורמט ישן. שמור אותו ב־Excel כ־.xlsx או כ־CSV ונסה שוב.'
          : err.message === 'empty'
            ? 'הקובץ ריק.'
            : 'לא הצלחנו לקרוא את הקובץ. נסה לשמור אותו כ־CSV.'
      );
    }
    setBusy(false);
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-300">
        קובץ CSV או Excel (.xlsx), שורה לכל ערב: <b>תאריך</b>, <b>רווח/הפסד בש״ח</b> (+ או −) ו<b>הערה</b> (לא חובה).
        שורת ״סה״כ״ מדולגת אוטומטית.
      </p>
      <label className={`${PRIMARY} block cursor-pointer text-center ${busy ? 'opacity-60' : ''}`}>
        {busy ? 'קורא…' : '📂 בחר קובץ'}
        <input
          type="file"
          accept=".csv,.xlsx,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={choose}
          disabled={busy}
        />
      </label>
      {error && <p className="rounded-2xl bg-rose-500/15 p-3 text-sm text-rose-200">{error}</p>}
      <button type="button" onClick={downloadTemplate} className={SECONDARY}>
        ⬇️ הורד תבנית CSV
      </button>
      <p className="text-xs text-slate-500">המשחקים המיובאים נספרים רק בסטטיסטיקה האישית שלך, מסומנים ״מיובא״, ולא מופיעים ב״החבר׳ה שלי״. רק אתה רואה אותם.</p>
    </div>
  );
}

function ColumnSelect({ label, value, onChange, header, sample, optional }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-slate-300">
        {label} {optional && <span className="font-normal text-slate-500">(לא חובה)</span>}
      </span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="w-full rounded-2xl bg-slate-800 px-3 py-3 text-base text-slate-100 ring-1 ring-white/10"
      >
        <option value="">{optional ? 'בלי' : 'בחר עמודה'}</option>
        {header.map((h, i) => (
          <option key={i} value={i}>
            {h}
            {clean(sample?.[i]) ? ` (למשל: ${clean(sample[i]).slice(0, 20)})` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

function Mapping({ header, sample, columns, setColumns, onNext }) {
  const ready = columns.date != null && columns.net != null && columns.date !== columns.net;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">איזו עמודה היא מה? ניחשנו לפי הכותרות, אפשר לשנות.</p>
      <ColumnSelect label="📅 תאריך" value={columns.date} onChange={(date) => setColumns({ ...columns, date })} header={header} sample={sample} />
      <ColumnSelect label="💰 רווח/הפסד (₪)" value={columns.net} onChange={(net) => setColumns({ ...columns, net })} header={header} sample={sample} />
      <ColumnSelect label="📝 הערה" value={columns.note} onChange={(note) => setColumns({ ...columns, note })} header={header} sample={sample} optional />
      <button type="button" onClick={onNext} disabled={!ready} className={PRIMARY}>
        המשך לתצוגה מקדימה ←
      </button>
    </div>
  );
}

function Note({ warn, children }) {
  return <li className={`rounded-xl px-3 py-2 text-sm ${warn ? 'bg-amber-300/10 text-amber-100' : 'bg-slate-800/70 text-slate-300'}`}>{children}</li>;
}

const dayList = (days) => days.slice(0, 6).map(formatDay).join(', ') + (days.length > 6 ? ` ועוד ${days.length - 6}` : '');

function Preview({ result, dup, saving, onBack, onSave }) {
  const { count, sum, from, to } = result;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-slate-800/70 p-3">
          <p className="text-xs text-slate-400">משחקים</p>
          <p className="text-2xl font-extrabold">{count}</p>
        </div>
        <div className="col-span-2 rounded-2xl bg-slate-800/70 p-3">
          <p className="text-xs text-slate-400">סה״כ</p>
          <p className={`text-2xl font-extrabold ${tone(sum)}`}>{formatShekel(sum, { signed: true })}</p>
        </div>
      </div>
      {from && (
        <p className="text-center text-sm text-slate-300">
          📅 {formatDay(from)} – {formatDay(to)}
        </p>
      )}

      <ul className="space-y-1.5">
        {result.summary > 0 && (
          <Note warn={result.totalMismatch}>
            {result.totalMismatch
              ? `⚠️ שורת הסה״כ בקובץ: ${formatShekel(result.totalRow, { signed: true })}, אבל סכום המשחקים: ${formatShekel(sum, { signed: true })}. כדאי לבדוק את הקובץ.`
              : result.totalRow != null
                ? `✓ שורת ״סה״כ״ דולגה, והיא תואמת לסכום המשחקים (${formatShekel(result.totalRow, { signed: true })})`
                : '✓ שורת ״סה״כ״ דולגה (היא לא משחק)'}
          </Note>
        )}
        {result.empty > 0 && <Note>{result.empty === 1 ? 'שורה ריקה אחת דולגה' : `${result.empty} שורות ריקות דולגו`}</Note>}
        {result.rounded > 0 && <Note>{result.rounded === 1 ? 'סכום אחד עוגל לשקל שלם' : `${result.rounded} סכומים עוגלו לשקל שלם`}</Note>}
        {result.invalid.length > 0 && (
          <Note warn>
            ⚠️ {result.invalid.length === 1 ? 'שורה אחת לא נקראה ולא תיובא' : `${result.invalid.length} שורות לא נקראו ולא ייובאו`}:
            <span className="mt-1 block space-y-0.5 text-xs text-amber-200/80">
              {result.invalid.slice(0, 8).map((x) => (
                <span key={x.line} className="block truncate">
                  שורה {x.line}: {x.reason} ({x.text || 'ריקה'})
                </span>
              ))}
            </span>
          </Note>
        )}
        {dup.online.length > 0 && (
          <Note warn>
            ⚠️ {dup.online.length === 1 ? 'בתאריך אחד' : `ב־${dup.online.length} תאריכים`} כבר יש לך משחק אונליין ({dayList(dup.online)}). אם זה אותו ערב, הוא ייספר פעמיים.
          </Note>
        )}
        {dup.imported.length > 0 && (
          <Note warn>
            ⚠️ {dup.imported.length === 1 ? 'תאריך אחד כבר יובא' : `${dup.imported.length} תאריכים כבר יובאו`} קודם ({dayList(dup.imported)}). אולי זה אותו קובץ פעמיים?
          </Note>
        )}
      </ul>

      {count > 0 && (
        <ul className="max-h-48 divide-y divide-white/5 overflow-y-auto rounded-2xl bg-slate-800/50 px-3 text-sm">
          {result.games.map((g, i) => (
            <li key={i} className="flex items-center justify-between gap-2 py-1.5">
              <span className="min-w-0 truncate text-slate-300">
                {formatDay(g.playedOn)}
                {g.note ? <span className="text-slate-500"> · {g.note}</span> : null}
              </span>
              <span className={`shrink-0 font-bold ${tone(g.net)}`}>{formatShekel(g.net, { signed: true })}</span>
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={onSave} disabled={count === 0 || saving} className={PRIMARY}>
        {saving ? 'שומר…' : count === 0 ? 'אין משחקים לייבוא' : `ייבא ${count} משחקים ✓`}
      </button>
      <button type="button" onClick={onBack} className={SECONDARY} disabled={saving}>
        → חזרה לבחירת עמודות
      </button>
    </div>
  );
}

// "📥 ייבוא היסטוריה": file → which column is what → preview → save.
export default function ImportSheet({ onlineGames, importedGames, onSave, onClose }) {
  const [file, setFile] = useState(null); // { name, header, start, data }
  const [columns, setColumns] = useState(null);
  const [step, setStep] = useState('pick');
  const [saving, setSaving] = useState(false);

  const result = useMemo(
    () => (file && step === 'preview' ? buildImport(file.data, columns, file.start + 1) : null),
    [file, columns, step]
  );
  const dup = useMemo(() => (result ? overlaps(result.games, onlineGames, importedGames) : null), [result, onlineGames, importedGames]);

  function loaded(rows, name) {
    const { header, start } = findHeader(rows);
    const data = rows.slice(start);
    setFile({ name, header, start, data });
    setColumns(guessColumns(header, data));
    setStep('map');
  }

  async function save() {
    setSaving(true);
    const ok = await onSave(result.games);
    setSaving(false);
    if (ok) onClose();
  }

  const titles = { pick: '📥 ייבוא היסטוריה', map: 'בחירת עמודות', preview: 'תצוגה מקדימה' };
  return (
    <BottomSheet
      onClose={onClose}
      title={
        <div className="mb-4">
          <h2 className="text-xl font-bold">{titles[step]}</h2>
          {file && step !== 'pick' && <p className="truncate text-sm text-slate-400">{file.name}</p>}
        </div>
      }
    >
      {step === 'pick' && <Pick onRows={loaded} />}
      {step === 'map' && (
        <div className="space-y-3">
          <Mapping header={file.header} sample={file.data.find((r) => r.some((c) => clean(c)))} columns={columns} setColumns={setColumns} onNext={() => setStep('preview')} />
          <button type="button" onClick={() => setStep('pick')} className={SECONDARY}>
            → קובץ אחר
          </button>
        </div>
      )}
      {step === 'preview' && <Preview result={result} dup={dup} saving={saving} onBack={() => setStep('map')} onSave={save} />}
    </BottomSheet>
  );
}
