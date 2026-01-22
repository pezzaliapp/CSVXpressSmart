// service-worker.js
// CSVXpressSmart — Service Worker
// Versione: bumpare SEMPRE quando cambiano asset
const CACHE_VERSION = 'v1.1.0';
const CACHE_NAME = `csvxpresssmart-${CACHE_VERSION}`;

// Asset locali da cacheare (app shell)
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon/CSVXpressSmart-192.png',
  './icon/CSVXpressSmart-512.png'
];

// CDN (cache opportunistica)
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.2/papaparse.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

/* =========================
   INSTALL
   ========================= */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

/* =========================
   ACTIVATE
   ========================= */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => {
      return Promise.all(
        names
          .filter(name => name.startsWith('csvxpresssmart-') && name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

/* =========================
   FETCH
   ========================= */
self.addEventListener('fetch', event => {
  const req = event.request;

  // ❌ ignora richieste non GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* ---------- CDN: network-first ---------- */
  if (CDN_ASSETS.some(cdn => req.url.startsWith(cdn))) {
    event.respondWith(networkFirst(req));
    return;
  }

  /* ---------- Same-origin: cache-first ---------- */
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(req));
    return;
  }

  /* ---------- Fallback ---------- */
  event.respondWith(fetch(req).catch(() => caches.match('./index.html')));
});

/* =========================
   STRATEGIE
   ========================= */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  const cache = await caches.open(CACHE_NAME);
  cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}
