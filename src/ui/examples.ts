// « Modèles d'exemple » : liste de constructions prêtes à ouvrir, chacune en copie dans « Mes créations ».
// Les vignettes sont dessinées à la première ouverture, avec le même moteur que les images de la notice.

import { EXAMPLES, buildExampleGame, type ExampleModel } from '../core/exampleModels';
import { t, type Key } from '../i18n/fr';
import { NoticeRenderer } from '../render/noticeRenderer';
import type { ProjectManager } from './projectManager';

const THUMB = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, string> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) node.setAttribute(k, v);
  for (const c of children) node.append(c);
  return node;
}

export class Examples {
  readonly element: HTMLElement;
  private readonly list: HTMLElement;
  private readonly manager: ProjectManager;
  private readonly onChange: () => void;
  private readonly thumbs = new Map<string, string>();
  private drawn = false;

  constructor(manager: ProjectManager, onChange: () => void) {
    this.manager = manager;
    this.onChange = onChange;
    this.list = el('ul', { class: 'gallery-list' });
    const close = el('button', { type: 'button', class: 'btn' }, t('examples.close'));
    close.addEventListener('click', () => this.close());
    const dialog = el(
      'div',
      { class: 'dialog gallery', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('examples.title') },
      el('h2', {}, t('examples.title')),
      el('p', { class: 'hint' }, t('examples.hint')),
      this.list,
      el('div', { class: 'dialog-actions' }, close),
    );
    this.element = el('div', { class: 'overlay', hidden: '' }, dialog);
    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) this.close();
    });
    for (const model of EXAMPLES) this.list.append(this.card(model));
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  close(): void {
    this.element.hidden = true;
  }

  open(): void {
    this.element.hidden = false;
    if (!this.drawn) {
      this.drawn = true;
      window.setTimeout(() => this.drawThumbnails(), 30);
    }
  }

  /** Dessine les vignettes une à une, sans bloquer l'ouverture de la fenêtre. Sans WebGL, les cartes restent sans image. */
  private drawThumbnails(): void {
    let renderer: NoticeRenderer | null = null;
    try {
      renderer = new NoticeRenderer();
      for (const model of EXAMPLES) {
        const game = buildExampleGame(model);
        const pieces = game.model.all().map((p) => ({ typeId: p.typeId, color: p.color, x: p.x, y: p.y, z: p.z, orient: p.orient }));
        const url = renderer.renderStep(game.model.plates, [], pieces, 45);
        if (THUMB.test(url)) this.thumbs.set(model.id, url);
        const img = this.list.querySelector<HTMLImageElement>(`img[data-example="${model.id}"]`);
        if (img && THUMB.test(url)) img.src = url;
      }
    } catch (error) {
      console.error(error);
    } finally {
      renderer?.dispose();
    }
  }

  private card(model: ExampleModel): HTMLElement {
    const name = t(`example.${model.id}` as Key);
    const thumb = el('img', { class: 'thumb', alt: '', width: '96', height: '64', 'data-example': model.id });
    const cached = this.thumbs.get(model.id);
    if (cached) thumb.src = cached;
    const info = el(
      'div',
      { class: 'info' },
      el('strong', {}, name),
      el('span', { class: 'sub' }, `${t('gallery.pieces', { n: model.pieces.length })} · ${t(`example.${model.id}.sub` as Key)}`),
    );
    const open = el('button', { type: 'button', class: 'btn tiny' }, t('examples.open'));
    open.addEventListener('click', async () => {
      open.disabled = true;
      await this.manager.openExample(buildExampleGame(model, () => performance.now()), name);
      open.disabled = false;
      this.close();
      this.onChange();
    });
    return el('li', { class: 'card' }, thumb, info, el('div', { class: 'card-actions' }, open));
  }
}
