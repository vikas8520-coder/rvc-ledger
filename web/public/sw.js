const CACHE = 'rvc-ledger-v10';
const SHELL = ['/manifest.json', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => {}))
  );
  // Don't skipWaiting — let the new SW activate only when all tabs are closed
  // This prevents mid-session refreshes that lose form data
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      // Delete ALL old caches — forces complete refresh
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  // Don't clients.claim() — don't take over existing tabs mid-session
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Never intercept non-GET requests (POST, PUT, DELETE etc.)
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Only intercept same-origin requests
  if (url.origin !== self.location.origin) return;

  // Network-first for API calls — fall back to cache when offline
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || new Response('[]', { headers: { 'Content-Type': 'application/json' } })))
    );
    return;
  }

  // Cache-first for static assets (immutable, content-hashed URLs)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        });
      })
    );
    return;
  }

  // For pages (HTML): network-only, NO caching.
  // Caching HTML is dangerous because the JS bundle URLs in the HTML
  // become stale after a new deployment, causing page crashes when
  // the old bundles are no longer available on the server.
  // Let the browser handle page requests normally (no SW interception).
  // When offline, fall back to cached '/' only as a last resort.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/').then((cached) => cached || new Response('Offline', { status: 503 })))
    );
    return;
  }

  // For other GET requests (manifest, icon, etc.): cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      });
    })
  );
});
