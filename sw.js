/* Garde-robe — service worker
   Stratégie :
   - index.html : network-first (tu as toujours la dernière version si tu as du réseau,
     et l'app fonctionne quand même hors-ligne grâce au cache)
   - le reste (icônes, manifest) : cache-first
   - version.json : jamais mis en cache (sert à détecter les mises à jour)
*/

const CACHE = 'garde-robe-v11.0';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .catch(() => {})
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // version.json : toujours réseau, jamais de cache
  if (url.pathname.endsWith('version.json')) {
    e.respondWith(fetch(req).catch(() => new Response('{}', {
      headers: { 'Content-Type': 'application/json' }
    })));
    return;
  }

  // Navigation / index.html : network-first avec repli sur le cache
  if (req.mode === 'navigate' || url.pathname.endsWith('index.html') || url.pathname.endsWith('/')) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Reste : cache-first
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.status === 200 && url.origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => hit))
  );
});
