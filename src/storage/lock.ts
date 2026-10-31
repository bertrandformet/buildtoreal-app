// Un seul onglet modifie un projet à la fois : les autres passent en lecture seule.
// Verrou Web Locks conservé tant que l'onglet est ouvert. Sans cette API, on ne verrouille pas (limite connue).

export interface ProjectLock {
  /** Vrai si cet onglet peut modifier le projet. */
  readonly held: boolean;
  release(): void;
}

interface LockManagerLike {
  request(name: string, options: { ifAvailable: boolean }, callback: (lock: unknown) => Promise<void> | void): Promise<unknown>;
}

export function acquireProjectLock(
  projectId: string,
  locks: LockManagerLike | undefined = typeof navigator === 'undefined' ? undefined : (navigator.locks as unknown as LockManagerLike | undefined),
): Promise<ProjectLock> {
  if (!locks) return Promise.resolve({ held: true, release() {} });
  return new Promise((resolve) => {
    void locks
      .request(`atelier-briques:${projectId}`, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve({ held: false, release() {} });
          return undefined;
        }
        return new Promise<void>((release) => resolve({ held: true, release: () => release() }));
      })
      .catch(() => resolve({ held: true, release() {} }));
  });
}
