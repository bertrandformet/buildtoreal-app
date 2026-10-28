// Service worker : le jeu s'ouvre hors ligne, dès la première visite avec connexion.
// - À l'installation, tous les fichiers du jeu sont mis en mémoire d'un coup (liste écrite par `scripts/precache.ts` à la construction).
// - Les fichiers à nom unique (code, styles, police) sortent de la mémoire d'abord ; la page d'accueil passe par le réseau, avec la mémoire en secours.
// - Une nouvelle version s'installe en attente : elle ne prend la main que sur demande du joueur (bandeau « Nouvelle version »).
// - Il ne touche jamais aux projets : ceux-ci vivent dans IndexedDB, pas dans ces mémoires.
const CACHE = 'bt-d625b1ac8f';
const PRECACHE = [
  "./",
  "./OFL-Baloo2.txt",
  "./apple-touch-icon.png",
  "./assets/baloo2-latin-8NeBJN4T.woff2",
  "./assets/index-4lC5vH8N.css",
  "./assets/index-C7AB6MHb.js",
  "./assets/logo-CYNBmSaD.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./index.html",
  "./manifest.webmanifest"
];
const NAVIGATION_TIMEOUT_MS = 4000;

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

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('délai dépassé')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (request.mode === 'navigate') {
        // Page d'accueil : le réseau d'abord (toujours la dernière version en ligne), la mémoire si le réseau manque ou tarde.
        try {
          return await withTimeout(fetch(request), NAVIGATION_TIMEOUT_MS);
        } catch (error) {
          const shell = (await cache.match(new URL('./index.html', self.registration.scope), { ignoreVary: true })) || (await cache.match(new URL('./', self.registration.scope), { ignoreVary: true }));
          if (shell) return shell;
          throw error;
        }
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
