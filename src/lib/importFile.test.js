import { describe, expect, it } from 'vitest';
import {
  TEMPLATE_CSV,
  buildImport,
  findHeader,
  guessColumns,
  isSummaryCell,
  nightOf,
  overlaps,
  parseCsv,
  parseDate,
  parseNet,
  readXlsx,
  sheetRows,
} from './importFile.js';

// Like the user's real file (demo values): 21 nights, 8.2.2026 → 5.11.2026, total −375,
// an empty row, spaces, a quoted note with a comma, and the "סה״כ" row at the end.
const NIGHTS = [
  ['8.2.2026', '-120', 'אצל דני'], ['22.2.2026', '250', ''], ['8.3.2026', '−80 ₪', ''], ['22.3.2026', '+40', ''],
  ['5.4.2026', '-200', '"פסח, אצל רון"'], ['19.4.2026', '150', ''], ['3.5.2026', '-60', ''], ['17.5.2026', '0', ''],
  ['31.5.2026', ' 90 ', ''], ['14.6.2026', '-150', ''], ['28.6.2026', '300', 'הערב הכי טוב'], ['12.7.2026', '-250', ''],
  ['26.7.2026', '110', ''], ['9.8.2026', '-40', ''], ['23.8.2026', '-90', ''], ['6.9.2026', '60', ''],
  ['20.9.2026', '-130', ''], ['4.10.2026', '20', ''], ['18.10.2026', '-100', ''], ['1.11.2026', '80', ''], ['5.11.2026', '-255', ''],
];
const FILE = ['﻿תאריך,סכום,הערות', ...NIGHTS.slice(0, 10).map((r) => r.join(',')), ',,', ...NIGHTS.slice(10).map((r) => r.join(',')), 'סה״כ,-375,', ''].join('\r\n');

function importText(text) {
  const rows = parseCsv(text);
  const { header, start } = findHeader(rows);
  const data = rows.slice(start);
  const columns = guessColumns(header, data);
  return { header, columns, result: buildImport(data, columns, start + 1) };
}

describe('the user\'s file (demo values)', () => {
  const { header, columns, result } = importText(FILE);

  it('finds the Hebrew headers', () => {
    expect(header).toEqual(['תאריך', 'סכום', 'הערות']);
    expect(columns).toEqual({ date: 0, net: 1, note: 2 });
  });

  it('21 games, 8.2.2026 to 5.11.2026, total −375, the "סה״כ" row skipped', () => {
    expect(result.count).toBe(21);
    expect(result.from).toBe('2026-02-08');
    expect(result.to).toBe('2026-11-05');
    expect(result.sum).toBe(-375);
    expect(result.summary).toBe(1);
    expect(result.totalRow).toBe(-375);
    expect(result.totalMismatch).toBe(false);
    expect(result.empty).toBe(1);
    expect(result.invalid).toEqual([]);
  });

  it('keeps notes (quoted commas too), trimmed; no note = null', () => {
    expect(result.games[0]).toEqual({ playedOn: '2026-02-08', net: -120, note: 'אצל דני' });
    expect(result.games[4].note).toBe('פסח, אצל רון');
    expect(result.games[1].note).toBeNull();
  });

  it('warns when the total row doesn\'t match the games', () => {
    const r = importText(FILE.replace('סה״כ,-375,', 'סה״כ,-300,')).result;
    expect(r.totalMismatch).toBe(true);
    expect(r.totalRow).toBe(-300);
  });
});

