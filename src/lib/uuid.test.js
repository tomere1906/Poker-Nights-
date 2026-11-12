import { describe, expect, it } from 'vitest';
import { uuid } from './uuid.js';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuid', () => {
  it('uses crypto.randomUUID when there is one', () => {
    expect(uuid()).toMatch(V4);
  });

  it('works without crypto.randomUUID (plain http, like the nip.io test address)', () => {
    const noRandomUUID = { getRandomValues: (a) => globalThis.crypto.getRandomValues(a) };
    const ids = new Set(Array.from({ length: 1000 }, () => uuid(noRandomUUID)));
    expect(ids.size).toBe(1000);
    for (const id of ids) expect(id).toMatch(V4);
  });
});
