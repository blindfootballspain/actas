/* Web de ligas: funciona sin conexión con los últimos datos descargados. */
const CACHE = 'ligas-v1';
const BASE = ['./', 'index.html', 'liga.css', 'liga.js', 'icono.svg', 'manifest.webmanifest', '../js/liga-core.js', '../assets/logo.png', '../data/liga.json'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) =>
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('ligas-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
);
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const clave = req.url.split('?')[0];
  e.respondWith(
    fetch(req)
      .then((r) => {
        if (r.ok) {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(clave, copia));
        }
        return r;
      })
      .catch(() => caches.match(clave).then((r) => r || caches.match(new URL('index.html', self.registration.scope).href)))
  );
});
