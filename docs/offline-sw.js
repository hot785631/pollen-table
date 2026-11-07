'use strict';
const cacheName = 'pollen-table-e70211407205a3eb';
const root = new URL('./', self.registration.scope);
const paths = ['./', './manifest.webmanifest', './icon.svg', './icon-180.png', './icon-192.png',
  './icon-512.png', './guide.html', './pollen-table-v5.zip'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    try {
      for (const path of paths) {
        const url = new URL(path, root);
        const response = await fetch(url, {cache: 'reload', credentials: 'same-origin'});
        if (!response.ok || new URL(response.url).origin !== root.origin) throw new Error('offline asset unavailable');
        if (path === './' && !(await response.clone().text()).includes('data-pollen-cache="' + cacheName + '"')) {
          throw new Error('offline page unavailable');
        }
        await cache.put(url, response);
      }
      await self.skipWaiting();
    } catch (error) {
      await caches.delete(cacheName);
      throw error;
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('pollen-table-') && key !== cacheName) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== root.origin) return;
  const home = [root.pathname, new URL('index.html', root).pathname].includes(url.pathname);
  const known = paths.some(path => new URL(path, root).pathname === url.pathname);
  if (!home && !known) return;
  event.respondWith(fetch(event.request).catch(async () => {
    const cache = await caches.open(cacheName);
    return (await cache.match(home ? root : url, {ignoreSearch: true})) || Response.error();
  }));
});
