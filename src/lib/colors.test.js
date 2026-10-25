import { describe, expect, it } from 'vitest';
import { PALETTE, firstFreeColor, paletteColor, suggestedColor } from './colors.js';

describe('colors', () => {
  it('has 12 distinct colors (the DB allows indexes 0-11)', () => {
    expect(PALETTE).toHaveLength(12);
    expect(new Set(PALETTE.map((c) => c.hex)).size).toBe(12);
    expect(new Set(PALETTE.map((c) => c.name)).size).toBe(12);
  });

  it('keeps the original 8 in place (stored indexes never move)', () => {
    expect(PALETTE.slice(0, 8).map((c) => c.name)).toEqual(['אדום', 'כתום', 'צהוב', 'ירוק', 'תכלת', 'כחול', 'סגול', 'ורוד']);
  });

  it('wraps out-of-range indexes', () => {
    expect(paletteColor(13)).toBe(PALETTE[1]);
    expect(paletteColor(null)).toBe(PALETTE[0]);
    expect(paletteColor(-1)).toBe(PALETTE[11]);
  });

  it('suggests a stable color per user', () => {
    const id = '22222222-2222-4222-8222-222222222222';
    expect(suggestedColor(id)).toBe(suggestedColor(id));
    expect(suggestedColor(id)).toBeLessThan(12);
  });

  it('picks the first color nobody at the table has', () => {
    expect(firstFreeColor([])).toBe(0);
    expect(firstFreeColor([0, 1, 3])).toBe(2);
    expect(firstFreeColor([...Array(9).keys()])).toBe(9);
  });
});
