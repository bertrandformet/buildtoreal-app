// Guide de départ : une bulle avec une flèche qui se déplace vers l'élément à utiliser et demande d'essayer.
// Les missions s'enchaînent dans l'ordre et se valident en les faisant ; seul « Quitter le guide » permet de sortir. Relançable depuis le menu.

import { t } from '../i18n/fr';
import { MISSIONS, type Facts } from './guideMissions';

const POLL_MS = 250;
const EDGE = 12;
const GAP = 14;

export class Guide {
  private readonly root: HTMLElement;
  private readonly getFacts: () => Facts;
  private readonly onClose: (completed: boolean) => void;
  private bubble: HTMLElement | null = null;
  private stepEl!: HTMLElement;
  private textEl!: HTMLElement;
  private arrow!: HTMLElement;
  private skipBtn!: HTMLButtonElement;
  private timer = 0;
  private index = 0;
  private base!: Facts;
  private finished = false;
  private highlighted: Element | null = null;

  constructor(root: HTMLElement, getFacts: () => Facts, onClose: (completed: boolean) => void) {
    this.root = root;
    this.getFacts = getFacts;
    this.onClose = onClose;
  }

  get active(): boolean {
    return this.bubble !== null;
  }

  start(): void {
    this.stop(false);
    this.index = 0;
    this.finished = false;
    this.base = this.getFacts();
    this.build();
    this.timer = window.setInterval(() => this.tick(), POLL_MS);
    window.addEventListener('resize', this.reposition);
    this.render();
  }

  /** Ferme le guide. `completed` : le parcours est terminé ou abandonné (il ne se relance plus tout seul). */
  stop(completed: boolean): void {
    window.clearInterval(this.timer);
    window.removeEventListener('resize', this.reposition);
    this.clearHighlight();
    if (this.bubble) {
      this.bubble.remove();
      this.bubble = null;
      this.onClose(completed);
    }
  }

  private build(): void {
    const quit = this.button('guide.quit', () => this.stop(true));
    this.skipBtn = this.button('guide.skip', () => this.next());
    this.stepEl = document.createElement('div');
    this.stepEl.className = 'guide-step';
    this.textEl = document.createElement('div');
    this.textEl.className = 'guide-text';
    this.arrow = document.createElement('span');
    this.arrow.className = 'guide-arrow';
    const actions = document.createElement('div');
    actions.className = 'guide-actions';
    actions.append(quit, this.skipBtn);
    const bubble = document.createElement('div');
    bubble.className = 'guide';
    bubble.setAttribute('role', 'status');
    bubble.setAttribute('aria-live', 'polite');
    bubble.append(this.arrow, this.stepEl, this.textEl, actions);
    this.root.append(bubble);
    this.bubble = bubble;
  }

  private button(key: 'guide.quit' | 'guide.skip' | 'guide.finish', onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn tiny';
    b.textContent = t(key);
    b.addEventListener('click', onClick);
    return b;
  }

  private next(): void {
    this.index += 1;
    if (this.index >= MISSIONS.length) {
      this.finished = true;
    } else {
      this.base = this.getFacts();
    }
    this.render();
  }

  private tick(): void {
    if (!this.bubble || this.finished) return;
    const mission = MISSIONS[this.index];
    if (mission && mission.done(this.getFacts(), this.base)) {
      this.next();
      return;
    }
    this.render();
  }

  private render(): void {
    if (!this.bubble) return;
    if (this.finished) {
      this.stepEl.textContent = t('guide.bravoTitle');
      this.textEl.textContent = t('guide.bravo');
      this.skipBtn.hidden = false;
      this.skipBtn.textContent = t('guide.finish');
      this.skipBtn.onclick = () => this.stop(true);
      this.clearHighlight();
      this.place(null);
      return;
    }
    const facts = this.getFacts();
    // La notice couvre tout l'écran : la bulle s'efface le temps qu'on la lit.
    this.bubble.style.visibility = facts.noticeOpen ? 'hidden' : '';
    const mission = MISSIONS[this.index]!;
    this.stepEl.textContent = t('guide.step', { n: this.index + 1, total: MISSIONS.length });
    this.textEl.textContent = t(mission.textKey(facts, this.base));
    this.skipBtn.hidden = true;
    const target = document.querySelector(mission.target(facts, this.base));
    this.highlight(target);
    this.place(target);
  }

  private highlight(target: Element | null): void {
    if (this.highlighted === target) return;
    this.clearHighlight();
    target?.classList.add('guide-target');
    this.highlighted = target;
  }

  private clearHighlight(): void {
    this.highlighted?.classList.remove('guide-target');
    this.highlighted = null;
  }

  private readonly reposition = (): void => this.place(this.highlighted);

  /** Place la bulle au-dessus ou au-dessous de la cible, la flèche pointant vers elle. Sans cible : en haut de l'écran. */
  private place(target: Element | null): void {
    const bubble = this.bubble;
    if (!bubble) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(268, vw - 2 * EDGE);
    bubble.style.width = `${w}px`;
    const h = bubble.offsetHeight;
    if (!target || target.getClientRects().length === 0) {
      bubble.style.left = `${Math.round((vw - w) / 2)}px`;
      bubble.style.top = `${Math.round(vh * 0.2)}px`;
      this.arrow.style.display = 'none';
      return;
    }
    const r = target.getBoundingClientRect();
    const above = r.top + r.height / 2 > vh / 2;
    let top = above ? r.top - h - GAP : r.bottom + GAP;
    top = Math.max(EDGE, Math.min(vh - h - EDGE, top));
    const left = Math.max(EDGE, Math.min(vw - w - EDGE, r.left + r.width / 2 - w / 2));
    bubble.style.left = `${Math.round(left)}px`;
    bubble.style.top = `${Math.round(top)}px`;
    bubble.dataset['side'] = above ? 'above' : 'below';
    this.arrow.style.display = '';
    const arrowX = Math.max(18, Math.min(w - 18, r.left + r.width / 2 - left));
    this.arrow.style.left = `${Math.round(arrowX - 8)}px`;
  }
}
