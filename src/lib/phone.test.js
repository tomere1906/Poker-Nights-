import { describe, expect, it } from 'vitest';
import { cleanPhone, formatPhone } from './phone.js';
import { BIT_ANDROID_INTENT, BIT_APP_STORE, BIT_UNIVERSAL_LINK, phonePlatform } from './bit.js';

describe('cleanPhone (Israeli mobile numbers for Bit)', () => {
  it('accepts the usual ways people type a mobile number', () => {
    expect(cleanPhone('0521234567')).toBe('0521234567');
    expect(cleanPhone('052-123-4567')).toBe('0521234567');
    expect(cleanPhone(' 052 1234567 ')).toBe('0521234567');
    expect(cleanPhone('+972-52-123-4567')).toBe('0521234567');
    expect(cleanPhone('972521234567')).toBe('0521234567');
    expect(cleanPhone('(050) 111.2222')).toBe('0501112222');
  });

  it('empty means "no number"', () => {
    expect(cleanPhone('')).toBe('');
    expect(cleanPhone('   ')).toBe('');
    expect(cleanPhone(null)).toBe('');
  });

  it('refuses anything that is not an Israeli mobile', () => {
    for (const bad of ['031234567', '052123456', '05212345678', '1234567890', '+15551234567', '00972521234567', '05a1234567', '072-1234567']) {
      expect(cleanPhone(bad)).toBeNull();
    }
  });

  it('formats for display', () => {
    expect(formatPhone('0521234567')).toBe('052-123-4567');
    expect(formatPhone('')).toBe('');
  });
});

describe('opening Bit', () => {
  it('tells iPhone, iPad, Android and computers apart', () => {
    expect(phonePlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe('ios');
    expect(phonePlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios');
    expect(phonePlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 5)).toBe('android');
    expect(phonePlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe('other');
    expect(phonePlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 0)).toBe('other');
  });

  it('uses Bit\'s own link, package and store pages', () => {
    expect(BIT_UNIVERSAL_LINK).toBe('https://www.bitpay.co.il/app/');
    expect(BIT_APP_STORE).toContain('id1182007739');
    expect(BIT_ANDROID_INTENT).toMatch(/^intent:#Intent;.*package=com\.bnhp\.payments\.paymentsapp;.*S\.browser_fallback_url=https%3A%2F%2Fplay\.google\.com.*;end$/);
  });
});
