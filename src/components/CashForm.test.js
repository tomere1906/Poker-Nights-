import { describe, expect, it } from 'vitest';
import { BILLS, billsTotalText } from './CashForm.jsx';

const strip = (s) => s.replace(/[⁦-⁩]/g, '').replace(/ /g, ' ');

describe('cash bills', () => {
  it('quick buttons for common bills', () => {
    expect(BILLS).toEqual([200, 100, 50, 20]);
  });

  it('shows the running total', () => {
    expect(strip(billsTotalText([50, 50]))).toBe('50 + 50 = 100 ₪');
    expect(strip(billsTotalText([200]))).toBe('200 ₪');
    expect(strip(billsTotalText([100, 50, 20]))).toBe('100 + 50 + 20 = 170 ₪');
  });
});
