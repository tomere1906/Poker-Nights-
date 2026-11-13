import { describe, expect, it } from 'vitest';
import { BIT_LINK_PREFIX, cleanBitLink } from './bitLink.js';

const LINK = `${BIT_LINK_PREFIX}AbC123-xyz_9`;

describe('cleanBitLink', () => {
  it('keeps a personal Bit link as it is', () => {
    expect(cleanBitLink(LINK)).toBe(LINK);
  });

  it('accepts the usual ways people paste it', () => {
    expect(cleanBitLink(`  ${LINK}  `)).toBe(LINK);
    expect(cleanBitLink('bitpay.co.il/app/me/AbC123-xyz_9')).toBe(LINK);
    expect(cleanBitLink('http://bitpay.co.il/app/me/AbC123-xyz_9/')).toBe(LINK);
    expect(cleanBitLink('HTTPS://WWW.BITPAY.CO.IL/app/me/AbC123-xyz_9?utm_source=qr#x')).toBe(LINK);
    expect(cleanBitLink(`שלמו לי בביט: ${LINK} תודה`)).toBe(LINK);
  });

  it('empty means "no link"', () => {
    expect(cleanBitLink('')).toBe('');
    expect(cleanBitLink('   ')).toBe('');
    expect(cleanBitLink(null)).toBe('');
  });

  it('refuses anything that is not a personal Bit link', () => {
    expect(cleanBitLink('https://www.bitpay.co.il/app/')).toBeNull();
    expect(cleanBitLink('https://www.bitpay.co.il/app/me/')).toBeNull();
    expect(cleanBitLink('https://evil.example/app/me/AbC')).toBeNull();
    expect(cleanBitLink('https://bitpay.co.il.evil.example/app/me/AbC')).toBeNull();
    expect(cleanBitLink('https://www.bitpay.co.il/app/pay/AbC')).toBeNull();
    expect(cleanBitLink('https://www.bitpay.co.il/app/me/a%20b')).toBeNull();
    expect(cleanBitLink('0521234567')).toBeNull();
    expect(cleanBitLink(`${BIT_LINK_PREFIX}${'a'.repeat(201)}`)).toBeNull();
  });
});
