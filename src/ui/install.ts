// « Installer l'application » : ce qu'il faut faire pour l'avoir sur l'écran d'accueil, selon l'appareil.

import { installMode, type InstallEnvironment, type InstallMode } from '../pwa/installInfo';
import { t } from '../i18n/fr';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, string> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) node.setAttribute(k, v);
  for (const c of children) node.append(c);
  return node;
}

/** Le bouton Partager de Safari : un carré ouvert avec une flèche vers le haut. */
const SHARE_ICON =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';

export class Install {
  readonly element: HTMLElement;
  private readonly body: HTMLElement;
  private deferred: InstallPromptEvent | null = null;

  constructor() {
    this.body = el('div', { class: 'install-body' });
    const close = el('button', { type: 'button', class: 'btn' }, t('install.close'));
    close.addEventListener('click', () => this.close());
    const dialog = el('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('install.title') }, el('h2', {}, t('install.title')), this.body, el('div', { class: 'dialog-actions' }, close));
    this.element = el('div', { class: 'overlay', hidden: '' }, dialog);
    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) this.close();
    });
    // Chrome et Android proposent leur propre fenêtre d'installation : on la garde pour notre bouton.
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferred = e as InstallPromptEvent;
    });
    window.addEventListener('appinstalled', () => {
      this.deferred = null;
      if (this.isOpen) this.render();
    });
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  close(): void {
    this.element.hidden = true;
  }

  open(): void {
    this.element.hidden = false;
    this.render();
  }

  private environment(): InstallEnvironment {
    const nav = navigator as Navigator & { standalone?: boolean };
    return {
      userAgent: nav.userAgent,
      platform: nav.platform,
      maxTouchPoints: nav.maxTouchPoints,
      standalone: nav.standalone === true,
      displayStandalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
      hasPrompt: this.deferred !== null,
    };
  }

  private render(): void {
    const mode: InstallMode = installMode(this.environment());
    this.body.replaceChildren();
    if (mode === 'installed') {
      this.body.append(el('p', {}, t('install.installed')));
    } else if (mode === 'prompt') {
      const go = el('button', { type: 'button', class: 'btn primary' }, t('install.button'));
      go.addEventListener('click', async () => {
        const prompt = this.deferred;
        if (!prompt) return;
        await prompt.prompt();
        await prompt.userChoice.catch(() => undefined);
        this.deferred = null;
        this.render();
      });
      this.body.append(el('p', {}, t('install.prompt')), go);
    } else if (mode === 'ios') {
      const steps = el('ol', { class: 'install-steps' });
      const share = el('li', {});
      share.innerHTML = `${t('install.ios.share')} <span class="install-icon">${SHARE_ICON}</span>`;
      steps.append(share, el('li', {}, t('install.ios.add')), el('li', {}, t('install.ios.confirm')));
      this.body.append(el('p', {}, t('install.ios.intro')), steps);
    } else {
      this.body.append(el('p', {}, t('install.other')));
    }
    if (mode !== 'installed') this.body.append(el('p', { class: 'hint' }, t('install.offline')));
  }
}
