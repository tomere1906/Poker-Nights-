import { describe, expect, it } from 'vitest';
import { describeLog } from './logText.js';

const strip = (s) => s.replace(/[⁦⁩]/g, '').replace(/ /g, ' ');
const say = (action, details, actor = 'אסף') => strip(describeLog({ action, details, actor: actor && { display_name: actor } }));

describe('describeLog', () => {
  it('writes the self-added buy-in like the example', () => {
    expect(say('buy_in_added', { name: 'אסף', amount: 50, self: true })).toBe('אסף הוסיף לעצמו כניסה של 50 ₪');
  });

  it('names the player when someone else adds the buy-in', () => {
    expect(say('buy_in_added', { name: 'עידו', amount: 100, self: false }, 'תומר')).toBe('תומר הוסיף כניסה של 100 ₪ לעידו');
  });

  it('describes moves with 1-based seat numbers', () => {
    expect(say('player_moved', { name: 'בן', from: 0, to: 3 })).toBe('אסף העביר את בן מכיסא 1 לכיסא 4');
  });

  it('describes co-managers and the game lifecycle', () => {
    expect(say('co_manager_added', { name: 'שקד' })).toBe('אסף מינה את שקד למנהל משותף');
    expect(say('game_started', {})).toBe('אסף התחיל את המשחק');
    expect(say('mode_changed', { mode: 'self_add' })).toBe('אסף שינה: כל אחד מוסיף לעצמו כניסות');
  });

  it('falls back to "המערכת" when there is no actor', () => {
    expect(say('game_ended', {}, null)).toBe('המערכת סיים את המשחק');
  });
});

describe('describeLog: exits and table names', () => {
  it('describes exits with the end-game labels', () => {
    expect(say('player_out', { name: 'עידו', kind: 'lost_all', chips: 0 }, 'תומר')).toBe('תומר סימן שעידו יצא: הפסיד הכל 💀');
    expect(say('player_out', { name: 'עידו', kind: 'even', chips: 100 }, 'תומר')).toBe('תומר סימן שעידו יצא: מאוזן 🤝');
    expect(say('player_out', { name: 'עידו', kind: 'amount', chips: 80 }, 'תומר')).toBe('תומר סימן שעידו יצא עם 80 ₪ 🚪');
    expect(say('player_back', { name: 'עידו' }, 'תומר')).toBe('תומר החזיר את עידו למשחק');
  });

  it('describes rounding changes', () => {
    expect(say('rounding_changed', { old: 10, new: 50 }, 'תומר')).toBe('תומר שינה את עיגול הסכומים ל־50 ₪');
    expect(say('rounding_changed', { old: 10, new: 1 }, 'תומר')).toBe('תומר שינה: בלי עיגול (לשקל)');
  });

  it('describes who covers results that do not add up', () => {
    expect(say('adjust_changed', { method: 'equal' }, 'תומר')).toBe('תומר בחר: את ההפרש מחלקים שווה בין כל השחקנים');
    expect(say('adjust_changed', { method: 'winners' }, 'תומר')).toBe('תומר בחר: את ההפרש מחלקים בין המנצחים לפי הרווח');
    expect(say('adjust_changed', { method: 'player', name: 'אסף' }, 'תומר')).toBe('תומר בחר: אסף מכסה את ההפרש');
    expect(say('adjust_changed', { method: 'player', name: null }, 'תומר')).toBe('תומר בחר ששחקן מסוים יכסה את ההפרש');
    expect(say('adjust_changed', { method: null }, 'תומר')).toBe('תומר ביטל את הבחירה מי מכסה את ההפרש');
    const text = say('results_adjusted', { gap: 50, changes: [{ name: 'אסף', amount: -30 }, { name: 'עידו', amount: -20 }] });
    expect(text).toContain('תיקון הפרש של');
    expect(text).toContain('אסף');
    expect(text).toContain('−30');
    expect(say('results_adjusted', { gap: 0, changes: [{ name: 'אסף', amount: -10 }] })).toContain('תיקון עיגול');
    // Real changes: a change made by rounding alone is marked.
    const real = say('results_adjusted', {
      gap: 5,
      changes: [{ name: 'יורי', amount: -5, share: -10 }, { name: 'עידו', amount: -5, share: 0 }],
    });
    expect(real.endsWith('יורי −5 ₪, עידו −5 ₪ (עיגול)')).toBe(true);
  });

  it('describes "לא כאן" marks and chip value changes', () => {
    expect(say('presence_changed', { name: 'תומר', absent: true }, 'אסף')).toBe('אסף סימן שתומר לא כאן');
    expect(say('presence_changed', { name: 'תומר', absent: false }, 'אסף')).toBe('אסף סימן שתומר כאן');
    expect(say('chip_value_changed', { old: 1, new: 0.5 }, 'תומר')).toContain('שווי הצ׳יפ');
    expect(say('chip_value_changed', { old: 1, new: 0.5 }, 'תומר')).toContain('0.5');
  });

  it('describes the settling closing by itself, by hand, and opening again', () => {
    expect(say('game_settled', { manual: false }, 'עידו')).toBe('כולם שילמו ✓ ההתחשבנות נסגרה');
    expect(say('game_settled', { manual: true }, 'אסף')).toBe('אסף סגר את ההתחשבנות');
    expect(say('settling_reopened', { manual: false }, 'אסף')).toContain('נפתחה שוב');
  });

  it('describes "שולם ✓" marks, without any phone number', () => {
    expect(say('transfer_paid', { name: 'עידו', to: 'תומר', amount: 150 }, 'עידו')).toBe('עידו סימן ששולם: עידו ← תומר 150 ₪ ✓');
    expect(say('transfer_unpaid', { name: 'עידו', to: 'תומר', amount: 150 }, 'אסף')).toBe(
      'אסף ביטל סימון תשלום: עידו ← תומר 150 ₪'
    );
  });

  it('describes cash paid during the night', () => {
    expect(say('cash_added', { name: 'נדב', amount: 200 }, 'תומר')).toBe('תומר רשם שנדב שילם 200 ₪ במזומן 💵');
    expect(say('cash_removed', { name: 'נדב', amount: 200 }, 'תומר')).toBe('תומר מחק מזומן של 200 ₪ של נדב');
  });

  it('describes new buy-in amounts', () => {
    expect(say('settings_changed', { initial_buy_in: 200, rebuy_amounts: [200, 500] }, 'תומר')).toBe('תומר עדכן את הסכומים: כניסה 200 ₪ · +200 +500');
    expect(say('settings_changed', {}, 'תומר')).toBe('תומר עדכן את סכומי הכניסה');
  });

  it('describes table renames', () => {
    expect(say('table_renamed', { old: null, new: 'שישי אצל אסף' }, 'תומר')).toBe('תומר קרא לשולחן ״שישי אצל אסף״');
    expect(say('table_renamed', { old: 'שישי', new: null }, 'תומר')).toBe('תומר הסיר את שם השולחן');
  });
});
