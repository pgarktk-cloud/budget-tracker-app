// Bump BUILD_ID any time index.html (or anything in APP_SHELL) changes, so
// returning users pick up the new shell instead of being stuck on an old
// cached copy. The activate step below purges any cache that doesn't match
// the current build. Keep this in sync with APP_VERSION/BUILD_ID in
// index.html and with version.json — all three should be bumped together
// on every deploy so the displayed build and the cached app release always
// correspond.
const BUILD_ID = '2026.07.30.0004';
const CACHE_NAME = `allocation-shell-${BUILD_ID}`;

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

// The HTML shell is what actually changes on every deploy (features, bug
// fixes). Serving it stale-while-revalidate means you're always looking at
// last deploy's version and only catch up on the *next* load - which is how
// the scroll-lock fix appeared to "not work" even after being pushed. Treat
// it as network-first instead: try the network for the current bytes, and
// only fall back to cache if you're offline.
function isAppShellRequest(request) {
  const url = new URL(request.url);
  return url.origin === self.location.origin &&
    (url.pathname === '/' || url.pathname.endsWith('/index.html'));
}

function isVersionCheckRequest(request) {
  const url = new URL(request.url);
  return url.origin === self.location.origin && url.pathname.endsWith('/version.json');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle safe, cacheable GET requests over http(s).
  if (request.method !== 'GET' || !request.url.startsWith('http')) return;

  // version.json is the update-check signal — it must always come straight
  // from the network so an installed PWA can detect a newer deployed build.
  // Never let it enter the cache, and never serve it from the cache.
  if (isVersionCheckRequest(request)) {
    event.respondWith(fetch(request));
    return;
  }

  if (isAppShellRequest(request)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        try {
          const response = await fetch(request);
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        } catch (err) {
          // Offline: fall back to whatever shell we have cached.
          const cached = await cache.match(request);
          if (cached) return cached;
          throw err;
        }
      })
    );
    return;
  }

  // Everything else (pinned CDN libs, manifest, etc.) keeps
  // stale-while-revalidate: serve cache instantly, refresh in background.
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
