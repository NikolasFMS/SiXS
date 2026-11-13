const CACHE_PREFIX = 'sovpadenie-sixes';
const CACHE_NAME = `${CACHE_PREFIX}-v2-static`;
const FONTS_CACHE_NAME = `${CACHE_PREFIX}-fonts-v1`;

const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './icon.svg',
  './apple-touch-icon.png',
  './pwa-192x192.png',
  './pwa-512x512.png',
  './pwa-maskable-512x512.png',
  './src/main.js',
  './src/app.js',
  './src/data/decks.js',
  './src/utils/audio.js',
  './src/utils/i18n.js',
  './src/utils/storage.js',
  './src/utils/wakeLock.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(
        CORE_ASSETS.map(async (asset) => {
          const assetUrl = new URL(asset, self.registration.scope).href;
          try {
            const response = await fetch(assetUrl, { cache: 'reload' });
            if (response && response.ok) {
              await cache.put(assetUrl, response);
            }
          } catch {
            // Fallback to default fetch if reload fails
            await cache.add(assetUrl).catch(() => {});
          }
        })
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME && key !== FONTS_CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Cache Google Fonts (optional, offline-friendly)
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONTS_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        try {
          const response = await fetch(event.request);
          if (response && (response.ok || response.type === 'opaque')) {
            cache.put(event.request, response.clone());
          }
          return response;
        } catch {
          return cached || Response.error();
        }
      })
    );
    return;
  }

  // Only handle requests belonging to this app's scope
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) {
    return;
  }

  const indexUrl = new URL('./index.html', self.registration.scope).href;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const response = await fetch(event.request);
          if (response && response.ok) {
            cache.put(indexUrl, response.clone());
          }
          return response;
        } catch {
          return (
            (await cache.match(event.request, { ignoreSearch: true })) ||
            (await cache.match(indexUrl)) ||
            Response.error()
          );
        }
      })()
    );
    return;
  }

  // Stale-while-revalidate for static assets within app scope
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request, { ignoreSearch: true });
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        })
        .catch(() => null);

      if (cached) {
        event.waitUntil(fetchPromise);
        return cached;
      }
      return (await fetchPromise) || Response.error();
    })
  );
});
