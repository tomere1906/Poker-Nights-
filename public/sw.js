// Minimal offline support: network-first for pages, cache-first for assets.
// Paths are relative to this file, so it works under any base path (e.g. GitHub Pages).
// v4: new logo/app icons (icons are cache-first, so a new name drops the old ones).
const CACHE = 'poker-nights-v4';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['./', './manifest.webmanifest', './icon.svg', './icon-192.png', './apple-touch-icon.png'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Only the app's own files and its fonts are cached. Everything else
  // (Supabase API and auth, Google sign-in, profile pictures) always goes to
  // the network: it's personal, live data and must never be served stale.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin && !FONT_HOSTS.includes(url.hostname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          caches.open(CACHE).then((cache) => cache.put('./', res.clone()));
          return res;
        })
        .catch(() => caches.match('./'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
    )
  );
});
