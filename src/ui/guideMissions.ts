// Missions du guide de départ : pures (aucun accès au navigateur), donc testables.
// Chaque mission désigne l'élément à utiliser et se valide d'elle-même quand le joueur a essayé.

import type { Key } from '../i18n/fr';

/** Ce que le guide a besoin de savoir de l'état du jeu. */
export interface Facts {
  readonly typeId: string;
  readonly color: string;
  readonly drawerOpen: boolean;
  readonly gx: number;
  readonly gz: number;
  readonly pieceCount: number;
  /** Azimut de la caméra autour de la construction, en radians. */
  readonly azimuth: number;
  readonly tool: string;
  readonly menuOpen: boolean;
  readonly noticeOpen: boolean;
  /** La pièce choisie peut pivoter (elle n'est pas carrée). */
  readonly rotatable: boolean;
  /** Nombre de pièces posées au-dessus du sol. */
  readonly stacked: number;
  // Compteurs d'actions du joueur depuis l'ouverture de l'application.
  readonly turns: number;
  readonly undos: number;
  readonly redos: number;
  readonly picks: number;
  readonly removals: number;
  readonly moves: number;
  /** Une pièce est soulevée (outil Déplacer). */
  readonly lifted: boolean;
  /** La pièce choisie est une porte, une fenêtre, une portière, un hayon ou une porte de garage. */
  readonly opening: boolean;
  /** Nombre de portes, fenêtres, portières, hayons et portes de garage posés. */
  readonly openingCount: number;
  readonly visit: boolean;
  readonly viewMenuOpen: boolean;
  readonly examplesOpen: boolean;
  readonly hasSwitch: boolean;
  /** Ouvertures ou fermetures d'un ouvrant, modèles ouverts, interrupteurs ou ampoule touchés. */
  readonly opens: number;
  readonly examples: number;
  readonly lights: number;
}

export interface Mission {
  readonly id: string;
  readonly textKey: (f: Facts, base?: Facts) => Key;
  /** Sélecteur CSS de l'élément à pointer. */
  readonly target: (f: Facts, base?: Facts) => string;
  readonly done: (f: Facts, base: Facts) => boolean;
}

/** Plus petit écart entre deux angles, en radians (0 à π). */
export function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

export const MIN_TURN = 0.5;

export const MISSIONS: readonly Mission[] = [
  {
    id: 'choisir',
    textKey: (f) => (f.drawerOpen ? 'guide.choose.open' : 'guide.choose.closed'),
    target: (f) => (f.drawerOpen ? '.drawer' : '.piece-chip'),
    done: (f, b) => !f.drawerOpen && (f.typeId !== b.typeId || f.color !== b.color),
  },
  {
    id: 'deplacer',
    textKey: () => 'guide.move',
    target: () => '.pad-box .dpad',
    done: (f, b) => f.gx !== b.gx || f.gz !== b.gz,
  },
  {
    id: 'poser',
    textKey: () => 'guide.place',
    target: () => '.bar-row .place-btn',
    done: (f, b) => f.pieceCount > b.pieceCount,
  },
  {
    id: 'pivoter',
    textKey: (f) => (f.rotatable ? 'guide.pivot' : 'guide.pivot.square'),
    target: (f) => (f.rotatable ? '.view-buttons .rotate-piece' : '.piece-chip'),
    done: (f, b) => f.rotatable && f.turns > b.turns,
  },
  {
    id: 'empiler',
    textKey: () => 'guide.stack',
    target: () => '.bar-row .place-btn',
    done: (f, b) => f.stacked > b.stacked,
  },
  {
    id: 'tourner',
    textKey: () => 'guide.tour',
    target: () => '.view-buttons .orbit-btn',
    done: (f, b) => angleDiff(f.azimuth, b.azimuth) > MIN_TURN,
  },
  {
    id: 'annuler',
    textKey: (f, b = f) => (f.undos > b.undos ? 'guide.undo.redo' : 'guide.undo'),
    target: (f, b = f) => (f.undos > b.undos ? '.topbar .redo-btn' : '.topbar .undo-btn'),
    done: (f, b) => f.undos > b.undos && f.redos > b.redos,
  },
  {
    id: 'copier',
    textKey: (f) => (f.tool === 'pick' ? 'guide.pick.piece' : 'guide.pick.tool'),
    target: (f) => (f.tool === 'pick' ? '.stage-canvas' : '.seg[data-tool="pick"]'),
    done: (f, b) => f.picks > b.picks,
  },
  {
    id: 'soulever',
    textKey: (f) => (f.pieceCount < 1 ? 'guide.lift.need' : f.lifted ? 'guide.lift.drop' : f.tool === 'move' ? 'guide.lift.pick' : 'guide.lift.tool'),
    target: (f) => (f.pieceCount < 1 ? '.bar-row .place-btn' : f.lifted ? '.move-row .place-btn' : f.tool === 'move' ? '.stage-canvas' : '.seg[data-tool="move"]'),
    done: (f, b) => f.moves > b.moves,
  },
  {
    id: 'notice',
    textKey: (f) => (f.menuOpen ? 'guide.notice.menu' : 'guide.notice.open'),
    target: (f) => (f.menuOpen ? '.dialog .notice-open.primary' : '.topbar .icon-btn'),
    done: (f) => f.noticeOpen,
  },
  {
    id: 'retirer',
    textKey: (f) => (f.pieceCount < 2 && f.tool !== 'remove' ? 'guide.remove.need' : f.tool === 'remove' ? 'guide.remove.pick' : 'guide.remove.tool'),
    target: (f) => (f.pieceCount < 2 && f.tool !== 'remove' ? '.bar-row .place-btn' : f.tool === 'remove' ? '.stage-canvas' : '.seg[data-tool="remove"]'),
    done: (f, b) => f.removals >= b.removals + 2,
  },
  {
    id: 'porte',
    textKey: (f) => (f.opening ? (f.drawerOpen ? 'guide.door.close' : 'guide.door.place') : f.drawerOpen ? 'guide.door.tab' : 'guide.door.chip'),
    target: (f) => (f.opening ? (f.drawerOpen ? '.drawer' : '.bar-row .place-btn') : f.drawerOpen ? '.seg[data-kind="opening"]' : '.piece-chip'),
    done: (f, b) => f.openingCount > b.openingCount,
  },
  {
    id: 'visite',
    textKey: (f) => (f.visit ? 'guide.visit.touch' : f.viewMenuOpen ? 'guide.visit.row' : 'guide.visit.menu'),
    target: (f) => (f.visit ? '.stage-canvas' : f.viewMenuOpen ? '#view-pop .visit-row' : '.view-menu-btn'),
    done: (f, b) => f.opens > b.opens,
  },
  {
    id: 'modele',
    textKey: (f) => (f.examplesOpen ? 'guide.model.pick' : f.menuOpen ? 'guide.model.menu' : 'guide.model.open'),
    target: (f) => (f.examplesOpen ? '.gallery .card .btn' : f.menuOpen ? '[data-action="examples"]' : '.topbar .icon-btn'),
    done: (f, b) => f.examples > b.examples,
  },
  {
    id: 'ampoule',
    textKey: (f) => (f.hasSwitch ? 'guide.light' : 'guide.light.need'),
    target: (f) => (f.hasSwitch ? '.lights-btn' : '.topbar .icon-btn'),
    done: (f, b) => f.lights > b.lights,
  },
];
