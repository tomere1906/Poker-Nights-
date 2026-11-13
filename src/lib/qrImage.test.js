import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { decodeQr } from './qrImage.js';
import { cleanBitLink } from './bitLink.js';

const LINK = 'https://www.bitpay.co.il/app/me/AbC123-xyz_9';

// A QR code drawn like a screenshot: `scale` pixels per module, a quiet zone,
// optional colors, a logo in the middle and a busy screen around it.
function screenshot(text, { scale = 8, dark = [0, 0, 0], light = [255, 255, 255], logo = false, frame = 0 } = {}) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const side = (n + 8) * scale;
  const width = side + frame * 2;
  const height = side + frame * 4;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const qx = Math.floor((x - frame) / scale) - 4;
      const qy = Math.floor((y - frame * 2) / scale) - 4;
      let color = [40, 40, 60]; // the app's screen around the code
      if (x >= frame && x < frame + side && y >= frame * 2 && y < frame * 2 + side) {
        color = qx >= 0 && qy >= 0 && qx < n && qy < n && qr.modules.get(qy, qx) ? dark : light;
        const c = n / 2;
        if (logo && Math.abs(qx - c) < n * 0.1 && Math.abs(qy - c) < n * 0.1) color = [0, 160, 200];
      }
      data.set([...color, 255], (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

describe('reading the Bit QR from a screenshot', () => {
  it('reads a plain QR code', () => {
    expect(decodeQr(jsQR, screenshot(LINK))).toBe(LINK);
  });

  it('reads it with a logo in the middle, inside a screen', () => {
    const text = decodeQr(jsQR, screenshot(LINK, { logo: true, frame: 60, dark: [20, 30, 90] }));
    expect(cleanBitLink(text)).toBe(LINK);
  });

  it('reads light-on-dark codes too', () => {
    expect(decodeQr(jsQR, screenshot(LINK, { dark: [255, 255, 255], light: [0, 0, 0] }))).toBe(LINK);
  });

  it('returns null when there is no QR code', () => {
    const blank = { data: new Uint8ClampedArray(200 * 200 * 4).fill(255), width: 200, height: 200 };
    expect(decodeQr(jsQR, blank)).toBeNull();
  });
});
