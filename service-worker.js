// service-worker.js
// CSVXpressSmart — Service Worker
// Versione: bumpare SEMPRE quando cambiano asset
const CACHE_VERSION = 'v1.2.1';
const CACHE_NAME = `csvxpresssmart-${CACHE_VERSION}`;

// Asset locali da cacheare (app shell)
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './style.mobile.cards.rev.v3.css',   // ✅ nuovo CSS mobile
  './app.js',
  './manifest.json',
  './icon/CSVXpressSmart-192.png',
  './icon/CSVXpressSmart-512.png',
  './icon/CSVXpressSmart-1024.png'
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
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

/* =========================
   ACTIVATE
   ========================= */
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(name => name.startsWith('csvxpresssmart-') && name !== CACHE_NAME)
        .map(name => caches.delete(name))
    );

    // opzionale ma utile
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch(e) {}
    }

    await self.clients.claim();
  })());
});

/* =========================
   FETCH
   ========================= */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // ✅ NAVIGAZIONI / HTML: network-first (per prendere sempre l'index aggiornato)
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(networkFirst(req, './index.html'));
    return;
  }

  /* ---------- CDN: network-first ---------- */
  if (CDN_ASSETS.some(cdn => req.url.startsWith(cdn))) {
    event.respondWith(networkFirst(req));
    return;
  }

  /* ---------- Same-origin asset: cache-first ---------- */
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

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE_NAME);

  // navigation preload (se disponibile)
  const preload = await eventPreloadResponse();
  if (preload) {
    cache.put(request, preload.clone());
    return preload;
  }

  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fb = await caches.match(fallbackUrl);
      if (fb) return fb;
    }
    throw err;
  }
}

// helper: navigation preload response (se presente)
function eventPreloadResponse() {
  // in alcuni browser event.preloadResponse esiste solo dentro fetch handler
  // quindi qui restituiamo null sempre: è safe. (manteniamo compatibilità)
  return Promise.resolve(null);
}


// Permette alla pagina di forzare l'attivazione del nuovo SW
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
