const CACHE_NAME = 'pushup-counter-v5';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './apple-touch-icon.png',
  './icons/pwa-192.png',
  './icons/pwa-512.png',
  './assets/app.js',
  './assets/index.css',
  './models/pose_landmarker_lite.task',
  './vendor/mediapipe/wasm/vision_wasm_internal.js',
  './vendor/mediapipe/wasm/vision_wasm_internal.wasm',
  './vendor/mediapipe/wasm/vision_wasm_module_internal.js',
  './vendor/mediapipe/wasm/vision_wasm_module_internal.wasm',
  './vendor/mediapipe/wasm/vision_wasm_nosimd_internal.js',
  './vendor/mediapipe/wasm/vision_wasm_nosimd_internal.wasm'
];
const NETWORK_FIRST_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/app.js',
  './assets/index.css'
];
const INDEX_URL = new URL('./index.html', self.registration.scope).toString();
const APP_SHELL_URLS = new Set(APP_SHELL.map((path) => new URL(path, self.registration.scope).toString()));
const NETWORK_FIRST_URLS = new Set(
  NETWORK_FIRST_ASSETS.map((path) => new URL(path, self.registration.scope).toString())
);

async function networkFirst(request, cacheKey = request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok) {
      cache.put(cacheKey, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request, INDEX_URL));
    return;
  }

  if (!APP_SHELL_URLS.has(event.request.url)) {
    return;
  }

  if (NETWORK_FIRST_URLS.has(event.request.url)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});
