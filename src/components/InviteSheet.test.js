import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import { inviteMessage } from './InviteSheet.jsx';

describe('invite', () => {
  const link = 'https://tomere1906.github.io/Poker-Nights-/?join=abc&key=secret';

  it('builds the personal Hebrew message with the manager, table name and link', () => {
    expect(inviteMessage(link, { managerName: 'תומר', tableName: 'שישי אצל אסף' })).toBe(
      `תומר הזמין אותך לשחק פוקר בשולחן 'שישי אצל אסף' 🃏 הצטרף כאן: ${link}`
    );
  });

  it('leaves out the table part when the table has no name', () => {
    expect(inviteMessage(link, { managerName: 'תומר', tableName: null })).toBe(`תומר הזמין אותך לשחק פוקר 🃏 הצטרף כאן: ${link}`);
  });

  it('renders the link as a QR code (SVG)', async () => {
    const svg = await QRCode.toString(link, { type: 'svg', margin: 1 });
    expect(svg.startsWith('<svg')).toBe(true);
  });
});
