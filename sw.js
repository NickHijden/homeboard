const APP_VERSION = '20261006-02';
const STAGING_PATH_PREFIX = '/homeboard/dev/';
const IS_STAGING = self.location.pathname === '/homeboard/dev' || self.location.pathname.startsWith(STAGING_PATH_PREFIX);
const CACHE_NAME = `${IS_STAGING ? 'homeboard-staging-shell' : 'homeboard-shell'}-${APP_VERSION}`;
const CACHE_PREFIX = IS_STAGING ? 'homeboard-staging-shell-' : 'homeboard-shell-';
const SHELL = [
  './',
  './index.html',
  `./styles.css?v=${APP_VERSION}`,
  `./recurrence.js?v=${APP_VERSION}`,
  `./app.js?v=${APP_VERSION}`,
  './assets/homeboard-banner.png',
  './manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // The production worker has the broader /homeboard/ scope. Leave staging
  // requests to the staging worker so the two environments remain separate.
  const requestPath = new URL(event.request.url).pathname;
  if (!IS_STAGING && requestPath.startsWith(STAGING_PATH_PREFIX)) return;
  // Online updates must win over a stale cached shell. If the tablet is
  // offline, fall back to the last known good response instead.
  event.respondWith(
    fetch(event.request, { cache: 'no-store' }).then((response) => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
      }
      return response;
    }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
