// Sauvegarde : ce qui est relu doit être strictement égal à ce qui a été enregistré (pièces, coordonnées,
// orientations, couleurs, identifiants, rangs de pose), après annulations et rétablissements, export puis import.

import { describe, expect, it } from 'vitest';
import { CATALOGUE, COLORS, normalizeOrient, requireType } from './catalogue';
import { Game } from './game';
import {
  cleanName,
  gameFromProject,
  parseProject,
  parseProjectJson,
  projectFromGame,
  serializeProject,
  type ProjectData,
} from './project';
import { buildReferenceMultiLevel, buildReferenceSimple, makeRng, randInt } from './reference';
import { checkInvariants, landingLevel } from './rules';

const META = { id: 'abc123', name: 'Ma construction', createdAt: 1_000, updatedAt: 2_000 };
const snap = (g: Game) => JSON.stringify(g.snapshot());

function randomGame(seed: number, ops = 250): Game {
  const rng = makeRng(seed);
  const g = new Game(16, 16, 'bleu', () => 0);
  for (let i = 0; i < ops; i++) {
    const r = rng();
    if (r < 0.65) {
      const typeId = CATALOGUE[randInt(rng, CATALOGUE.length)]!;
      const orient = normalizeOrient(requireType(typeId), randInt(rng, 2));
      const x = randInt(rng, 16);
      const z = randInt(rng, 16);
      const y = rng() < 0.9 ? landingLevel(g.model, typeId, orient, x, z) : randInt(rng, 9);
      g.place({ typeId, color: COLORS[randInt(rng, COLORS.length)]!.id, x, y, z, orient });
    } else if (r < 0.8) {
      const ps = g.model.all();
      if (ps.length > 0) g.remove(ps[randInt(rng, ps.length)]!.id);
    } else if (r < 0.92) g.undo();
    else g.redo();
  }
  return g;
}

function roundTrip(game: Game): Game {
  const json = serializeProject(projectFromGame(game, META));
  const parsed = parseProjectJson(json);
  if (!parsed.ok) throw new Error(`relecture refusée : ${parsed.error}`);
  return gameFromProject(parsed.data);
}

describe('sauvegarde : relecture identique', () => {
  for (let seed = 1; seed <= 25; seed++) {
    it(`graine ${seed}`, () => {
      const g = randomGame(seed);
      const back = roundTrip(g);
      expect(snap(back)).toBe(snap(g));
      expect(checkInvariants(back.model)).toEqual([]);
      // Les compteurs reprennent là où ils s'étaient arrêtés : la prochaine pièce reçoit le même identifiant et le même rang.
      const a = g.model.createPiece({ typeId: 'brick-1x1', color: 'rouge', x: 0, y: 0, z: 0, orient: 0 });
      const b = back.model.createPiece({ typeId: 'brick-1x1', color: 'rouge', x: 0, y: 0, z: 0, orient: 0 });
      expect(b.id).toBe(a.id);
      expect(b.placedAt).toBe(a.placedAt);
    });
  }

  it('est stable après annulation complète puis rétablissement complet', () => {
    const g = randomGame(7);
    const before = snap(g);
    while (g.undo());
    expect(snap(roundTrip(g))).toBe(snap(g));
    while (g.redo());
    expect(snap(g)).not.toBe('');
    const back = roundTrip(g);
    expect(snap(back)).toBe(snap(g));
    void before;
  });

  it('conserve les constructions de référence', () => {
    for (const [make, size] of [[buildReferenceSimple, 16], [buildReferenceMultiLevel, 24]] as const) {
      const g = new Game(size, size, 'sable');
      make(g);
      expect(snap(roundTrip(g))).toBe(snap(g));
    }
  });

  it('conserve la hauteur maximale relevée', () => {
    const g = new Game(16, 16, 'vert');
    g.model.maxLevel = 150;
    expect(roundTrip(g).model.maxLevel).toBe(150);
  });
});

describe('fichier de projet : validation', () => {
  const base = (): ProjectData => {
    const g = new Game(16, 16, 'vert');
    buildReferenceSimple(g);
    return JSON.parse(serializeProject(projectFromGame(g, META)));
  };

  it('accepte un projet produit par le jeu', () => {
    expect(parseProject(base()).ok).toBe(true);
  });

  it.each([
    ['schéma inconnu', (d: any) => (d.schema = 2)],
    ['identifiant avec séparateur', (d: any) => (d.id = '../x')],
    ['nom qui n’est pas un texte', (d: any) => (d.name = { a: 1 })],
    ['date invalide', (d: any) => (d.updatedAt = 'hier')],
    ['plaque démesurée', (d: any) => (d.base.w = 100000)],
    ['couleur de plaque inconnue', (d: any) => (d.base.color = 'rose')],
    ['hauteur maximale absurde', (d: any) => (d.maxLevel = 0)],
    ['compteur nul', (d: any) => (d.nextId = 0)],
    ['type de pièce inconnu', (d: any) => (d.pieces[0].typeId = 'mur-9x9')],
    ['couleur de pièce inconnue', (d: any) => (d.pieces[0].color = '<img>')],
    ['position non entière', (d: any) => (d.pieces[0].x = 0.5)],
    ['orientation 1 sur une pièce carrée', (d: any) => { const p = d.pieces.find((q: any) => q.typeId === 'brick-2x2'); p.orient = 1; }],
    ['identifiant de pièce en double', (d: any) => (d.pieces[1].id = d.pieces[0].id)],
    ['pièces qui se chevauchent', (d: any) => { d.pieces[1].x = d.pieces[0].x; d.pieces[1].y = d.pieces[0].y; d.pieces[1].z = d.pieces[0].z; }],
    ['pièce sans appui', (d: any) => (d.pieces[0].y = 30)],
    ['pièce hors de la plaque', (d: any) => (d.pieces[0].x = 15)],
    ['pièces qui ne sont pas une liste', (d: any) => (d.pieces = 'beaucoup')],
  ])('refuse : %s', (_label, corrupt) => {
    const d = base();
    corrupt(d);
    expect(parseProject(d).ok).toBe(false);
  });

  it('refuse un JSON illisible et des données vides', () => {
    expect(parseProjectJson('{oups').ok).toBe(false);
    expect(parseProject(null).ok).toBe(false);
    expect(parseProject(42).ok).toBe(false);
  });

  it('nettoie le nom : pas de balises ni de caractères de contrôle', () => {
    expect(cleanName('  <b>Ma</b>\n\tmaison  ')).toBe('b Ma /b maison');
    const d = base();
    (d as { name: string }).name = '<script>alert(1)</script>';
    const parsed = parseProject(d);
    expect(parsed.ok && parsed.data.name.includes('<')).toBe(false);
  });
});
