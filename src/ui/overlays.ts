// Fenêtres (« .overlay ») : Échap les ferme, Tab reste à l'intérieur, le focus y entre à l'ouverture et revient à son point de départ.
// Un seul observateur suit l'attribut `hidden` de toutes les fenêtres, qu'elles soient construites avant ou après lui.

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Où va le focus après Tab (ou Maj+Tab) dans une fenêtre de `count` éléments, quand il est sur `index` (-1 : hors de la fenêtre). */
export function nextFocusIndex(count: number, index: number, backwards: boolean): number {
  if (count <= 0) return -1;
  if (index < 0) return backwards ? count - 1 : 0;
  return backwards ? (index - 1 + count) % count : (index + 1) % count;
}

interface Open {
  readonly overlay: HTMLElement;
  readonly opener: HTMLElement | null;
}

export function manageOverlays(root: HTMLElement = document.body): void {
  const stack: Open[] = [];

  const focusables = (overlay: HTMLElement) => [...overlay.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((node) => !node.hidden && node.offsetParent !== null);

  // Le dernier élément qui avait le focus hors d'une fenêtre : c'est lui qui l'a ouverte (le focus a pu bouger avant que l'observateur s'exécute).
  let lastOutside: HTMLElement | null = null;
  document.addEventListener('focusin', (e) => {
    const node = e.target;
    if (node instanceof HTMLElement && !node.closest('.overlay')) lastOutside = node;
  });

  // Un clic ou un geste au clavier sur un bouton compte aussi (Safari ne donne pas le focus aux boutons au toucher).
  document.addEventListener(
    'click',
    (e) => {
      const button = e.target instanceof Element ? e.target.closest<HTMLElement>('button, a, [tabindex]') : null;
      if (button && !button.closest('.overlay')) lastOutside = button;
    },
    true,
  );

  const opened = (overlay: HTMLElement) => {
    if (stack.some((o) => o.overlay === overlay)) return;
    const active = document.activeElement;
    const inside = (node: Element | null) => !node || node === document.body || node.closest('.overlay') !== null;
    const below = stack[stack.length - 1]?.overlay;
    // Hors fenêtre : le focus actuel, sinon le dernier connu. Au-dessus d'une autre fenêtre : l'élément qu'elle avait en main.
    const opener = below ? below.querySelector<HTMLElement>(':focus') : !inside(active) ? (active as HTMLElement) : lastOutside;
    stack.push({ overlay, opener });
    const dialog = overlay.querySelector<HTMLElement>('[role="dialog"]') ?? overlay;
    if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');
    // Le focus entre sur la fenêtre elle-même : Tab mène ensuite au premier bouton, sans activer au hasard un bouton dangereux.
    dialog.focus({ preventScroll: true });
  };

  const closed = (overlay: HTMLElement) => {
    const i = stack.findIndex((o) => o.overlay === overlay);
    if (i < 0) return;
    const [entry] = stack.splice(i, 1);
    if (i === stack.length && entry?.opener && document.contains(entry.opener) && !overlay.contains(entry.opener)) entry.opener.focus({ preventScroll: true });
  };

  new MutationObserver((records) => {
    for (const r of records) {
      const node = r.target as HTMLElement;
      if (!node.classList?.contains('overlay')) continue;
      if (node.hidden) closed(node);
      else opened(node);
    }
  }).observe(root, { attributes: true, attributeFilter: ['hidden'], subtree: true });

  document.addEventListener(
    'keydown',
    (e) => {
      const top = stack[stack.length - 1]?.overlay;
      if (!top) return;
      if (e.key === 'Escape') {
        // L'accueil demande un choix (« Commencer » ou « Plus tard ») : Échap ne le ferme pas.
        if (!top.querySelector('.welcome')) top.hidden = true;
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables(top);
      const next = nextFocusIndex(items.length, items.indexOf(document.activeElement as HTMLElement), e.shiftKey);
      e.preventDefault();
      if (next >= 0) items[next]!.focus();
    },
    true,
  );
}

/** Une fenêtre est-elle ouverte ? Les gestes du clavier de la construction se taisent alors. */
export function overlayOpen(root: ParentNode = document): boolean {
  return root.querySelector('.overlay:not([hidden])') !== null;
}
