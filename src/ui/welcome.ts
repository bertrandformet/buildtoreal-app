// Écran d'accueil de la toute première ouverture : explique le jeu et annonce le nombre de missions du guide qui suivent.

import logoUrl from '../assets/logo.png';
import { t, type Key } from '../i18n/fr';
import { MISSIONS } from './guideMissions';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, string> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) node.setAttribute(k, v);
  for (const c of children) node.append(c);
  return node;
}

export class Welcome {
  readonly element: HTMLElement;
  private readonly onStart: () => void;

  constructor(onStart: () => void) {
    this.onStart = onStart;
    const steps = el('ol', { class: 'welcome-steps' });
    for (const n of [1, 2, 3]) {
      steps.append(el('li', {}, el('span', { class: 'welcome-badge', 'aria-hidden': 'true' }, String(n)), el('span', {}, t(`welcome.step.${n}` as Key))));
    }
    const start = el('button', { type: 'button', class: 'btn primary' }, t('welcome.start'));
    const later = el('button', { type: 'button', class: 'btn' }, t('welcome.later'));
    start.addEventListener('click', () => {
      this.close();
      this.onStart();
    });
    later.addEventListener('click', () => this.close());
    const dialog = el(
      'div',
      { class: 'dialog welcome', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('welcome.title') },
      el('img', { class: 'welcome-logo', src: logoUrl, alt: t('app.title') }),
      el('h2', {}, t('welcome.title')),
      el('p', { class: 'welcome-lead' }, t('welcome.lead')),
      steps,
      el('h3', {}, t('welcome.missions', { n: MISSIONS.length })),
      el('p', { class: 'hint' }, t('welcome.hint')),
      el('div', { class: 'dialog-actions' }, later, start),
    );
    this.element = el('div', { class: 'overlay', hidden: '' }, dialog);
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  open(): void {
    this.element.hidden = false;
    this.element.querySelector<HTMLElement>('.btn.primary')?.focus({ preventScroll: true });
  }

  close(): void {
    this.element.hidden = true;
  }
}
