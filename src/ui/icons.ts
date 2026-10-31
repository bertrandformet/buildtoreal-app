// Icônes en SVG (tracés simples, trait de 2 px) : pas de dépendance, pas de texte à traduire.

const PATHS = {
  undo: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
  redo: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  rotate: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  menu: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
  recenter: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  free: '<polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>',
  up: '<polyline points="6 15 12 9 18 15"/>',
  down: '<polyline points="6 9 12 15 18 9"/>',
  left: '<polyline points="15 6 9 12 15 18"/>',
  right: '<polyline points="9 6 15 12 9 18"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>',
  pointer: '<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  levelUp: '<polyline points="7 11 12 6 17 11"/><line x1="12" y1="6" x2="12" y2="18"/>',
  levelDown: '<polyline points="7 13 12 18 17 13"/><line x1="12" y1="18" x2="12" y2="6"/>',
  sound: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  mute: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/>',
  pipette: '<path d="M20.5 3.5a2.1 2.1 0 0 0-3 0L14 7l3 3 3.5-3.5a2.1 2.1 0 0 0 0-3z"/><path d="M13 8l-8.5 8.5a2 2 0 0 0-.5 1.2V20h2.3a2 2 0 0 0 1.2-.5L16 11"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  orbitLeft: '<ellipse cx="12" cy="14" rx="9" ry="4.5"/><polyline points="8 3 4.5 6.5 8 10"/><line x1="4.5" y1="6.5" x2="13" y2="6.5"/>',
  orbitRight: '<ellipse cx="12" cy="14" rx="9" ry="4.5"/><polyline points="16 3 19.5 6.5 16 10"/><line x1="19.5" y1="6.5" x2="11" y2="6.5"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z"/><path d="M12 1v0M4.2 4.2l.7.7M1 11h1M22 11h1M19.1 4.9l.7-.7"/>',
  bulbOff: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2V16h5v-.2c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3z"/><line x1="3" y1="3" x2="21" y2="21"/>',
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, size = 22): string {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
}
