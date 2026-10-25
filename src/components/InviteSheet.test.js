import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import { inviteMessage } from './InviteSheet.jsx';

describe('invite', () => {
  const link = 'https://tomere1906.github.io/Poker-Nights-/?join=abc&key=secret';

  it('builds the Hebrew message with the link', () => {
    expect(inviteMessage(link)).toBe(`בוא לשחק פוקר! 🃏 הצטרף לשולחן: ${link}`);
  });

  it('renders the link as a QR code (SVG)', async () => {
    const svg = await QRCode.toString(link, { type: 'svg', margin: 1 });
    expect(svg.startsWith('<svg')).toBe(true);
  });
});
