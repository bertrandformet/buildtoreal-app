// Gestion des projets côté navigateur : enregistrement automatique, verrou d'onglet, fichiers, galerie.
// La construction en cours reste toujours en mémoire : aucun échec de stockage ou d'import ne la modifie.

import { Game } from '../core/game';
import {
  cleanName,
  defaultProjectName,
  gameFromProject,
  newProjectId,
  parseProjectJson,
  projectFromGame,
  serializeProject,
  type ProjectData,
  type ProjectMeta,
} from '../core/project';
import { t } from '../i18n/fr';
import { acquireProjectLock, type ProjectLock } from '../storage/lock';
import { ProjectStore, requestPersistence, type ProjectSummary } from '../storage/store';

export type SaveStatus = 'none' | 'pending' | 'saved' | 'error';

export interface ProjectHost {
  /** Remplace la partie affichée. */
  installGame(game: Game): void;
  captureThumbnail(): string | undefined;
  notify(text: string, kind: 'ok' | 'error'): void;
  /** L'état d'enregistrement ou le mode lecture seule a changé. */
  onStateChange(): void;
}

const SAVE_DELAY_MS = 800;
const REMINDER_AFTER_MS = 7 * 24 * 3600 * 1000;
const REMINDER_MIN_PIECES = 10;
const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'construction'
  );
}

