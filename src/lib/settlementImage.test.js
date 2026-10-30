import { describe, expect, it } from 'vitest';
import { ellipsize, groupHandoffs, imageFileName, layoutPills } from './settlementImage.js';

// A fake text measure: every character is 10px wide.
const measure = (t) => [...t].length * 10;

describe('settlement image helpers', () => {
  it('keeps short names and cuts long ones with …', () => {
    expect(ellipsize('אסף', 100, measure)).toBe('אסף');
    // 7 characters + "…" fit in 80px; the trailing space is dropped.
    expect(ellipsize('שקד בן דוד הארוך', 80, measure)).toBe('שקד בן…');
  });

  it('wraps result pills into lines that fit the card', () => {
    // widths (chars*10 + 24): 94, 84, 94, 104. 94+8+84+8+94 = 288 fits in 300; the 4th wraps.
    const lines = layoutPills(['אסף +50', 'בן −20', 'דני +10', 'עידו −40'], 300, measure);
    expect(lines.map((l) => l.length)).toEqual([3, 1]);
    expect(lines[0][0]).toEqual({ text: 'אסף +50', width: 94 });
  });

  it('names the file by the game date', () => {
    expect(imageFileName(new Date(2026, 9, 25, 23, 30).getTime())).toBe('poker-nights-2026-10-25.png');
  });
});

describe('groupHandoffs', () => {
  it('groups cash handoffs by who holds the cash', () => {
    expect(
      groupHandoffs([
        { holder: 'tomer', to: 'omer', amount: 200 },
        { holder: 'ben', to: 'ido', amount: 50 },
        { holder: 'tomer', to: 'ido', amount: 150 },
      ])
    ).toEqual([
      { holder: 'tomer', rows: [{ to: 'omer', amount: 200 }, { to: 'ido', amount: 150 }], total: 350 },
      { holder: 'ben', rows: [{ to: 'ido', amount: 50 }], total: 50 },
    ]);
    expect(groupHandoffs()).toEqual([]);
  });
});
