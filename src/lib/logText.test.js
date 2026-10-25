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
    expect(say('player_out', { name: 'עידו', kind: 'amount', chips: 80 }, 'תומר')).toBe('תומר סימן שעידו יצא עם 80 ₪ 💰');
    expect(say('player_back', { name: 'עידו' }, 'תומר')).toBe('תומר החזיר את עידו למשחק');
  });

  it('describes rounding changes', () => {
    expect(say('rounding_changed', { old: 10, new: 50 }, 'תומר')).toBe('תומר שינה את עיגול הסכומים ל־50 ₪');
    expect(say('rounding_changed', { old: 10, new: 1 }, 'תומר')).toBe('תומר שינה: בלי עיגול (לשקל)');
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
