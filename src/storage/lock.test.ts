import { describe, expect, it } from 'vitest';
import { acquireProjectLock } from './lock';

/** Gestionnaire de verrous minimal, avec la même sémantique « ifAvailable » que Web Locks. */
function fakeLocks() {
  const held = new Set<string>();
  return {
    async request(name: string, _options: { ifAvailable: boolean }, cb: (lock: unknown) => Promise<void> | void) {
      if (held.has(name)) return cb(null);
      held.add(name);
      try {
        await cb({ name });
      } finally {
        held.delete(name);
      }
    },
  };
}

describe('verrou de projet entre onglets', () => {
  it('accorde le verrou au premier onglet et refuse au second', async () => {
    const locks = fakeLocks();
    const a = await acquireProjectLock('p1', locks);
    const b = await acquireProjectLock('p1', locks);
    expect(a.held).toBe(true);
    expect(b.held).toBe(false);
  });

  it('ne gêne pas un autre projet', async () => {
    const locks = fakeLocks();
    expect((await acquireProjectLock('p1', locks)).held).toBe(true);
    expect((await acquireProjectLock('p2', locks)).held).toBe(true);
  });

  it('se libère à la fermeture du premier onglet', async () => {
    const locks = fakeLocks();
    const a = await acquireProjectLock('p1', locks);
    a.release();
    await new Promise((r) => setTimeout(r, 0));
    expect((await acquireProjectLock('p1', locks)).held).toBe(true);
  });

  it('sans gestionnaire de verrous, on ne bloque pas', async () => {
    const a = await acquireProjectLock('p1', undefined);
    expect(a.held).toBe(true);
  });
});
