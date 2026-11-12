// Turns any error (Supabase/Postgres, network, sign-in) into a short Hebrew
// message for the user. Raw technical (English) text is never shown: what
// isn't recognized becomes a general "something went wrong". Pure.

export const ERRORS = {
  offline: 'אין חיבור לאינטרנט, נסה שוב',
  seatTaken: 'הכיסא הזה כבר נתפס. בחר כיסא אחר 🪑',
  alreadySeated: 'כבר יש לך כיסא בשולחן הזה',
  exists: 'זה כבר קיים',
  noPermission: 'אין לך הרשאה לפעולה הזו',
  managerOnly: 'רק מנהל השולחן יכול לעשות את זה',
  gameEnded: 'המשחק כבר נגמר. כדי לשנות משהו, המנהל צריך לפתוח אותו מחדש',
  tableGone: 'השולחן לא נמצא: אולי הוא נמחק, או שאינך חבר בו',
  resultsUnbalanced: 'לכל שחקן צריכה להיות תוצאה, והתוצאות צריכות להסתכם ל־0',
  transfersMismatch: 'ההעברות לא תואמות לתוצאות. חזור אחורה ונסה שוב',
  invalid: 'אחד הערכים לא תקין. בדוק ונסה שוב',
  missing: 'השחקן או השולחן כבר לא קיימים. רענן ונסה שוב',
  importLimit: 'הגעת למגבלה של 2,000 משחקים מיובאים',
  signedOut: 'פג תוקף ההתחברות. התחבר מחדש ונסה שוב',
  timeout: 'השרת לא הגיב בזמן, נסה שוב',
  generic: 'משהו השתבש, נסה שוב',
};

const HEBREW = /[֐-׿]/;
const NETWORK = /failed to fetch|load failed|networkerror|network request failed|fetch failed|err_internet|the internet connection appears to be offline|timed out|aborted/i;

// online: pass navigator.onLine (false = surely offline).
export function friendlyError(e, online = typeof navigator === 'undefined' ? true : navigator.onLine) {
  if (online === false) return ERRORS.offline;
  if (e == null) return ERRORS.generic;
  if (typeof e === 'string') return HEBREW.test(e) ? e : ERRORS.generic;
  const code = String(e.code ?? '');
  const text = [e.message, e.details, e.hint].filter(Boolean).join(' ');

  if (NETWORK.test(text) || e.name === 'TypeError' && /fetch/i.test(text)) return ERRORS.offline;

  switch (code) {
    case '23505':
      if (/seat/.test(text)) return ERRORS.seatTaken;
      if (/table_players_table_id_user_id/.test(text)) return ERRORS.alreadySeated;
      return ERRORS.exists;
    case '42501':
      if (/game has ended/i.test(text)) return ERRORS.gameEnded;
      if (/only the table manager|manager cannot be changed/i.test(text)) return ERRORS.managerOnly;
      if (/table not found/i.test(text)) return ERRORS.tableGone;
      return ERRORS.noPermission;
    case '23514':
      if (/add up to 0/i.test(text)) return ERRORS.resultsUnbalanced;
      if (/transfers/i.test(text)) return ERRORS.transfersMismatch;
      return ERRORS.invalid;
    case '22P02':
    case '22003':
    case '22001':
      return ERRORS.invalid;
    case '23503':
      return ERRORS.missing;
    case '54000':
      return ERRORS.importLimit;
    case 'PGRST116':
      return ERRORS.tableGone;
    case 'PGRST301':
    case 'PGRST303':
      return ERRORS.signedOut;
    case '57014':
      return ERRORS.timeout;
    default:
  }
  if (e.status === 401 || /jwt|refresh token|not authenticated|session/i.test(text)) return ERRORS.signedOut;
  if (e.status === 403) return ERRORS.noPermission;
  // Our own errors are already in Hebrew (e.g. "השולחן מלא").
  if (HEBREW.test(e.message ?? '')) return e.message;
  return ERRORS.generic;
}