export function downloadText(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export class ProjectManager {
  private readonly host: ProjectHost;
  private store: ProjectStore | null = null;
  private game: Game | null = null;
  private lock: ProjectLock | null = null;
  private unsubscribe: (() => void) | null = null;
  private timer = 0;
  private dirty = false;
  private persistAsked = false;
  private reminded = false;
  private errorShown = false;

  meta: ProjectMeta = { id: '', name: '', createdAt: 0, updatedAt: 0 };
  readOnly = false;
  status: SaveStatus = 'none';
  lastSavedAt = 0;

  constructor(host: ProjectHost) {
    this.host = host;
    // Dernier enregistrement avant de quitter ou de passer en arrière-plan.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.flush();
    });
    window.addEventListener('pagehide', () => void this.flush());
  }

  get hasStore(): boolean {
    return this.store !== null;
  }

  /** Ouvre le stockage puis reprend le dernier projet, ou en crée un. */
  async init(): Promise<void> {
    this.store = await ProjectStore.open();
    if (!this.store) this.host.notify(t('save.noStore'), 'error');
    const lastId = await this.store?.getMeta<string>('lastProjectId');
    if (lastId && (await this.openProject(lastId, true))) return;
    await this.newProject(24, 'vert');
  }

  private async activate(game: Game, meta: ProjectMeta): Promise<void> {
    await this.flush();
    this.lock?.release();
    this.unsubscribe?.();
    this.game = game;
    this.meta = meta;
    this.dirty = false;
    this.status = 'none';
    this.host.installGame(game);
    this.unsubscribe = game.subscribe(() => {
      this.dirty = true;
      this.scheduleSave();
    });
    this.lock = await acquireProjectLock(meta.id);
    this.readOnly = !this.lock.held;
    if (!this.readOnly) await this.store?.setMeta('lastProjectId', meta.id);
    this.host.onStateChange();
  }

  async newProject(size: number, baseColor: string): Promise<void> {
    const now = Date.now();
    const game = new Game(size, size, baseColor, () => performance.now());
    await this.activate(game, { id: newProjectId(), name: defaultProjectName(now), createdAt: now, updatedAt: now });
    // Inscrit tout de suite la création dans « Mes créations ».
    this.dirty = true;
    await this.flush();
  }

  /** Ouvre un projet enregistré. Retourne false s'il est absent ou abîmé (la construction en cours reste inchangée). */
  async openProject(id: string, silent = false): Promise<boolean> {
    if (!this.store) return false;
    const result = await this.store.load(id);
    if (!result.ok) {
      if (!silent) this.host.notify(result.reason === 'absent' ? t('open.absent') : t('open.corrupted', { error: result.message }), 'error');
      return false;
    }
    const d = result.data;
    await this.activate(gameFromProject(d, () => performance.now()), { id: d.id, name: d.name, createdAt: d.createdAt, updatedAt: d.updatedAt });
    // Un projet qu'on vient de relire est, par définition, enregistré.
    this.status = 'saved';
    this.lastSavedAt = d.updatedAt;
    this.host.onStateChange();
    return true;
  }

  /** Retente d'obtenir le verrou (l'autre onglet s'est peut-être fermé) en rechargeant le projet depuis le stockage. */
  async retryLock(): Promise<void> {
    this.lock?.release();
    this.lock = null;
    if (!(await this.openProject(this.meta.id, true))) this.host.onStateChange();
  }

  async listProjects(): Promise<ProjectSummary[]> {
    return (await this.store?.list()) ?? [];
  }

  async deleteProject(id: string): Promise<void> {
    if (!this.store) return;
    await this.store.remove(id);
    if (id === this.meta.id) {
      this.dirty = false;
      await this.newProject(24, 'vert');
    }
  }

  rename(raw: string): void {
    const name = cleanName(raw);
    if (!name || name === this.meta.name || this.readOnly) return;
    this.meta = { ...this.meta, name };
    this.dirty = true;
    this.scheduleSave();
    this.host.onStateChange();
  }

  // ------------------------------------------------------------------ enregistrement

  private scheduleSave(): void {
    if (this.readOnly || !this.store) return;
    window.clearTimeout(this.timer);
    this.status = 'pending';
    this.timer = window.setTimeout(() => void this.flush(), SAVE_DELAY_MS);
    this.host.onStateChange();
  }

  async flush(): Promise<void> {
    window.clearTimeout(this.timer);
    this.timer = 0;
    if (!this.dirty || this.readOnly || !this.store || !this.game) return;
    this.dirty = false;
    this.status = 'pending';
    this.meta = { ...this.meta, updatedAt: Date.now() };
    const data = projectFromGame(this.game, this.meta);
    const result = await this.store.save(data, this.host.captureThumbnail());
    if (result.ok) {
      this.status = 'saved';
      this.errorShown = false;
      this.lastSavedAt = Date.now();
      if (!this.persistAsked) {
        this.persistAsked = true;
        void requestPersistence();
      }
      await this.remindExport(data.pieces.length);
    } else {
      this.status = 'error';
      this.dirty = true;
      if (!this.errorShown) this.host.notify(t(result.reason === 'quota' ? 'save.quota' : 'save.error'), 'error');
      this.errorShown = true;
    }
    this.host.onStateChange();
  }

  private async remindExport(pieceCount: number): Promise<void> {
    if (this.reminded || pieceCount < REMINDER_MIN_PIECES || !this.store) return;
    const last = (await this.store.getMeta<number>('lastExport')) ?? 0;
    if (Date.now() - last > REMINDER_AFTER_MS) {
      this.reminded = true;
      this.host.notify(t('save.exportReminder'), 'ok');
    }
  }

  // ------------------------------------------------------------------ fichiers

  private fileName(name: string): string {
    return `${slug(name)}.briques.json`;
  }

  /** Enregistre la construction en cours dans un fichier. */
  async exportCurrent(): Promise<void> {
    if (!this.game) return;
    await this.flush();
    const data = projectFromGame(this.game, this.meta);
    downloadText(this.fileName(data.name), serializeProject(data), 'application/json');
    await this.store?.setMeta('lastExport', Date.now());
  }

  async exportProject(id: string): Promise<void> {
    if (id === this.meta.id) return this.exportCurrent();
    const r = await this.store?.load(id);
    if (!r || !r.ok) {
      this.host.notify(t('open.absent'), 'error');
      return;
    }
    downloadText(this.fileName(r.data.name), serializeProject(r.data), 'application/json');
    await this.store?.setMeta('lastExport', Date.now());
  }

  /** Ouvre un fichier comme une nouvelle création. Un fichier invalide ne touche à rien. */
  async importFile(file: File): Promise<boolean> {
    if (file.size > MAX_IMPORT_BYTES) {
      this.host.notify(t('import.refused', { error: t('import.tooBig') }), 'error');
      return false;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      this.host.notify(t('import.refused', { error: '?' }), 'error');
      return false;
    }
    const parsed = parseProjectJson(text);
    if (!parsed.ok) {
      this.host.notify(t('import.refused', { error: parsed.error }), 'error');
      return false;
    }
    await this.adopt(parsed.data, parsed.data.name);
    this.host.notify(t('import.ok'), 'ok');
    return true;
  }

  /** Copie la construction en cours dans une nouvelle création et l'ouvre (utile en lecture seule). */
  async duplicateCurrent(): Promise<void> {
    if (!this.game) return;
    const data = projectFromGame(this.game, this.meta);
    await this.adopt(data, `${data.name} (${t('copy.suffix')})`);
  }

  /** Ouvre un modèle d'exemple comme une nouvelle création : l'original n'est jamais modifié. */
  async openExample(game: Game, name: string): Promise<void> {
    const now = Date.now();
    const data = projectFromGame(game, { id: newProjectId(), name, createdAt: now, updatedAt: now });
    await this.adopt(data, name);
  }

  private async adopt(source: ProjectData, name: string): Promise<void> {
    const now = Date.now();
    const data: ProjectData = { ...source, id: newProjectId(), name: cleanName(name) || 'Construction', createdAt: now, updatedAt: now };
    if (this.store) {
      const saved = await this.store.save(data);
      if (!saved.ok) {
        this.host.notify(t(saved.reason === 'quota' ? 'save.quota' : 'save.error'), 'error');
        return;
      }
    }
    await this.activate(gameFromProject(data, () => performance.now()), { id: data.id, name: data.name, createdAt: now, updatedAt: now });
    if (this.store) {
      // Vignette de la création qu'on vient d'ouvrir, pour « Mes créations ».
      await this.store.save(data, this.host.captureThumbnail());
      this.status = 'saved';
      this.lastSavedAt = now;
      this.host.onStateChange();
    }
  }
}
