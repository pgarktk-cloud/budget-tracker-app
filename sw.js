// Bump CACHE_VERSION any time index.html (or anything in APP_SHELL) changes,
// so returning users pick up the new shell instead of being stuck on an old
// cached copy. The activate step below purges any cache that doesn't match
// the current version.
const CACHE_VERSION = 'v2';
const CACHE_NAME = `allocation-shell-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  'https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js',
  'https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js',
  'https://cdn.jsdelivr.net/npm/prop-types@15.8.1/prop-types.min.js',
  'https://cdn.jsdelivr.net/npm/recharts@2.12.7/umd/Recharts.min.js',
  'https://cdn.jsdelivr.net/npm/@babel/standalone@7.26.10/babel.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // addAll fails the whole install if any single request fails, and the
      // CDN entries are cross-origin, so add them individually and don't let
      // one flaky fetch block the app shell from being cached.
      Promise.allSettled(APP_SHELL.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('allocation-shell-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle safe, cacheable GET requests over http(s).
  if (request.method !== 'GET' || !request.url.startsWith('http')) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);

      const networkFetch = fetch(request)
        .then((response) => {
          // Cache successful same-origin responses and CDN CORS responses;
          // skip opaque/error responses so we never cache a failure.
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached); // offline and not cached: fall through below

      // Stale-while-revalidate: serve cache instantly if we have it, update
      // in the background; otherwise wait on the network.
      return cached || networkFetch;
    })
  );
});