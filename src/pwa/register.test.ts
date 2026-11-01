// Enregistrement du service worker : la mise à jour ne se déclenche que sur demande, et un second onglet se contente de recharger.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerServiceWorker } from './register';

interface FakeWorker {
  state: string;
  postMessage: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
}

function setup(waitingState: string) {
  const listeners = new Map<string, () => void>();
  const worker: FakeWorker = { state: waitingState, postMessage: vi.fn(), addEventListener: vi.fn() };
  const registration = { waiting: worker, installing: null, addEventListener: vi.fn(), update: vi.fn().mockResolvedValue(undefined) };
  const reload = vi.fn();
  vi.stubGlobal('navigator', {
    serviceWorker: {
      controller: {},
      register: vi.fn().mockResolvedValue(registration),
      addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
    },
  });
  vi.stubGlobal('location', { reload });
  vi.stubGlobal('document', { readyState: 'complete', addEventListener: vi.fn(), visibilityState: 'visible' });
  vi.stubGlobal('window', { setInterval: vi.fn(), addEventListener: vi.fn() });
  let apply: (() => void) | undefined;
  registerServiceWorker((fn) => {
    apply = fn;
  });
  return { worker, registration, reload, listeners, getApply: async () => (await vi.waitFor(() => expect(apply).toBeDefined()), apply!) };
}

afterEach(() => vi.unstubAllGlobals());

describe('mise à jour du service worker', () => {
  it('une version en attente : « mettre à jour » la demande au worker et ne recharge qu’à son entrée en service', async () => {
    const { worker, reload, listeners, getApply } = setup('installed');
    (await getApply())();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).not.toHaveBeenCalled();
    listeners.get('controllerchange')!();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('une version déjà mise en service par un autre onglet : on recharge simplement', async () => {
    const { worker, reload, getApply } = setup('activated');
    (await getApply())();
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('sans demande du joueur, un changement de contrôleur ne recharge pas', async () => {
    const { reload, listeners, getApply } = setup('installed');
    await getApply();
    listeners.get('controllerchange')!();
    expect(reload).not.toHaveBeenCalled();
  });

  it('vérifie une nouvelle version dès le démarrage', async () => {
    const { registration, getApply } = setup('installed');
    await getApply();
    expect(registration.update).toHaveBeenCalled();
  });
});
