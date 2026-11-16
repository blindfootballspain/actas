/* La web se ha trasladado: este service worker se elimina a sí mismo y borra la caché antigua. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('ligas-')).map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll())
      .then((cs) => cs.forEach((c) => c.navigate('https://blindfootballspain.github.io/')))
  )
);
