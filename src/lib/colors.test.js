import { describe, expect, it } from 'vitest';
import { PALETTE, paletteColor, suggestedColor } from './colors.js';

describe('colors', () => {
  it('has 8 distinct colors (the DB allows indexes 0-7)', () => {
    expect(PALETTE).toHaveLength(8);
    expect(new Set(PALETTE.map((c) => c.hex)).size).toBe(8);
  });

  it('wraps out-of-range indexes from old local games', () => {
    expect(paletteColor(9)).toBe(PALETTE[1]);
    expect(paletteColor(null)).toBe(PALETTE[0]);
    expect(paletteColor(-1)).toBe(PALETTE[7]);
  });

  it('suggests a stable color per user', () => {
    const id = '22222222-2222-4222-8222-222222222222';
    expect(suggestedColor(id)).toBe(suggestedColor(id));
    expect(suggestedColor(id)).toBeGreaterThanOrEqual(0);
    expect(suggestedColor(id)).toBeLessThan(8);
  });
});
