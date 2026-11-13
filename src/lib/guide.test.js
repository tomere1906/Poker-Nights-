import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { BIT_QR_GUIDE } from './guide.js';

describe('guides', () => {
  it('every step has its picture, Hebrew text and a spot inside the picture', () => {
    for (const step of BIT_QR_GUIDE.steps) {
      expect(existsSync(new URL(`../../public/${step.image}`, import.meta.url))).toBe(true);
      expect(step.title).toMatch(/[א-ת]/);
      expect(step.text).toMatch(/[א-ת]/);
      const { x, y, w, h } = step.spot;
      expect(x - w / 2).toBeGreaterThanOrEqual(0);
      expect(x + w / 2).toBeLessThanOrEqual(100);
      expect(y - h / 2).toBeGreaterThanOrEqual(0);
      expect(y + h / 2).toBeLessThanOrEqual(100);
    }
  });
});
