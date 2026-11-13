// Reads a QR code from a picture (a screenshot of the personal QR in Bit),
// right here in the browser: the picture is never uploaded anywhere.
// The QR library (jsQR) is loaded only when someone picks a picture.

// Bigger pictures are scaled down first (faster, and QR codes stay readable).
const MAX_SIDE = 1600;

// imageData: { data (RGBA), width, height }. The QR text, or null.
export function decodeQr(jsQR, imageData) {
  const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
  return code?.data || null;
}

function pixels(image, side) {
  const scale = Math.min(1, side / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

async function loadImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Some formats only load through <img> (e.g. HEIC on iPhone Safari).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// file: an image the user picked. The QR text, or null when none was found.
export async function readQrFromFile(file) {
  const image = await loadImage(file);
  const { default: jsQR } = await import('jsqr');
  for (const side of [MAX_SIDE, 800, 2400]) {
    const text = decodeQr(jsQR, pixels(image, side));
    if (text) return text;
  }
  return null;
}
