import { describe, expect, it } from 'vitest';
import { splitName } from './names.js';

describe('splitName', () => {
  it('first word, then the rest', () => {
    expect(splitName('Tomer Erlichman')).toEqual({ first: 'Tomer', rest: 'Erlichman' });
    expect(splitName('אסף בן דוד')).toEqual({ first: 'אסף', rest: 'בן דוד' });
  });

  it('single words stay on one line', () => {
    expect(splitName('קשקש')).toEqual({ first: 'קשקש', rest: null });
    expect(splitName('  עומר  ')).toEqual({ first: 'עומר', rest: null });
  });

  it('extra spaces and empty names', () => {
    expect(splitName('  Tomer   Erlichman ')).toEqual({ first: 'Tomer', rest: 'Erlichman' });
    expect(splitName('')).toEqual({ first: '', rest: null });
    expect(splitName(null)).toEqual({ first: '', rest: null });
  });
});
