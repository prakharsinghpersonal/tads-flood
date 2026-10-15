// App-shell cache for offline reloads. API calls always go to the network and
// are never answered from cache, so an outage is reported instead of hidden.
// Assessment data and imagery live in IndexedDB packages, not in this cache.
const PREFIX = 'tads-flood-shell-';
const CACHE = `${PREFIX}v2`;

async function precache() {
  const cache = await caches.open(CACHE);
  const res = await fetch('/', { cache: 'no-store' });
  if (!res.ok) throw new Error(`App shell fetch failed: ${res.status}`);
  const html = await res.clone().text();
  const fromHtml = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  let fromManifest = [];
  const manifest = await fetch('/asset-manifest.json', { cache: 'no-store' });
  if (manifest.ok) fromManifest = (await manifest.json()).files ?? [];
  await cache.addAll([...new Set([...fromHtml, ...fromManifest, '/favicon.svg'])]);
  await cache.put('/', res);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  // Only remove this app's own older shell caches.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/health') return;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('/', copy));
          }
          return res;
        })
        .catch(() => caches.match('/', { ignoreVary: true })),
    );
    return;
  }
  // ignoreVary: precached requests carry no Origin header, while module
  // scripts are requested with one; the hashed shell files are identical.
  event.respondWith(
    caches.match(req, { ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && url.pathname.startsWith('/assets/')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
