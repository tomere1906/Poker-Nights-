// Importing personal game history from a file (CSV or Excel). Pure, except
// readXlsx, which only needs the browser's DecompressionStream. Each row of
// the file is one night: a date, the user's net result in ₪, an optional note.

// ---------------------------------------------------------------- reading

// CSV with quotes ("a,b", "say ""hi"""), any line ending, an optional BOM.
// The separator is guessed from the first line: comma, semicolon or tab.
export function parseCsv(text) {
  const src = String(text).replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const outside = firstLine.replace(/"[^"]*"/g, '');
  const sep = [',', ';', '\t'].reduce((best, s) => (outside.split(s).length > outside.split(best).length ? s : best), ',');

  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function xmlText(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return XML_ENTITIES[e] ?? m;
  });
}

// "B12" → 1 (zero-based column).
function columnIndex(ref) {
  const letters = ref.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? 'A';
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

// Excel's own date cells: a day count since 1899-12-30, shown with a date
// format. Returns { [styleIndex]: true } for the styles that are dates.
function dateStyles(stylesXml) {
  if (!stylesXml) return {};
  const custom = {};
  for (const m of stylesXml.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) custom[m[1]] = xmlText(m[2]);
  const isDateFmt = (id) => {
    const n = Number(id);
    if ((n >= 14 && n <= 22) || (n >= 45 && n <= 47)) return true;
    const code = custom[id];
    // A format with d/m/y and no plain number placeholders (ignore quoted text and [colors]).
    return Boolean(code) && /[dmy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]/g, '')) && !/[0#]/.test(code.replace(/"[^"]*"/g, ''));
  };
  const xfs = stylesXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? '';
  const out = {};
  [...xfs.matchAll(/<xf\b[^>]*>/g)].forEach((m, i) => {
    const id = m[0].match(/numFmtId="(\d+)"/)?.[1];
    if (id && isDateFmt(id)) out[i] = true;
  });
  return out;
}

// The rows of an xlsx sheet's XML as strings; date cells become "d.m.yyyy".
export function sheetRows(sheetXml, sharedXml = '', stylesXml = '') {
  const shared = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => xmlText(t[1])).join('')
  );
  const dates = dateStyles(stylesXml);
  const rows = [];
  for (const r of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const body = c[2] ?? '';
      const col = columnIndex(attrs.match(/\br="([A-Z]+)\d+"/i)?.[1] ?? String.fromCharCode(65 + row.length));
      const type = attrs.match(/\bt="(\w+)"/)?.[1];
      const style = attrs.match(/\bs="(\d+)"/)?.[1];
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = '';
      if (type === 's') value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => xmlText(t[1])).join('');
      else if (v != null) {
        value = xmlText(v);
        if (type !== 'str' && style && dates[style] && Number.isFinite(Number(value))) value = serialToDate(Number(value));
      }
      while (row.length < col) row.push('');
      row[col] = value;
    }
    rows.push(row);
  }
  return rows;
}

function serialToDate(serial) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
  return `${d.getUTCDate()}.${d.getUTCMonth() + 1}.${d.getUTCFullYear()}`;
}

// A zip's files by name (only what an xlsx needs: stored or deflated).
async function unzip(buffer, wanted) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error('not a zip');
  let p = view.getUint32(end + 16, true);
  const count = view.getUint16(end + 10, true);
  const out = {};
  for (let i = 0; i < count; i++) {
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!wanted(name)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    if (method === 0) out[name] = new TextDecoder().decode(data);
    else if (method === 8) {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      out[name] = await new Response(stream).text();
    }
  }
  return out;
}

