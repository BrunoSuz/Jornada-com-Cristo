const CACHE_PREFIX = 'caminho-diario-';
const CACHE = `${CACHE_PREFIX}v6`;
const SUPABASE_MODULE = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.7/dist/umd/supabase.min.js';

const LOCAL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './supabase-config.js',
  './js/constants.js',
  './js/storage.js',
  './js/sync-engine.js',
  './js/utils.js',
  './js/validation.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(LOCAL_ASSETS);
    await Promise.allSettled([cache.add(SUPABASE_MODULE)]);
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isLocalAsset = url.origin === self.location.origin;
  const isPublicSdk = url.href === SUPABASE_MODULE;

  // Nunca interceptar ou armazenar respostas de Auth, REST ou Realtime do Supabase.
  if (!isLocalAsset && !isPublicSdk) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request)
      .then(async response => {
        if (response.ok) (await caches.open(CACHE)).put('./index.html', response.clone());
        return response;
      })
      .catch(() => caches.match('./index.html')));
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(async response => {
    if (response.ok && response.type !== 'opaque') (await caches.open(CACHE)).put(event.request, response.clone());
    return response;
  })));
});
