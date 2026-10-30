import { describe, expect, it } from 'vitest';
import { cashSections, ellipsize, imageFileName, layoutPills } from './settlementImage.js';

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

describe('cashSections', () => {
  const names = { nadav: 'נדב', fouad: 'פואד', omer: 'עומר', ido: 'עידו' };
  const strip = (x) => x.replace(/[\u2066-\u2069]/g, '').replace(/\u00a0/g, ' ');

  it('who paid, then how the pot is split – never a holder', () => {
    const sections = cashSections(
      [{ from: 'nadav', amount: 200 }, { from: 'fouad', amount: 150 }],
      [{ to: 'omer', amount: 300 }, { to: 'ido', amount: 50 }],
      (id) => names[id]
    );
    expect(sections.map((s) => s.title)).toEqual(['💵 שולם במזומן', '💵 חלוקת המזומן']);
    expect(sections[0].lines.map((l) => strip(l.text))).toEqual(['נדב שילם 200 ₪', 'פואד שילם 150 ₪']);
    expect(sections[1].lines.map((l) => strip(l.text))).toEqual(['300 ₪ לעומר', '50 ₪ לעידו']);
    expect(JSON.stringify(sections)).not.toMatch(/אצל/);
  });

  it('no cash, no sections', () => {
    expect(cashSections([], [])).toEqual([]);
  });
});
