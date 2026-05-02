/* public/service-worker.js */

const CACHE_NAME = 'thrivemetrics-v7';

// App shell files to cache on install
const APP_SHELL = [
  '/',
  '/index.html',
  '/static/js/main.chunk.js',
  '/static/js/bundle.js',
  '/static/css/main.chunk.css',
  '/manifest.json',
];

// Install: cache the app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(APP_SHELL).catch(() => {
        // Some files may not exist yet -- that's fine
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: serve app shell from cache, pass API calls through to network
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never cache Supabase API or function calls
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('anthropic.com') ||
    url.hostname.includes('strava.com') ||
    url.hostname.includes('fitbit.com') ||
    url.hostname.includes('openfoodfacts.org') ||
    url.hostname.includes('usda.gov')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // For navigation requests (page loads/resumes), serve from cache first
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then(cached => {
        return cached || fetch(event.request);
      })
    );
    return;
  }

  // For static assets: cache first, fall back to network
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        // Cache successful static asset responses
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});