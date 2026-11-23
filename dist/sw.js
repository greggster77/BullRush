const cachePrefix = 'bullrush-app-';
const cacheName = cachePrefix + 'v2';
const appShell = [
  './',
  './style.css',
  './app.js',
  './core.mjs',
  './board.mjs',
  './detection.mjs',
  './manifest.json',
  './icon.svg',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(cacheApp());
});

async function cacheApp() {
  const cache = await caches.open(cacheName);
  const responses = await Promise.all(appShell.map(async path => {
    const url = new URL(path, self.registration.scope);
    const response = await fetch(url, { cache: 'reload', redirect: 'error' });
    const isImage = /\.(png|svg)$/.test(path);
    const isPage = path === './';
    const type = response.headers.get('Content-Type') || '';

    if (!response.ok || (!isPage && !isImage && type.includes('text/html'))) {
      throw new Error('Bullrush cache could not load ' + path);
    }

    return [url, response];
  }));
  await Promise.all(responses.map(([url, response]) => cache.put(url, response)));
}

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith(cachePrefix) && key !== cacheName)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

const assetPaths = new Set(appShell.map(path => new URL(path, self.registration.scope).href));
const home = new URL('./', self.registration.scope);
const index = new URL('./index.html', home);

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (request.mode === 'navigate' && url.origin === home.origin &&
      (url.pathname === home.pathname || url.pathname === index.pathname)) {
    // Honor sign-in and HTTP responses online. Use the app shell offline.
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(cacheName);
      return (await cache.match(home)) || Response.error();
    }));
  } else if (assetPaths.has(url.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(cacheName);
      return (await cache.match(request)) || fetch(request);
    })());
  }
});
