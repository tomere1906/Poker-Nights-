import { describe, expect, it } from 'vitest';
import { ERRORS, friendlyError } from './errors.js';

// Errors shaped like the ones Supabase returns (PostgrestError: code, message, details).
const pg = (code, message, details = null) => ({ code, message, details, hint: null });
const say = (e) => friendlyError(e, true);

describe('friendlyError', () => {
  it('two players tapping the same seat: the second gets a clear Hebrew message', () => {
    expect(say(pg('23505', 'duplicate key value violates unique constraint "table_players_seat_unique"', 'Key (table_id, seat)=(…, 3) already exists.'))).toBe(
      'הכיסא הזה כבר נתפס. בחר כיסא אחר 🪑'
    );
  });

  it('taking a second seat, or anything else that already exists', () => {
    expect(say(pg('23505', 'duplicate key value violates unique constraint "table_players_table_id_user_id_key"'))).toBe(ERRORS.alreadySeated);
    expect(say(pg('23505', 'duplicate key value violates unique constraint "hidden_games_pkey"'))).toBe(ERRORS.exists);
  });

  it('no connection: offline, or the browser\'s network errors (Chrome, Safari, Firefox)', () => {
    expect(friendlyError(pg('42501', 'anything'), false)).toBe('אין חיבור לאינטרנט, נסה שוב');
    expect(say({ message: 'TypeError: Failed to fetch', code: '' })).toBe(ERRORS.offline);
    expect(say(new TypeError('Load failed'))).toBe(ERRORS.offline);
    expect(say({ message: 'NetworkError when attempting to fetch resource.' })).toBe(ERRORS.offline);
  });

  it('permissions: in general, manager-only actions, an ended game, a missing table', () => {
    expect(say(pg('42501', 'new row violates row-level security policy for table "buy_ins"'))).toBe('אין לך הרשאה לפעולה הזו');
    expect(say(pg('42501', 'Only the table manager can rename the table'))).toBe(ERRORS.managerOnly);
    expect(say(pg('42501', 'Only the table manager can choose who covers the difference'))).toBe(ERRORS.managerOnly);
    expect(say(pg('42501', 'The game has ended; reopen it to make changes'))).toBe(ERRORS.gameEnded);
    expect(say(pg('42501', 'Table not found'))).toBe(ERRORS.tableGone);
    expect(say(pg('PGRST116', 'JSON object requested, multiple (or no) rows returned'))).toBe(ERRORS.tableGone);
  });

  it('the database\'s own checks', () => {
    expect(say(pg('23514', 'Every player needs a final result, and the results must add up to 0'))).toBe(ERRORS.resultsUnbalanced);
    expect(say(pg('23514', "The transfers don't match the results"))).toBe(ERRORS.transfersMismatch);
    expect(say(pg('23514', 'new row for relation "profiles" violates check constraint "profiles_name_length"'))).toBe(ERRORS.invalid);
    expect(say(pg('23514', 'The chosen player is not at this table'))).toBe(ERRORS.invalid);
    expect(say(pg('23503', 'insert or update on table "buy_ins" violates foreign key constraint'))).toBe(ERRORS.missing);
    expect(say(pg('54000', 'Too many imported games'))).toBe(ERRORS.importLimit);
    expect(say(pg('57014', 'canceling statement due to statement timeout'))).toBe(ERRORS.timeout);
  });

  it('an expired sign-in', () => {
    expect(say(pg('PGRST301', 'JWT expired'))).toBe(ERRORS.signedOut);
    expect(say({ message: 'Invalid Refresh Token: Refresh Token Not Found', status: 400 })).toBe(ERRORS.signedOut);
  });

  it('keeps the app\'s own Hebrew messages, never shows unknown English text', () => {
    expect(say(new Error('השולחן מלא'))).toBe('השולחן מלא');
    expect(say('אין כיסא פנוי')).toBe('אין כיסא פנוי');
    expect(say(new Error('Something unexpected happened in the server'))).toBe('משהו השתבש, נסה שוב');
    expect(say(pg('PGRST202', 'Could not find the function public.end_game'))).toBe(ERRORS.generic);
    expect(say('raw english')).toBe(ERRORS.generic);
    expect(say(null)).toBe(ERRORS.generic);
  });

  it('no message ever contains English letters', () => {
    for (const message of Object.values(ERRORS)) expect(message).not.toMatch(/[A-Za-z]/);
  });
});
