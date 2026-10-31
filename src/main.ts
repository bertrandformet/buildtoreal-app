import { registerServiceWorker } from './pwa/register';
import { App } from './ui/app';

const params = new URLSearchParams(location.search);
const root = document.getElementById('app');
if (!root) throw new Error('#app introuvable');

const app = new App(root, params.has('debug'));
const forced = params.get('q');
let quality: 'high' | 'low' = 'high';
try {
  if (localStorage.getItem('atelier-briques:qualite') === 'low') quality = 'low';
} catch {
  /* stockage indisponible : qualité élevée */
}
if (forced === 'low' || forced === 'high') quality = forced;
void app.start(quality);
app.startDebugLoop();

// Accès pour les mesures et les tests automatisés (mode ?debug uniquement).
if (params.has('debug')) (window as unknown as { __brick: unknown }).__brick = app.api;

// Hors ligne : service worker enregistré dans la version publiée uniquement ; une nouvelle version est proposée par un bandeau.
if (import.meta.env.PROD) registerServiceWorker((apply) => app.offerUpdate(apply));
