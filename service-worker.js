const CACHE_NAME = 'thiaguinho-wii-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './core/system.js',
  './core/router.js',
  './core/state.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});
