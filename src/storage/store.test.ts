import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../core/game';
import { projectFromGame } from '../core/project';
import { buildReferenceSimple } from '../core/reference';
import { ProjectStore, requestPersistence } from './store';

const META = (id: string, updatedAt: number) => ({ id, name: `Projet ${id}`, createdAt: 1, updatedAt });

function project(id: string, updatedAt = 10) {
  const g = new Game(16, 16, 'vert');
  buildReferenceSimple(g);
  return projectFromGame(g, META(id, updatedAt));
}

async function open(factory = new IDBFactory()) {
  const store = await ProjectStore.open(factory);
  if (!store) throw new Error('ouverture impossible');
  return { store, factory };
}

afterEach(() => vi.restoreAllMocks());

describe('stockage des projets', () => {
  it('relit exactement ce qui a été enregistré', async () => {
    const { store } = await open();
    const p = project('aaa');
    expect((await store.save(p, 'data:image/jpeg;base64,AAAA')).ok).toBe(true);
    const back = await store.load('aaa');
    expect(back.ok).toBe(true);
    if (back.ok) expect(JSON.stringify(back.data)).toBe(JSON.stringify(p));
  });

  it('liste les projets du plus récent au plus ancien, avec leur vignette', async () => {
    const { store } = await open();
    await store.save(project('vieux', 5));
    await store.save(project('neuf', 50), 'data:image/jpeg;base64,BBBB');
    const list = await store.list();
    expect(list.map((s) => s.id)).toEqual(['neuf', 'vieux']);
    expect(list[0]!.thumbnail).toBe('data:image/jpeg;base64,BBBB');
    expect(list[0]!.pieceCount).toBe(project('x').pieces.length);
  });

  it('écrase le même projet au lieu de le dupliquer', async () => {
    const { store } = await open();
    await store.save(project('same', 1));
    await store.save(project('same', 2));
    expect((await store.list()).length).toBe(1);
  });

  it('supprime un projet', async () => {
    const { store } = await open();
    await store.save(project('gone'));
    expect(await store.remove('gone')).toBe(true);
    expect((await store.load('gone')).ok).toBe(false);
    expect(await store.list()).toEqual([]);
  });

  it('signale un projet absent', async () => {
    const { store } = await open();
    const r = await store.load('nope');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('absent');
  });

  it('conserve les préférences', async () => {
    const { store } = await open();
    await store.setMeta('dernierExport', 123);
    expect(await store.getMeta<number>('dernierExport')).toBe(123);
    expect(await store.getMeta('inconnu')).toBeUndefined();
  });

  it('survit à une fermeture et une réouverture (rechargement de la page)', async () => {
    const factory = new IDBFactory();
    const first = (await ProjectStore.open(factory))!;
    const p = project('persist');
    await first.save(p);
    first.close();
    const second = (await ProjectStore.open(factory))!;
    const back = await second.load('persist');
    expect(back.ok && JSON.stringify(back.data) === JSON.stringify(p)).toBe(true);
  });

  it('signale un enregistrement corrompu sans planter, et le reste de la liste reste lisible', async () => {
    const factory = new IDBFactory();
    const { store } = await open(factory);
    await store.save(project('bon', 20));
    // Corruption directe : un enregistrement qui n'est plus un projet valide.
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = factory.open('atelier-briques', 1);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(['projects', 'summaries'], 'readwrite');
      tx.objectStore('projects').put({ id: 'abime', schema: 1, pieces: 'n’importe quoi' });
      tx.objectStore('summaries').put({ id: 'abime', name: 'Abîmé', createdAt: 1, updatedAt: 99, pieceCount: 3 });
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    const bad = await store.load('abime');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('corrompu');
    expect((await store.load('bon')).ok).toBe(true);
    expect((await store.list()).map((s) => s.id)).toContain('bon');
  });

  it('signale un espace plein sans perdre le projet en mémoire', async () => {
    const { store } = await open();
    const p = project('plein');
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Espace insuffisant', 'QuotaExceededError');
    });
    const r = await store.save(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('quota');
    // La donnée passée reste intacte et utilisable.
    expect(p.pieces.length).toBeGreaterThan(0);
  });

  it('retourne null si le stockage est indisponible', async () => {
    expect(await ProjectStore.open(undefined)).toBeNull();
  });
});

describe('persistance demandée au navigateur', () => {
  it('retourne vrai si le navigateur accepte', async () => {
    expect(await requestPersistence({ persisted: async () => false, persist: async () => true } as unknown as StorageManager)).toBe(true);
  });
  it('retourne faux si le navigateur refuse ou ne sait pas', async () => {
    expect(await requestPersistence({ persisted: async () => false, persist: async () => false } as unknown as StorageManager)).toBe(false);
    expect(await requestPersistence(undefined)).toBe(false);
  });
});
