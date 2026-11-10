import { describe, expect, it } from 'vitest';
import { isValidInvite } from './invite.js';
import { authErrorText } from './auth.js';

describe('tampered links', () => {
  const good = { tableId: '0f8fad5b-d9cb-469f-a165-70867728950e', code: 'a'.repeat(32) };

  it('accepts a real invite (table id + 32-character code)', () => {
    expect(isValidInvite(good)).toBe(true);
  });

  it('rejects edited or broken invites before they reach the database', () => {
    for (const bad of [
      null,
      'x',
      {},
      { ...good, tableId: '1 or 1=1' },
      { ...good, tableId: '0f8fad5b-d9cb-469f-a165-70867728950e/../x' },
      { ...good, code: 'guess' },
      { ...good, code: 'a'.repeat(31) + '<' },
      { ...good, code: ['a'.repeat(32)] },
    ]) {
      expect(isValidInvite(bad)).toBe(false);
    }
  });

  it('never shows the sign-in error text from the address bar', () => {
    const fake = '?error=server_error&error_description=' + encodeURIComponent('האפליקציה דורשת תשלום, העבירו 100 ₪ ל…');
    expect(authErrorText(fake, '')).toBe('משהו השתבש, נסו שוב');
    expect(authErrorText('', '#error=access_denied&error_description=whatever')).toBe('ההתחברות בוטלה');
    expect(authErrorText('?code=abc', '')).toBe(null);
  });
});
