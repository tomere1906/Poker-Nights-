import { describe, expect, it } from 'vitest';
import { netText, resultShekels, resultShown } from './result.js';

describe('a result told three ways (chips / ₪ / profit-loss)', () => {
  // Bought in 200 ₪, a chip worth 0.5 ₪.
  const totalIn = 200;
  const cv = 0.5;

  it('turns each way into what the player leaves with (₪)', () => {
    expect(resultShekels(600, null, 'chips', totalIn, cv)).toBe(300);
    expect(resultShekels(300, null, 'shekels', totalIn, cv)).toBe(300);
    expect(resultShekels(100, 1, 'net', totalIn, cv)).toBe(300);
    expect(resultShekels(100, -1, 'net', totalIn, cv)).toBe(100);
    expect(resultShekels(0, null, 'net', totalIn, cv)).toBe(200); // even, no sign needed
  });

  it('waits for + or − before a net amount counts', () => {
    expect(resultShekels(100, null, 'net', totalIn, cv)).toBeNull();
    expect(resultShekels(null, 1, 'net', totalIn, cv)).toBeNull();
  });

  it('a loss bigger than the buy-ins comes out negative (the field refuses it)', () => {
    expect(resultShekels(250, -1, 'net', totalIn, cv)).toBe(-50);
  });

  it('shows the same ₪ in every way, and back again', () => {
    expect(resultShown(300, 'chips', totalIn, cv)).toEqual({ amount: 600, sign: null });
    expect(resultShown(300, 'shekels', totalIn, cv)).toEqual({ amount: 300, sign: null });
    expect(resultShown(100, 'net', totalIn, cv)).toEqual({ amount: 100, sign: -1 });
    expect(resultShown(200, 'net', totalIn, cv)).toEqual({ amount: 0, sign: null });
    for (const unit of ['chips', 'shekels', 'net']) {
      for (const shekels of [0, 50, 200, 375]) {
        const { amount, sign } = resultShown(shekels, unit, totalIn, cv);
        expect(resultShekels(amount, sign, unit, totalIn, cv)).toBe(shekels);
      }
    }
  });

  it('describes the net in words', () => {
    // Numbers are wrapped in direction marks for Hebrew text: compare without them.
    const plain = (t) => t.replace(/[\u2066-\u2069]/g, '');
    expect(plain(netText(50))).toBe('פלוס 50');
    expect(plain(netText(-100))).toBe('מינוס 100');
    expect(netText(0)).toBe('מאוזן');
  });
});

describe('the three input styles', () => {
  it('come in the order רווח/הפסד, צ׳יפים, כסף, with רווח/הפסד as the default', async () => {
    const { RESULT_UNITS, DEFAULT_RESULT_UNIT } = await import('./result.js');
    expect(RESULT_UNITS.map((u) => u.label)).toEqual(['רווח/הפסד', 'צ׳יפים', 'כסף']);
    expect(DEFAULT_RESULT_UNIT).toBe('net');
  });
});
