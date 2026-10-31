// « Mes créations » : liste des constructions enregistrées, avec ouverture, fichier et suppression.

import { t } from '../i18n/fr';
import type { ProjectSummary } from '../storage/store';
import type { ProjectManager } from './projectManager';

const THUMB = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, string> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) node.setAttribute(k, v);
  for (const c of children) node.append(c);
  return node;
}

export class Gallery {
  readonly element: HTMLElement;
  private readonly list: HTMLElement;
  private readonly manager: ProjectManager;
  private readonly onChange: () => void;

  constructor(manager: ProjectManager, onChange: () => void) {
    this.manager = manager;
    this.onChange = onChange;
    this.list = el('ul', { class: 'gallery-list' });
    const close = el('button', { type: 'button', class: 'btn' }, t('gallery.close'));
    close.addEventListener('click', () => this.close());
    const dialog = el(
      'div',
      { class: 'dialog gallery', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('gallery.title') },
      el('h2', {}, t('gallery.title')),
      this.list,
      el('div', { class: 'dialog-actions' }, close),
    );
    this.element = el('div', { class: 'overlay', hidden: '' }, dialog);
    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) this.close();
    });
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  close(): void {
    this.element.hidden = true;
  }

  async open(): Promise<void> {
    this.element.hidden = false;
    await this.render();
  }

  private async render(): Promise<void> {
    const items = await this.manager.listProjects();
    this.list.replaceChildren();
    if (items.length === 0) {
      this.list.append(el('li', { class: 'gallery-empty' }, t('gallery.empty')));
      return;
    }
    const fmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
    for (const s of items) this.list.append(this.card(s, fmt));
  }

  private card(s: ProjectSummary, fmt: Intl.DateTimeFormat): HTMLElement {
    const thumb = el('img', { class: 'thumb', alt: '', width: '96', height: '64' });
    if (s.thumbnail && THUMB.test(s.thumbnail)) thumb.src = s.thumbnail;
    const current = s.id === this.manager.meta.id;
    const title = el('strong', {}, s.name);
    const info = el(
      'span',
      { class: 'sub' },
      `${t('gallery.pieces', { n: s.pieceCount })} · ${t('gallery.modified', { date: fmt.format(new Date(s.updatedAt)) })}`,
    );
    const head = el('div', { class: 'info' }, title, info);
    if (current) head.append(el('span', { class: 'badge' }, t('gallery.current')));

    const open = el('button', { type: 'button', class: 'btn tiny' }, t('gallery.open'));
    open.disabled = current;
    open.addEventListener('click', async () => {
      if (await this.manager.openProject(s.id)) {
        this.close();
        this.onChange();
      }
    });
    const file = el('button', { type: 'button', class: 'btn tiny' }, t('gallery.export'));
    file.addEventListener('click', () => void this.manager.exportProject(s.id));
    const del = el('button', { type: 'button', class: 'btn tiny danger-text' }, t('gallery.delete'));
    del.addEventListener('click', async () => {
      if (!window.confirm(t('gallery.confirmDelete', { name: s.name }))) return;
      await this.manager.deleteProject(s.id);
      await this.render();
      this.onChange();
    });
    return el('li', { class: 'card' }, thumb, head, el('div', { class: 'card-actions' }, open, file, del));
  }
}
