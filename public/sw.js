// Minimal offline support: network-first for pages, cache-first for assets.
// Paths are relative to this file, so it works under any base path (e.g. GitHub Pages).
// v4: new logo/app icons (icons are cache-first, so a new name drops the old ones).
// v5: other pages (privacy, terms) are cached under their own address, never as the app.
// v6: the 2026-11 release (settling, Bit, imports…); the app now reloads itself when a new worker takes over.
const CACHE = 'poker-nights-v9';
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
    // The app itself (any ?table=… address) is kept as './'; other pages under their own address.
    const root = new URL('./', self.location).pathname;
    const key = url.pathname === root || url.pathname === root + 'index.html' ? './' : url.pathname;
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(key, copy));
          }
          return res;
        })
        .catch(() => caches.match(key).then((cached) => cached || caches.match('./')))
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
