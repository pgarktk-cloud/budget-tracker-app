// Bump CACHE_VERSION any time index.html (or anything in APP_SHELL) changes,
// so returning users pick up the new shell instead of being stuck on an old
// cached copy. The activate step below purges any cache that doesn't match
// the current version.
const CACHE_VERSION = 'v3';
const CACHE_NAME = `allocation-shell-${CACHE_VERSION}`;

// Same-origin shell: changes when we ship updates, so it stays
// stale-while-revalidate (serve cached instantly, refresh in background).
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-180.png',
];

// CDN vendor scripts: every URL below is version-pinned, so the content
// behind a given URL never changes. That means there's no benefit to
// racing the network on every load — cache-first serves these straight
// from disk with zero round-trip, which is what makes cold/offline loads
// feel instant on mobile. Bump the version in the URL (not just
// CACHE_VERSION) if you ever need to force a refresh of one of these.
const CDN_SHELL = [
  'https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js',
  'https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js',
  'https://cdn.jsdelivr.net/npm/prop-types@15.8.1/prop-types.min.js',
  'https://cdn.jsdelivr.net/npm/recharts@2.12.7/umd/Recharts.min.js',
  'https://cdn.jsdelivr.net/npm/@babel/standalone@7.26.10/babel.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // addAll fails the whole install if any single request fails, so add
      // everything individually and don't let one flaky fetch block the
      // rest of the shell (same-origin + CDN) from being cached.
      Promise.allSettled([...APP_SHELL, ...CDN_SHELL].map((url) => cache.add(url)))
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

  const isPinnedCdn = CDN_SHELL.includes(request.url);

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);

      // Pinned CDN vendor scripts: cache-first, no network race. The URL
      // is version-locked so a cache hit is guaranteed to be correct —
      // this is what makes repeat loads feel instant, especially on
      // mobile connections. Only touch the network if we somehow don't
      // have it cached yet (e.g. install partially failed).
      if (isPinnedCdn && cached) return cached;

      const networkFetch = fetch(request)
        .then((response) => {
          // Cache successful same-origin responses and CDN CORS responses;
          // skip opaque/error responses so we never cache a failure.
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached); // offline and not cached: fall through below

      // Stale-while-revalidate for everything else (the app shell): serve
      // cache instantly if we have it, refresh in the background so the
      // next load picks up changes; otherwise wait on the network.
      return cached || networkFetch;
    })
  );
});