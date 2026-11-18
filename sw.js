// Service worker de World : démarrage rapide et jeu jouable sans internet.
// - Three.js (CDN, version figée) : servi depuis le cache dès le 2e lancement (plus de téléchargement).
// - Fichiers du jeu : réseau d'abord (les mises à jour arrivent tout de suite), cache si pas de réseau.
// - Rien d'autre (POST /api/chat, autres sites) n'est touché.
const CACHE = 'world-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const cdn = url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/npm/three@');
  const own = url.origin === self.location.origin && !url.pathname.includes('/api/');
  if (!cdn && !own) return;
  if (cdn) { // version figée dans l'adresse : le cache suffit
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }
  e.respondWith((async () => { // réseau d'abord, cache en secours
    const c = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res.ok) c.put(url.origin + url.pathname, res.clone()); // (rangé sans « ?test », « ?2d »… : une seule copie par fichier)
      return res;
    } catch (err) {
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      throw err;
    }
  })());
});
