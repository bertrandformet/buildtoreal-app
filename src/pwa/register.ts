// Enregistrement du service worker et détection d'une nouvelle version.
// Une nouvelle version s'installe en attente ; `onUpdateReady` reçoit la fonction qui la met en service (et recharge la page).
// Rien ne se recharge tout seul : le joueur choisit le moment, après que son projet a été enregistré.

const CHECK_EVERY_MS = 60 * 60 * 1000;

export function registerServiceWorker(onUpdateReady: (apply: () => void) => void): void {
  if (!('serviceWorker' in navigator)) return;
  let applying = false;
  // « controllerchange » a lieu aussi à la toute première installation : on ne recharge que si le joueur a demandé la mise à jour.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applying) location.reload();
  });
  const offer = (worker: ServiceWorker) =>
    onUpdateReady(() => {
      applying = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    });
  const start = async () => {
    let registration: ServiceWorkerRegistration;
    try {
      registration = await navigator.serviceWorker.register('./sw.js');
    } catch {
      return;
    }
    // Une version attend déjà (page rouverte sans avoir mis à jour) : on le propose de nouveau.
    if (registration.waiting && navigator.serviceWorker.controller) offer(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
      });
    });
    const check = () => void registration.update().catch(() => undefined);
    window.setInterval(check, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
  };
  if (document.readyState === 'complete') void start();
  else window.addEventListener('load', () => void start());
}
