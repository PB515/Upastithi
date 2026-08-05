/*
 * Service worker — network-first with runtime caching.
 *
 * Not cache-first: attendance state changes in real time (someone else may
 * mark a volunteer present between visits), so serving a stale cached
 * response while online risks showing wrong present/absent state — worse
 * than showing nothing. Every successful GET is cached as it's fetched, so
 * a later offline reload of that exact URL (e.g. an already-visited
 * /e/<token>) can still be served. Nothing is precached for /e/* — the
 * token is unknown ahead of time — only the universal entry points below.
 * Registered by lib/pwa/register-sw.tsx. Bump CACHE on each deploy that
 * should invalidate old runtime-cached entries.
 */
const CACHE = 'site-shell-v2';
const SHELL = ['/', '/login'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never cache mutations
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
