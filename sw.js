// Service worker : le jeu s'ouvre hors ligne, dès la première visite avec connexion.
// - À l'installation, tous les fichiers du jeu sont mis en mémoire d'un coup (liste écrite par `scripts/precache.ts` à la construction).
// - Tout sort de la mémoire de la version active, page d'accueil comprise : la page et ses fichiers sont toujours de la même version, même si la connexion tombe entre les deux.
//   Le réseau ne sert qu'à détecter une nouvelle version (le navigateur recharge sw.js) et de secours si la mémoire n'a pas la page.
// - Une nouvelle version s'installe en attente : elle ne prend la main que sur demande du joueur (bandeau « Nouvelle version »).
// - Il ne touche jamais aux projets : ceux-ci vivent dans IndexedDB, pas dans ces mémoires.
const CACHE = 'bt-a57b9eafc8';
const PRECACHE = [
  "./",
  "./OFL-Baloo2.txt",
  "./apple-touch-icon.png",
  "./assets/baloo2-latin-8NeBJN4T.woff2",
  "./assets/index-C-INtIrE.css",
  "./assets/index-DIgSgbbh.js",
  "./assets/logo-CYNBmSaD.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./index.html",
  "./manifest.webmanifest"
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE.map((path) => new Request(new URL(path, self.registration.scope), { cache: 'reload' })));
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (request.mode === 'navigate') {
        // Page d'accueil : celle de la version active (une nouvelle version attend le bandeau « Nouvelle version »), le réseau seulement si elle manque.
        const shell = (await cache.match(new URL('./index.html', self.registration.scope), { ignoreVary: true })) || (await cache.match(new URL('./', self.registration.scope), { ignoreVary: true }));
        if (shell) return shell;
        return fetch(request);
      }
      // Certains serveurs répondent « Vary: Origin » : sans ignoreVary, un script de la page ne retrouverait pas son exemplaire préchargé.
      const hit = await cache.match(request, { ignoreSearch: true, ignoreVary: true });
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    })(),
  );
});
