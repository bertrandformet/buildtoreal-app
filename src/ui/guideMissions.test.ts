import { describe, expect, it } from 'vitest';
import { MIN_TURN, MISSIONS, angleDiff, type Facts } from './guideMissions';

const base: Facts = {
  typeId: 'brick-2x4',
  color: 'rouge',
  drawerOpen: false,
  gx: 10,
  gz: 10,
  pieceCount: 0,
  azimuth: 0,
  tool: 'place',
  menuOpen: false,
  noticeOpen: false,
  rotatable: true,
  stacked: 0,
  turns: 0,
  undos: 0,
  redos: 0,
  picks: 0,
  removals: 0,
  moves: 0,
  lifted: false,
  opening: false,
  openingCount: 0,
  visit: false,
  viewMenuOpen: false,
  examplesOpen: false,
  hasSwitch: false,
  opens: 0,
  examples: 0,
  lights: 0,
};
const mission = (id: string) => MISSIONS.find((m) => m.id === id)!;

describe('missions du guide', () => {
  it('enchaîne quinze missions au plus ; la notice vient avant le retrait, pour qu’il reste des pièces à mettre dans le livre', () => {
    expect(MISSIONS.map((m) => m.id)).toEqual(['choisir', 'deplacer', 'poser', 'pivoter', 'empiler', 'tourner', 'annuler', 'copier', 'soulever', 'notice', 'retirer', 'porte', 'visite', 'modele', 'ampoule']);
    expect(MISSIONS.length).toBeLessThanOrEqual(15);
  });

  it('aucune mission n’est validée sans action du joueur', () => {
    for (const m of MISSIONS) expect(m.done(base, base), m.id).toBe(false);
  });

  it('choisir : exige un changement de forme ou de couleur, tiroir refermé', () => {
    const m = mission('choisir');
    expect(m.done({ ...base, color: 'bleu', drawerOpen: true }, base)).toBe(false);
    expect(m.done({ ...base, color: 'bleu' }, base)).toBe(true);
    expect(m.done({ ...base, typeId: 'brick-2x2' }, base)).toBe(true);
    expect(m.target(base)).toBe('.piece-chip');
    expect(m.target({ ...base, drawerOpen: true })).toBe('.drawer');
  });

  it('déplacer : un déplacement de la pièce suffit', () => {
    expect(mission('deplacer').done({ ...base, gx: 11 }, base)).toBe(true);
    expect(mission('deplacer').done({ ...base, gz: 9 }, base)).toBe(true);
  });

  it('poser : une pièce de plus', () => {
    expect(mission('poser').done({ ...base, pieceCount: 1 }, base)).toBe(true);
  });

  it('tourner : un vrai tour de vue, même à cheval sur ±π', () => {
    const m = mission('tourner');
    expect(m.done({ ...base, azimuth: MIN_TURN - 0.1 }, base)).toBe(false);
    expect(m.done({ ...base, azimuth: MIN_TURN + 0.1 }, base)).toBe(true);
    expect(m.done({ ...base, azimuth: -3.0 }, { ...base, azimuth: 3.0 })).toBe(false);
    expect(angleDiff(3.1, -3.1)).toBeCloseTo(2 * Math.PI - 6.2, 5);
    expect(m.target(base)).toBe('.view-buttons .orbit-btn');
  });

  it('pivoter : exige un vrai pivot, impossible avec une pièce carrée (la consigne le dit)', () => {
    const m = mission('pivoter');
    expect(m.done({ ...base, turns: 1 }, base)).toBe(true);
    expect(m.done({ ...base, turns: 1, rotatable: false }, base)).toBe(false);
    expect(m.textKey({ ...base, rotatable: false })).toBe('guide.pivot.square');
  });

  it('empiler : une pièce de plus au-dessus du sol', () => {
    expect(mission('empiler').done({ ...base, stacked: 1 }, base)).toBe(true);
  });

  it('annuler : il faut annuler puis rétablir', () => {
    const m = mission('annuler');
    expect(m.done({ ...base, undos: 1 }, base)).toBe(false);
    expect(m.done({ ...base, undos: 1, redos: 1 }, base)).toBe(true);
    expect(m.target({ ...base, undos: 1 }, base)).toContain('redo');
    // Un annulement fait avant la mission ne compte pas : la consigne repart de ↶.
    const later = { ...base, undos: 3, redos: 3 };
    expect(m.target(later, later)).toContain('undo');
  });

  it('copier : un vrai prélèvement, avec la cible qui suit l’outil', () => {
    const m = mission('copier');
    expect(m.done({ ...base, picks: 1 }, base)).toBe(true);
    expect(m.target(base)).toContain('pick');
    expect(m.target({ ...base, tool: 'pick' })).toBe('.stage-canvas');
  });

  it('retirer : deux retraits de suite ; demande de poser d’abord s’il manque des pièces', () => {
    const m = mission('retirer');
    expect(m.done({ ...base, removals: 1 }, base)).toBe(false);
    expect(m.done({ ...base, removals: 2 }, base)).toBe(true);
    expect(m.textKey({ ...base, pieceCount: 1 })).toBe('guide.remove.need');
    expect(m.textKey({ ...base, pieceCount: 3 })).toBe('guide.remove.tool');
    expect(m.textKey({ ...base, pieceCount: 3, tool: 'remove' })).toBe('guide.remove.pick');
  });

  it('soulever : un déplacement réussi, avec une consigne qui suit l’outil et la pièce soulevée', () => {
    const m = mission('soulever');
    const start = { ...base, pieceCount: 2 };
    expect(m.done({ ...start, moves: 1 }, start)).toBe(true);
    expect(m.textKey(start)).toBe('guide.lift.tool');
    expect(m.target(start)).toContain('move');
    expect(m.textKey({ ...start, tool: 'move' })).toBe('guide.lift.pick');
    expect(m.textKey({ ...start, tool: 'move', lifted: true })).toBe('guide.lift.drop');
    expect(m.target({ ...start, tool: 'move', lifted: true })).toBe('.move-row .place-btn');
    expect(m.textKey({ ...base, pieceCount: 0 })).toBe('guide.lift.need');
  });

  it('notice : validée à l’ouverture de la notice, la cible suit le menu', () => {
    const m = mission('notice');
    expect(m.done({ ...base, noticeOpen: true }, base)).toBe(true);
    expect(m.target(base)).toBe('.topbar .icon-btn');
    expect(m.target({ ...base, menuOpen: true })).toContain('notice-open');
  });

  it('porte : choisir dans l’onglet Ouvrants, puis poser, jusqu’à une porte ou fenêtre de plus', () => {
    const m = mission('porte');
    expect(m.textKey(base)).toBe('guide.door.chip');
    expect(m.target({ ...base, drawerOpen: true })).toBe('.seg[data-kind="opening"]');
    expect(m.target({ ...base, opening: true, drawerOpen: true })).toBe('.drawer');
    expect(m.target({ ...base, opening: true })).toBe('.bar-row .place-btn');
    expect(m.done({ ...base, openingCount: 1 }, base)).toBe(true);
  });

  it('visite : Vue, Visite, puis toucher un ouvrant (il s’ouvre ou se ferme)', () => {
    const m = mission('visite');
    expect(m.target(base)).toBe('.view-menu-btn');
    expect(m.target({ ...base, viewMenuOpen: true })).toBe('#view-pop .visit-row');
    expect(m.target({ ...base, visit: true })).toBe('.stage-canvas');
    expect(m.done({ ...base, visit: true }, base)).toBe(false);
    expect(m.done({ ...base, visit: true, opens: 1 }, base)).toBe(true);
  });

  it('modèle : le menu, Modèles d’exemple, puis ouvrir la Voiture', () => {
    const m = mission('modele');
    expect(m.target(base)).toBe('.topbar .icon-btn');
    expect(m.target({ ...base, menuOpen: true })).toBe('[data-action="examples"]');
    expect(m.target({ ...base, examplesOpen: true })).toBe('.gallery .card .btn');
    expect(m.done({ ...base, examples: 1 }, base)).toBe(true);
  });

  it('ampoule : touche l’ampoule si le modèle a un interrupteur, sinon renvoie vers la Voiture', () => {
    const m = mission('ampoule');
    expect(m.textKey(base)).toBe('guide.light.need');
    expect(m.textKey({ ...base, hasSwitch: true })).toBe('guide.light');
    expect(m.target({ ...base, hasSwitch: true })).toBe('.lights-btn');
    expect(m.done({ ...base, lights: 1 }, base)).toBe(true);
  });
});
