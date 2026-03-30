// service-worker.js

// 1. Define a unique cache name and the files to cache
const CACHE_NAME = 'fitnotes-utility-v1.1';
const ASSETS_TO_CACHE = [
  '/', // Cache the root path
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/res/icon-192.png',
  '/res/icon-512.png',
  '/res/favicon.ico',
  // IMPORTANT: You must also cache the SQL.js WebAssembly file
  'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.6.2/sql-wasm.js',
  'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.6.2/sql-wasm.wasm',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
];

// 2. 'Install' Event: Run when the Service Worker is first registered
self.addEventListener('install', (event) => {
  // Wait until the promise (caching files) is resolved
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('SW: Caching App Assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
});

// 3. 'Activate' Event: Run when the SW takes control of the page
self.addEventListener('activate', (event) => {
  console.log('SW: Activated');
  // Optional: Clean up old caches here if you update v1 to v2
});

// 4. 'Fetch' Event: The core offline logic
self.addEventListener('fetch', (event) => {
  // Intercept every network request the page makes
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // If the file is in the cache, serve it (OFFLINE SUCCESS)
        if (response) {
          return response;
        }
        // If not in cache, try the network (ONLINE FALLBACK)
        return fetch(event.request);
      })
  );
});