describe('reading', () => {
  it('guesses the separator: semicolon and tab', () => {
    expect(parseCsv('a;b;c\n1;2;3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('handles quotes with commas, doubled quotes and new lines', () => {
    expect(parseCsv('"a, b","say ""hi""","x\ny"')).toEqual([['a, b', 'say "hi"', 'x\ny']]);
  });

  it('dates: day.month.year first, also / - 2-digit years and ISO; refuses impossible dates', () => {
    expect(parseDate('8.2.2026')).toBe('2026-02-08');
    expect(parseDate('08/02/26')).toBe('2026-02-08');
    expect(parseDate('8-2-2026')).toBe('2026-02-08');
    expect(parseDate('2026-02-08')).toBe('2026-02-08');
    expect(parseDate(' 8.2.2026 ')).toBe('2026-02-08');
    expect(parseDate('31.2.2026')).toBeNull();
    expect(parseDate('סה״כ')).toBeNull();
    expect(parseDate('')).toBeNull();
    expect(parseDate('46061')).toBe('2026-02-08'); // an Excel day number
  });

  it('amounts: signs, ₪, thousands, Excel\'s trailing minus and (brackets)', () => {
    expect(parseNet('-120')).toBe(-120);
    expect(parseNet('−80 ₪')).toBe(-80);
    expect(parseNet('+40')).toBe(40);
    expect(parseNet('₪1,250')).toBe(1250);
    expect(parseNet('120-')).toBe(-120);
    expect(parseNet('(120)')).toBe(-120);
    expect(parseNet('12.5')).toBe(12.5);
    expect(parseNet('')).toBeNull();
    expect(parseNet('abc')).toBeNull();
  });

  it('summary rows in Hebrew and English', () => {
    for (const s of ['סה״כ', 'סה"כ', 'סהכ', 'סה״כ:', 'סך הכל', 'Total', 'TOTAL', 'Grand total']) expect(isSummaryCell(s)).toBe(true);
    for (const s of ['אצל דני', 'Totally', '8.2.2026', '']) expect(isSummaryCell(s)).toBe(false);
  });

  it('a note that says "Total" on a real date is still a game', () => {
    const r = importText('date,net,note\n8.2.2026,50,Total chaos').result;
    expect(r.count).toBe(1);
    expect(r.summary).toBe(0);
  });
});

describe('columns', () => {
  it('guesses English headers in any order', () => {
    const { header, columns } = importText('Notes,Date,Profit\nx,8.2.2026,10');
    expect(header).toEqual(['Notes', 'Date', 'Profit']);
    expect(columns).toEqual({ date: 1, net: 2, note: 0 });
  });

  it('a file without a header: columns are found from the data', () => {
    const { header, columns, result } = importText('8.2.2026,-120\n15.2.2026,80');
    expect(header).toEqual(['עמודה 1', 'עמודה 2']);
    expect(columns).toEqual({ date: 0, net: 1, note: null });
    expect(result.count).toBe(2);
  });
});

describe('cleaning', () => {
  it('lists rows it can\'t read, with their line numbers, and rounds to whole shekels', () => {
    const r = importText('תאריך,סכום\n8.2.2026,12.5\n31.2.2026,10\n9.2.2026,abc').result;
    expect(r.games).toEqual([{ playedOn: '2026-02-08', net: 13, note: null }]);
    expect(r.rounded).toBe(1);
    expect(r.invalid.map((x) => [x.line, x.reason])).toEqual([[3, 'תאריך לא תקין'], [4, 'סכום לא תקין']]);
  });

  it('removes hidden characters from notes', () => {
    const r = importText(`תאריך,סכום,הערות\n8.2.2026,10,${String.fromCharCode(0x200f)}אצל${String.fromCharCode(0x202e)} דני `).result;
    expect(r.games[0].note).toBe('אצל דני');
  });

  it('the template reads back as 3 games with a matching total', () => {
    const r = importText(TEMPLATE_CSV).result;
    expect(r).toMatchObject({ count: 3, sum: 130, summary: 1, totalMismatch: false });
  });
});

describe('overlaps', () => {
  it('finds dates that already have an online game (a game ending after midnight counts for the evening) or an import', () => {
    const games = [{ playedOn: '2026-02-08' }, { playedOn: '2026-02-15' }, { playedOn: '2026-02-22' }];
    const online = [{ endedAt: new Date(2026, 1, 9, 1, 30).getTime() }];
    const imported = [{ playedOn: '2026-02-22' }];
    expect(nightOf(online[0].endedAt)).toBe('2026-02-08');
    expect(overlaps(games, online, imported)).toEqual({ online: ['2026-02-08'], imported: ['2026-02-22'] });
  });
});

// A minimal .xlsx (zip) built here: one entry stored, the rest deflated.
async function zip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [i, [name, text]] of Object.entries(files).entries()) {
    const raw = enc.encode(text);
    const deflate = i > 0;
    const data = deflate ? new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()) : raw;
    const nameBytes = enc.encode(name);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, deflate ? 8 : 0, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, nameBytes.length, true);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(10, deflate ? 8 : 0, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, raw.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, data);
    central.push(new Uint8Array(cd.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const cdSize = central.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, central.length / 2, true);
  end.setUint16(10, central.length / 2, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)]).arrayBuffer();
}

describe('Excel (.xlsx)', () => {
  const sheet = `<worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
    <row r="2"><c r="A2" s="1"><v>46061</v></c><c r="B2"><v>-120</v></c><c r="C2" t="s"><v>3</v></c></row>
    <row r="3"><c r="A3" t="inlineStr"><is><t>15.2.2026</t></is></c><c r="B3"><v>80</v></c></row>
    <row r="4"><c r="A4" t="s"><v>4</v></c><c r="B4"><v>-40</v></c></row>
  </sheetData></worksheet>`;
  const shared = '<sst><si><t>תאריך</t></si><si><t>סכום</t></si><si><t>הערות</t></si><si><t>אצל דני &amp; רון</t></si><si><r><t>סה</t></r><r><t>״כ</t></r></si></sst>';
  const styles = '<styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs></styleSheet>';

  it('reads cells, shared strings, a date cell and a total row', () => {
    const rows = sheetRows(sheet, shared, styles);
    expect(rows[1]).toEqual(['8.2.2026', '-120', 'אצל דני & רון']);
    const { header, start } = findHeader(rows);
    const result = buildImport(rows.slice(start), guessColumns(header, rows.slice(start)));
    expect(result).toMatchObject({ count: 2, sum: -40, summary: 1, totalRow: -40, totalMismatch: false });
  });

  it('unzips a real .xlsx file (stored and deflated entries)', async () => {
    const buffer = await zip({
      'xl/workbook.xml': '<workbook><sheets><sheet name="משחקים" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/worksheets/sheet1.xml': sheet,
      'xl/sharedStrings.xml': shared,
      'xl/styles.xml': styles,
    });
    const rows = await readXlsx(buffer);
    expect(rows[0]).toEqual(['תאריך', 'סכום', 'הערות']);
    expect(rows[1][0]).toBe('8.2.2026');
  });
});
