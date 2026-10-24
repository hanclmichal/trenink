// Service worker: keeps the whole app available offline. App files are precached per version.
const VERSION = 'v1.0.0';
const APP_CACHE = `app-${VERSION}`;

const APP_FILES = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'app/main.js',
  'app/db.js',
  'app/store.js',
  'app/sync.js',
  'app/merge.js',
  'app/format.js',
  'app/data.js',
  'app/program.js',
  'app/ui.js',
  'app/anim.js',
  'app/body.js',
  'app/charts.js',
  'app/timer.js',
  'app/views/today.js',
  'app/views/session.js',
  'app/views/calendar.js',
  'app/views/library.js',
  'app/views/exercise.js',
  'app/views/stats.js',
  'app/views/plan.js',
  'app/views/settings.js',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/favicon-32.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await cache.addAll(APP_FILES.map(u => new Request(u, { cache: 'reload' })));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('app-') && key !== APP_CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // GitHub API and anything else cross-origin: straight to the network
  if (url.origin !== self.location.origin) return;
  // app shell: cache first, the page itself falls back to index.html
  event.respondWith((async () => {
    const cache = await caches.open(APP_CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch (e) {
      if (req.mode === 'navigate') {
        const shell = await cache.match('index.html') || await cache.match('./');
        if (shell) return shell;
      }
      throw e;
    }
  })());
});
