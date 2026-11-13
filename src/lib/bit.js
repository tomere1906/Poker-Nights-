// Opening the Bit app (main screen only; nothing is prefilled).
//
// What Bit publishes (checked 2026-11-11):
// - iPhone: Bank Hapoalim's apple-app-site-association (bitpay.co.il redirects to
//   static.bankhapoalim.co.il) lists the Bit app (com.payments.paymentBit) for the
//   paths /app/* on bitpay.co.il, so https://www.bitpay.co.il/app/ is a universal
//   link that iOS may hand to the app. No custom URL scheme is published.
// - Android: bitpay.co.il/.well-known/assetlinks.json lists the Bit package
//   com.bnhp.payments.paymentsapp; an intent: URL opens its main screen, and
//   Chrome falls back to Google Play by itself when it isn't installed.
// If the app doesn't open, the store page opens instead (it shows "Open" when
// Bit is installed).

export const BIT_UNIVERSAL_LINK = 'https://www.bitpay.co.il/app/';
export const BIT_APP_STORE = 'https://apps.apple.com/il/app/id1182007739';
export const BIT_PACKAGE = 'com.bnhp.payments.paymentsapp';
export const BIT_PLAY_STORE = `https://play.google.com/store/apps/details?id=${BIT_PACKAGE}`;
export const BIT_ANDROID_INTENT =
  `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${BIT_PACKAGE};` +
  `S.browser_fallback_url=${encodeURIComponent(BIT_PLAY_STORE)};end`;

// How long to wait for the app to take over before showing the store page.
const FALLBACK_MS = 1600;

export function phonePlatform(userAgent = navigator.userAgent, touchPoints = navigator.maxTouchPoints ?? 0) {
  if (/android/i.test(userAgent)) return 'android';
  // iPadOS reports itself as a Mac with a touch screen.
  if (/iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && touchPoints > 1)) return 'ios';
  return 'other';
}

// "שלם בביט": opens a personal Bit link (https://www.bitpay.co.il/app/me/<ID>),
// which opens Bit straight on "transfer to <name>" (a universal link on iPhone,
// an app link on Android). On a computer it opens Bit's page in a new tab.
export function openBitLink(link, platform = phonePlatform()) {
  if (platform === 'other') window.open(link, '_blank', 'noopener');
  else window.location.href = link;
}

// Opens Bit; returns false where there is no Bit app to open (a computer).
export function openBit(platform = phonePlatform()) {
  if (platform === 'android') {
    window.location.href = BIT_ANDROID_INTENT;
    return true;
  }
  if (platform !== 'ios') return false;

  // If Bit opens, this page is hidden: cancel the fallback. If it doesn't
  // (no app, or iOS didn't treat the link as a universal link), go to the App Store.
  let timer = null;
  const cancel = () => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', cancel);
  };
  const onHide = () => document.visibilityState === 'hidden' && cancel();
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', cancel);
  timer = setTimeout(() => {
    cancel();
    if (document.visibilityState === 'visible') window.location.href = BIT_APP_STORE;
  }, FALLBACK_MS);
  window.location.href = BIT_UNIVERSAL_LINK;
  return true;
}
