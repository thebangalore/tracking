/* Simple offline service worker for Gym Planner & Tracker
 * Strategy:
 *  - Precache app shell and static assets on install
 *  - Cache-first for static file requests
 *  - SPA navigation fallback to cached index.html
 *  - Cache exercises.json for offline exercise library
 */

const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = `gym-planner-${CACHE_VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/utils.js',
  './js/storage.js',
  './js/exercises.js',
  './js/plan.js',
  './js/workout.js',
  './js/progress.js',
  './js/charts.js',
  './exercises.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET
  if (req.method !== 'GET') return;

  // For navigation requests, serve index.html from cache (SPA fallback)
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => cached || fetch(req))
    );
    return;
  }

  // For same-origin requests: cache-first
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(req));
  }
  // For cross-origin, default network
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if (cached) return cached;

  try {
    const res = await fetch(req);
    // Only cache successful, basic/opaque GETs
    if (res && res.status === 200 && (res.type === 'basic' || res.type === 'opaque')) {
      cache.put(req, res.clone());
    }
    return res;
  } catch (e) {
    // As a minimal offline fallback, return a Response if needed
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}
