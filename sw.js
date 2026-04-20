const CACHE_NAME = 'medistock-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// CDN resources to cache
const CDN_ASSETS = [
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.6.0/jspdf.plugin.autotable.min.js',
  'https://unpkg.com/@supabase/supabase-js@2.39.0/dist/umd/supabase.min.js',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap'
];

const ALL_ASSETS = [...STATIC_ASSETS, ...CDN_ASSETS];

// Install: Cache all assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ALL_ASSETS))
      .catch(err => console.log('Cache install error:', err))
  );
  self.skipWaiting();
});

// Activate: Clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Background Sync registration helper
const registerBackgroundSync = async () => {
  if ('sync' in self.registration) {
    try {
      await self.registration.sync.register('medistock-sync');
      console.log('[SW] Background sync registered');
    } catch (err) {
      console.error('[SW] Background sync failed:', err);
    }
  }
};

// Fetch: Cache-first strategy with network fallback
self.addEventListener('fetch', event => {
  const { request } = event;
  
  // Skip non-GET requests for caching (but let them through)
  if (request.method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }

  // API calls (Supabase) - Network first, no cache
  if (request.url.includes('supabase.co')) {
    event.respondWith(
      fetch(request)
        .catch(() => {
          // Return offline response for API calls
          return new Response(
            JSON.stringify({ error: 'offline', message: 'You are offline. Changes queued for sync.' }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
    return;
  }

  // Static assets - Cache first
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      
      return fetch(request).then(response => {
        // Cache new requests from CDNs
        if (request.url.includes('unpkg.com') || request.url.includes('cdnjs')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => {
        // Fallback for HTML pages
        if (request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        return new Response('Offline - Resource not available', { status: 503 });
      });
    })
  );
});

// Background Sync event
self.addEventListener('sync', event => {
  if (event.tag === 'medistock-sync') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SYNC_NOW' });
        });
      })
    );
  }
});

// Listen for messages from app
self.addEventListener('message', event => {
  if (event.data === 'CHECK_ONLINE') {
    // Try to fetch a small resource to check connectivity
    fetch('https://www.google.com/favicon.ico', { mode: 'no-cors' })
      .then(() => {
        event.source.postMessage({ type: 'ONLINE_STATUS', online: true });
      })
      .catch(() => {
        event.source.postMessage({ type: 'ONLINE_STATUS', online: false });
      });
  }
});

// Periodic sync (if supported) - check every 15 minutes
self.addEventListener('periodicsync', event => {
  if (event.tag === 'medistock-periodic') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SYNC_NOW' });
        });
      })
    );
  }
});