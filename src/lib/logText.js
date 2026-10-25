// Turns a table_log row into a short Hebrew sentence, e.g.
// "אסף הוסיף לעצמו כניסה של 50 ₪". Pure: no React, no Supabase.
import { formatShekel } from './format.js';
import { EXITS } from './game.js';

const seatLabel = (seat) => `כיסא ${Number(seat) + 1}`;

export function describeLog(entry) {
  const who = entry.actor?.display_name ?? 'המערכת';
  const d = entry.details ?? {};
  const name = d.name ?? 'שחקן';

  switch (entry.action) {
    case 'buy_in_added':
      return d.self
        ? `${who} הוסיף לעצמו כניסה של ${formatShekel(d.amount)}`
        : `${who} הוסיף כניסה של ${formatShekel(d.amount)} ל${name}`;
    case 'buy_in_changed':
      return `${who} שינה כניסה של ${name} מ־${formatShekel(d.old_amount)} ל־${formatShekel(d.amount)}`;
    case 'buy_in_removed':
      return `${who} מחק כניסה של ${formatShekel(d.amount)} של ${name}`;
    case 'player_seated':
      return d.guest ? `${who} הושיב את ${name} (אורח)` : `${who} הושיב את ${name}`;
    case 'player_removed':
      return `${who} הוציא את ${name} מהשולחן`;
    case 'player_moved':
      return `${who} העביר את ${name} מ${seatLabel(d.from)} ל${seatLabel(d.to)}`;
    case 'player_renamed':
      return d.new ? `${who} שינה את השם בשולחן ל־${d.new}` : `${who} החזיר ל${name} את השם שלו`;
    case 'player_recolored':
      return `${who} שינה את הצבע של ${name}`;
    case 'player_out': {
      const exit = EXITS[d.kind];
      if (d.kind === 'amount') return `${who} סימן ש${name} יצא עם ${formatShekel(d.chips)} ${exit.icon}`;
      return `${who} סימן ש${name} יצא: ${exit?.label ?? d.kind} ${exit?.icon ?? ''}`.trim();
    }
    case 'player_back':
      return `${who} החזיר את ${name} למשחק`;
    case 'table_renamed':
      return d.new ? `${who} קרא לשולחן ״${d.new}״` : `${who} הסיר את שם השולחן`;
    case 'result_set':
      return `${who} הזין תוצאה ל${name}`;
    case 'member_joined':
      return `${name} הצטרף לשולחן`;
    case 'member_removed':
      return `${who} הסיר את ${name} מהשולחן`;
    case 'co_manager_added':
      return `${who} מינה את ${name} למנהל משותף`;
    case 'co_manager_removed':
      return `${who} הסיר את ${name} מהמנהלים`;
    case 'game_started':
      return `${who} התחיל את המשחק`;
    case 'game_ended':
      return `${who} סיים את המשחק`;
    case 'game_reset':
      return `${who} החזיר את השולחן להושבה`;
    case 'mode_changed':
      return d.mode === 'self_add' ? `${who} שינה: כל אחד מוסיף לעצמו כניסות` : `${who} שינה: רק מנהלים מוסיפים כניסות`;
    case 'settings_changed':
      return `${who} עדכן את סכומי הכניסה`;
    default:
      return `${who}: ${entry.action}`;
  }
}
