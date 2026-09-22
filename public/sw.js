const CACHE = 'talon-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') {
    return;
  }
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) {
    return;
  }
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('/index.html'))),
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'talon-sync') {
    event.waitUntil(pingClients());
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'talon-please-sync') {
    event.waitUntil(pingClients());
  }
});

async function pingClients() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  for (const client of clients) {
    client.postMessage({ type: 'talon-sync' });
  }
}
