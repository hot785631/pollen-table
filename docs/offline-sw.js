'use strict';
const cacheName = 'pollen-table-ca32d812ec238e05';
const root = new URL('./', self.registration.scope);
const paths = ['./', './manifest.webmanifest', './icon.svg', './icon-180.png', './icon-192.png',
  './icon-512.png', './guide.html', './pollen-table-v5.zip', './meadow-cinema.webp', './cine-cast.webp',
  './campaign-ant.webp', './campaign-bee.webp', './campaign-beetle.webp', './campaign-spider.webp',
  './campaign-butterfly.webp', './petit-pollen.mp3'];

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
    const stored = await cache.match(home ? root : url, {ignoreSearch: true});
    if (!stored) return Response.error();
    // Mobile media players can request a byte range even for the first seconds of a track.
    const range = event.request.headers.get('Range');
    if (!range || !url.pathname.endsWith('/petit-pollen.mp3')) return stored;
    const buffer = await stored.arrayBuffer();
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    const invalid = () => new Response(null, {status:416, headers:{'Content-Range':'bytes */'+buffer.byteLength}});
    if (!match || (!match[1] && !match[2])) return invalid();
    const start = match[1] ? Number(match[1]) : Math.max(0, buffer.byteLength - Number(match[2]));
    const last = match[1] && match[2] ? Math.min(Number(match[2]),buffer.byteLength-1) : buffer.byteLength-1;
    if (start > last || start >= buffer.byteLength) return invalid();
    return new Response(buffer.slice(start,last+1), {status:206, headers:{
      'Content-Type':'audio/mpeg','Accept-Ranges':'bytes','Content-Length':String(last-start+1),
      'Content-Range':'bytes '+start+'-'+last+'/'+buffer.byteLength
    }});
  }));
});
