// Bump BUILD_ID any time index.html (or anything in APP_SHELL) changes, so
// returning users pick up the new shell instead of being stuck on an old
// cached copy. The activate step below purges any cache that doesn't match
// the current build. Keep this in sync with APP_VERSION/BUILD_ID in
// index.html and with version.json — all three should be bumped together
// on every deploy so the displayed build and the cached app release always
// correspond.
const BUILD_ID = '2026.09.04.0001';
const CACHE_NAME = `allocation-shell-${BUILD_ID}`;

const APP_SHELL = [
  // './' only — NOT './index.html' as well. Cloudflare Pages 308-redirects
  // /index.html to /, so caching both meant storing a redirected response for
  // the same document under a second key. `isAppShellRequest` below still
  // matches either path, so a direct /index.html hit is handled; there is just
  // no reason to pre-cache the redirecting form of a page we already have.
  './',
  './manifest.webmanifest',
  // Self-hosted webfonts — precached so the Technical Ledger typography renders
  // correctly offline on first load (same-origin, so they'd be cached lazily by
  // the fetch handler too, but precaching avoids a fallback-font flash offline).
  './fonts/inter-400.woff2',
  './fonts/inter-500.woff2',
  './fonts/inter-600.woff2',
  './fonts/inter-700.woff2',
  './fonts/jetbrains-mono-400.woff2',
  './fonts/jetbrains-mono-500.woff2',
  './fonts/jetbrains-mono-600.woff2',
  './fonts/jetbrains-mono-700.woff2',
  'https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js',
  'https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js',
  'https://cdn.jsdelivr.net/npm/prop-types@15.8.1/prop-types.min.js',
  // Real package file, not jsDelivr's generated .min.js — must stay identical
  // to the <script src> in index.html, which pins it with an SRI hash.
  'https://cdn.jsdelivr.net/npm/recharts@2.12.7/umd/Recharts.js',
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

// The HTML shell is served stale-while-revalidate: serve the cached bytes
// instantly (so the app opens immediately even on a slow-but-not-offline
// connection, instead of hanging on a ~1.2 MB document download), and refresh
// the cache in the background for the next open. This was network-first for a
// while — to avoid ever being "one deploy behind" — but that traded away
// exactly the instant-open behaviour a PWA exists for, and hung the app on poor
// data. Freshness is preserved a different way: version.json is network-only
// (below) and index.html compares it against the running BUILD_ID, so a newer
// deploy surfaces as an in-app "Update available — reload" prompt, and the
// next launch is current regardless because this revalidate already refreshed
// the cache. skipWaiting + clients.claim (above) mean the new shell takes over
// on that next load without a second refresh.
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
        // A navigation may arrive as a request for /index.html even though the
        // shell was precached under './' (Pages 308-redirects the two), so fall
        // back to the './' entry when an exact match misses.
        const cached =
          (await cache.match(request)) ||
          (await cache.match('./'));

        const networkFetch = fetch(request)
          .then((response) => {
            if (response && response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached); // offline and not cached: fall through below

        // Serve the cached shell instantly if we have it, revalidate in the
        // background; otherwise (first ever load) wait on the network.
        return cached || networkFetch;
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
