// Stockage local des projets (IndexedDB). Aucune erreur ne remonte en exception : chaque appel dit ce qui s'est passé,
// et la construction en cours, en mémoire, n'est jamais touchée par un échec de stockage.

import { parseProject, type ProjectData } from '../core/project';

const DB_NAME = 'atelier-briques';
const DB_VERSION = 1;
const PROJECTS = 'projects';
const SUMMARIES = 'summaries';
const META = 'meta';

export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly pieceCount: number;
  readonly thumbnail?: string;
}

export type SaveResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'quota' | 'erreur'; readonly message: string };

export type LoadResult =
  | { readonly ok: true; readonly data: ProjectData }
  | { readonly ok: false; readonly reason: 'absent' | 'corrompu' | 'erreur'; readonly message: string };

function isQuota(error: unknown): boolean {
  const e = error as { name?: string; code?: number } | null;
  return !!e && (e.name === 'QuotaExceededError' || e.code === 22 || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException('transaction annulée', 'AbortError'));
  });
}

export class ProjectStore {
  private readonly db: IDBDatabase;

  private constructor(db: IDBDatabase) {
    this.db = db;
  }

  /** Ouvre la base. Retourne null si le stockage est indisponible (navigation privée, blocage…). */
  static async open(factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB): Promise<ProjectStore | null> {
    if (!factory) return null;
    try {
      const req = factory.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(SUMMARIES)) db.createObjectStore(SUMMARIES, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      };
      return new ProjectStore(await request(req));
    } catch {
      return null;
    }
  }

  close(): void {
    this.db.close();
  }

  async save(data: ProjectData, thumbnail?: string): Promise<SaveResult> {
    try {
      const tx = this.db.transaction([PROJECTS, SUMMARIES], 'readwrite');
      tx.objectStore(PROJECTS).put(data);
      const summary: ProjectSummary = {
        id: data.id,
        name: data.name,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        pieceCount: data.pieces.length,
        ...(thumbnail ? { thumbnail } : {}),
      };
      tx.objectStore(SUMMARIES).put(summary);
      await done(tx);
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: isQuota(error) ? 'quota' : 'erreur', message: String((error as Error)?.message ?? error) };
    }
  }

  async load(id: string): Promise<LoadResult> {
    try {
      const raw = await request(this.db.transaction(PROJECTS).objectStore(PROJECTS).get(id));
      if (raw === undefined) return { ok: false, reason: 'absent', message: 'projet introuvable' };
      const parsed = parseProject(raw);
      if (!parsed.ok) return { ok: false, reason: 'corrompu', message: parsed.error };
      return { ok: true, data: parsed.data };
    } catch (error) {
      return { ok: false, reason: 'erreur', message: String((error as Error)?.message ?? error) };
    }
  }

  /** Résumés des projets, du plus récent au plus ancien. Les entrées illisibles sont ignorées. */
  async list(): Promise<ProjectSummary[]> {
    try {
      const all = await request(this.db.transaction(SUMMARIES).objectStore(SUMMARIES).getAll());
      return (all as ProjectSummary[])
        .filter((s) => s && typeof s.id === 'string' && typeof s.name === 'string' && typeof s.updatedAt === 'number')
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return [];
    }
  }

  async remove(id: string): Promise<boolean> {
    try {
      const tx = this.db.transaction([PROJECTS, SUMMARIES], 'readwrite');
      tx.objectStore(PROJECTS).delete(id);
      tx.objectStore(SUMMARIES).delete(id);
      await done(tx);
      return true;
    } catch {
      return false;
    }
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    try {
      return (await request(this.db.transaction(META).objectStore(META).get(key))) as T | undefined;
    } catch {
      return undefined;
    }
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    try {
      const tx = this.db.transaction(META, 'readwrite');
      tx.objectStore(META).put(value, key);
      await done(tx);
    } catch {
      /* préférence perdue : sans gravité */
    }
  }
}

/** Demande au navigateur de ne pas effacer les données du site ; retourne true si c'est acquis. */
export async function requestPersistence(storage: StorageManager | undefined = typeof navigator === 'undefined' ? undefined : navigator.storage): Promise<boolean> {
  try {
    if (!storage?.persist) return false;
    return (await storage.persisted?.()) || (await storage.persist());
  } catch {
    return false;
  }
}