// The first sheet of an .xlsx file as rows of strings.
export async function readXlsx(buffer) {
  const files = await unzip(buffer, (n) => /^xl\/(worksheets\/sheet\d+\.xml|sharedStrings\.xml|styles\.xml|workbook\.xml|_rels\/workbook\.xml\.rels)$/.test(n));
  // The first sheet in the workbook's order (not always sheet1.xml).
  const rid = files['xl/workbook.xml']?.match(/<sheet\b[^>]*r:id="([^"]+)"/)?.[1];
  const target = rid && files['xl/_rels/workbook.xml.rels']?.match(new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`))?.[1];
  const sheetName = target ? `xl/${target.replace(/^\/?xl\//, '')}` : 'xl/worksheets/sheet1.xml';
  const sheet = files[sheetName] ?? Object.entries(files).find(([n]) => n.startsWith('xl/worksheets/'))?.[1];
  if (!sheet) throw new Error('no sheet');
  return sheetRows(sheet, files['xl/sharedStrings.xml'], files['xl/styles.xml']);
}

// ---------------------------------------------------------------- cleaning

const HIDDEN = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u180e\\u200b\\u200e\\u200f\\u2028-\\u202e\\u2060-\\u2064\\u2066-\\u2069\\ufeff]', 'g');
export const clean = (s) => String(s ?? '').replace(HIDDEN, '').replace(/\s+/g, ' ').trim();

// "8.2.2026" (day.month.year), also / or -, a 2-digit year (→ 20xx), ISO
// "2026-02-08", or an Excel day number. Returns "2026-02-08" or null.
export function parseDate(text) {
  const s = clean(text);
  let d;
  let m;
  let y;
  let match;
  if ((match = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/))) [, y, m, d] = match;
  else if ((match = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2}|\d{4})$/))) [, d, m, y] = match;
  else if (/^\d{5}(\.\d+)?$/.test(s) && Number(s) > 30000 && Number(s) < 80000) return parseDate(serialToDate(Number(s)));
  else return null;
  y = Number(y.length === 2 ? `20${y}` : y);
  m = Number(m);
  d = Number(d);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (y < 2000 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// "−120", "-120 ₪", "₪1,250", "+80", "(120)", "120-" (Excel in Hebrew) → a number, or null.
export function parseNet(text) {
  let s = clean(text).replace(/[₪]|ש"ח|ש״ח|nis|ils/gi, '').replace(/\s/g, '');
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[−‒–—]/g, '-');
  if (/^[-+].+/.test(s)) {
    negative = negative !== (s[0] === '-');
    s = s.slice(1);
  } else if (/.+-$/.test(s)) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  s = s.replace(/,(?=\d{3}(\D|$))/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return negative ? -n : n;
}

// (No \b: in JS it only knows English letters.)
const SUMMARY = /^(סה["״׳']?כ|סך\s*ה?כו?ל|total|sum|grand\s*total|subtotal)(?=[\s:]|$)/i;
export const isSummaryCell = (cell) => SUMMARY.test(clean(cell).replace(/:$/, ''));

// ---------------------------------------------------------------- columns

const GUESS = {
  date: /תאריך|date|day|יום/i,
  net: /סכום|רווח|הפסד|תוצאה|נטו|net|amount|result|profit|win|loss|balance/i,
  note: /הער|note|comment|תיאור|description|מקום|place|where/i,
};

// The header row: the first non-empty row, when none of its cells is a date or
// a number. Returns { header: [names], start: first data row index }.
export function findHeader(rows) {
  const first = rows.findIndex((r) => r.some((c) => clean(c)));
  if (first < 0) return { header: [], start: 0 };
  const row = rows[first];
  const width = Math.max(...rows.map((r) => r.length));
  const looksLikeData = row.some((c) => parseDate(c) || (clean(c) && parseNet(c) != null));
  if (looksLikeData) return { header: Array.from({ length: width }, (_, i) => `עמודה ${i + 1}`), start: first };
  return { header: Array.from({ length: width }, (_, i) => clean(row[i]) || `עמודה ${i + 1}`), start: first + 1 };
}

// { date, net, note } column indexes (note may be null) guessed from the header,
// else from the data (the column that parses as dates / as numbers).
export function guessColumns(header, rows = []) {
  const pick = (re, taken) => header.findIndex((h, i) => !taken.includes(i) && re.test(h));
  let date = pick(GUESS.date, []);
  let net = pick(GUESS.net, [date]);
  const sample = rows.slice(0, 20);
  const share = (i, test) => sample.filter((r) => test(r[i])).length;
  if (date < 0) date = header.findIndex((_, i) => share(i, parseDate) > sample.length / 2);
  if (net < 0) net = header.findIndex((_, i) => i !== date && share(i, (c) => clean(c) && parseNet(c) != null) > sample.length / 2);
  const note = pick(GUESS.note, [date, net]);
  return { date: date < 0 ? null : date, net: net < 0 ? null : net, note: note < 0 ? null : note };
}

// ---------------------------------------------------------------- building

// rows: data rows (after the header); columns: { date, net, note }.
// Returns the games to save plus everything the preview should say.
export function buildImport(rows, columns, firstLine = 2) {
  const games = [];
  const invalid = [];
  let empty = 0;
  let summary = 0;
  let rounded = 0;
  let totalRow = null;
  rows.forEach((row, i) => {
    const line = firstLine + i;
    if (!row.some((c) => clean(c))) {
      empty++;
      return;
    }
    // "סה״כ" / "Total": not a game. Its amount is checked against the sum.
    if (!parseDate(row[columns.date]) && row.some(isSummaryCell)) {
      summary++;
      const n = parseNet(row[columns.net]);
      if (n != null) totalRow = (totalRow ?? 0) + n;
      return;
    }
    const playedOn = parseDate(row[columns.date]);
    const raw = parseNet(row[columns.net]);
    if (!playedOn || raw == null) {
      invalid.push({ line, reason: !playedOn ? 'תאריך לא תקין' : 'סכום לא תקין', text: row.map(clean).filter(Boolean).join(' · ') });
      return;
    }
    const net = Math.round(raw);
    if (net !== raw) rounded++;
    const note = columns.note == null ? null : clean(row[columns.note]).slice(0, 200) || null;
    games.push({ playedOn, net, note });
  });
  const sum = games.reduce((s, g) => s + g.net, 0);
  const dates = games.map((g) => g.playedOn).sort();
  return {
    games,
    count: games.length,
    sum,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    empty,
    summary,
    invalid,
    rounded,
    totalRow,
    totalMismatch: totalRow != null && Math.round(totalRow) !== sum,
  };
}

// "2026-02-08" → the night's date as ms (noon local, so it never shifts a day).
export const dayToMs = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
};

// The night an online game belongs to: one that ends before 06:00 counts for the evening before.
export function nightOf(ms) {
  const d = new Date(ms - 6 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Dates in the file that already have one of my online games / an earlier import.
export function overlaps(games, onlineGames, importedGames) {
  const online = new Set(onlineGames.map((g) => nightOf(g.endedAt)));
  const imported = new Set(importedGames.map((g) => g.playedOn));
  const fileDays = [...new Set(games.map((g) => g.playedOn))].sort();
  return { online: fileDays.filter((d) => online.has(d)), imported: fileDays.filter((d) => imported.has(d)) };
}

// "8.2.2026" for the preview.
export const formatDay = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  return `${d}.${m}.${y}`;
};

// The downloadable template (demo data). The BOM makes Excel read Hebrew right.
export const TEMPLATE_CSV = '﻿תאריך,סכום,הערות\r\n8.2.2026,-120,אצל דני\r\n15.2.2026,250,\r\n22.2.2026,0,טורניר\r\nסה״כ,130,\r\n';
