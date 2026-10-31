// Pentes : types, tenons par case, quatre orientations, règles d'appui, enregistrement et notice.

import { describe, expect, it } from 'vitest';
import { CATALOGUE, canRotate, footprintSize, getType, hasStudAt, nextOrient, normalizeOrient, requireType, studCells, type Orient } from './catalogue';
import { Game } from './game';
import { buildNotice, parseNotice, replayNotice, sameConstruction, serializeNotice } from './notice';
import { parseProject, projectFromGame, serializeProject } from './project';
import { checkInvariants, dependentsOf, evaluatePlacement, supportsOf } from './rules';

const SLOPES = CATALOGUE.filter((id) => requireType(id).kind === 'slope');
const ORIENTS: Orient[] = [0, 1, 2, 3];

describe('types de pentes', () => {
  it('le catalogue compte sept pentes, toutes de la hauteur d’une brique', () => {
    expect(SLOPES).toEqual(['slope-1x2', 'slope-2x2', 'slope-2x3', 'slope-2x4', 'gentle-2x3', 'gentle-2x4', 'corner-2x2']);
    for (const id of SLOPES) expect(requireType(id).h).toBe(3);
  });

  it('refuse les pentes impossibles (pas de rang plat, mauvaise largeur, angle qui n’est pas 2×2)', () => {
    for (const id of ['slope-1x1', 'slope-3x4', 'slope-2x6', 'gentle-2x2', 'gentle-1x3', 'corner-2x3', 'corner-1x1']) expect(getType(id), id).toBeUndefined();
  });
});

describe('tenons des pentes', () => {
  const studCount = (id: string) => studCells(requireType(id), 0).length;

  it('une pente raide a un rang de tenons de moins que sa longueur, une pente douce deux, un angle un seul tenon', () => {
    expect(studCount('slope-1x2')).toBe(1);
    expect(studCount('slope-2x2')).toBe(2);
    expect(studCount('slope-2x3')).toBe(4);
    expect(studCount('slope-2x4')).toBe(6);
    expect(studCount('gentle-2x3')).toBe(2);
    expect(studCount('gentle-2x4')).toBe(4);
    expect(studCount('corner-2x2')).toBe(1);
  });

  it('les tenons restent dans l’emprise et leur nombre ne change pas avec l’orientation', () => {
    for (const id of SLOPES) {
      const type = requireType(id);
      for (const o of ORIENTS) {
        const { fx, fz } = footprintSize(type, o);
        const cells = studCells(type, o);
        expect(cells).toHaveLength(studCount(id));
        for (const c of cells) {
          expect(c.dx >= 0 && c.dx < fx && c.dz >= 0 && c.dz < fz, `${id} ${o}`).toBe(true);
          expect(hasStudAt(type, o, c.dx, c.dz)).toBe(true);
        }
      }
    }
  });

  it('le rang de tenons est du côté haut : la pente descend vers +Z, -X, -Z, +X pour les orientations 0, 1, 2, 3', () => {
    const type = requireType('slope-2x4'); // un seul rang en pente, trois rangs plats
    // Orientation 0 : emprise 2 (x) × 4 (z), pente sur la dernière ligne (z = 3).
    expect(hasStudAt(type, 0, 0, 0)).toBe(true);
    expect(hasStudAt(type, 0, 1, 2)).toBe(true);
    expect(hasStudAt(type, 0, 0, 3)).toBe(false);
    // Orientation 2 : retournée, pente sur la première ligne (z = 0).
    expect(hasStudAt(type, 2, 0, 0)).toBe(false);
    expect(hasStudAt(type, 2, 1, 3)).toBe(true);
    // Orientation 1 : emprise 4 (x) × 2 (z), pente du côté x = 0.
    expect(hasStudAt(type, 1, 0, 0)).toBe(false);
    expect(hasStudAt(type, 1, 3, 1)).toBe(true);
    // Orientation 3 : pente du côté x = 3.
    expect(hasStudAt(type, 3, 3, 0)).toBe(false);
    expect(hasStudAt(type, 3, 0, 1)).toBe(true);
  });

  it('l’angle a son tenon dans un coin différent selon l’orientation', () => {
    const type = requireType('corner-2x2');
    const corners = ORIENTS.map((o) => studCells(type, o)[0]);
    expect(corners).toEqual([
      { dx: 0, dz: 0 },
      { dx: 1, dz: 0 },
      { dx: 1, dz: 1 },
      { dx: 0, dz: 1 },
    ]);
  });
});

describe('orientations', () => {
  it('une pente pivote toujours (même carrée), un bloc carré jamais, un bloc long seulement par bascule', () => {
    expect(canRotate(requireType('corner-2x2'))).toBe(true);
    expect(canRotate(requireType('slope-2x2'))).toBe(true);
    expect(canRotate(requireType('brick-2x2'))).toBe(false);
    expect(canRotate(requireType('brick-2x4'))).toBe(true);
    const brick = requireType('brick-2x4');
    expect(nextOrient(brick, 0)).toBe(1);
    expect(nextOrient(brick, 1)).toBe(0);
    const slope = requireType('slope-2x3');
    let o: Orient = 0;
    const seen: Orient[] = [];
    for (let i = 0; i < 4; i++) {
      o = nextOrient(slope, o);
      seen.push(o);
    }
    expect(seen).toEqual([1, 2, 3, 0]);
  });

  it('un bloc ne connaît que 0 et 1, une pente les quatre', () => {
    expect([0, 1, 2, 3, 4, -1].map((o) => normalizeOrient(requireType('brick-2x4'), o))).toEqual([0, 1, 0, 1, 0, 1]);
    expect([0, 1, 2, 3, 4, -1].map((o) => normalizeOrient(requireType('slope-2x4'), o))).toEqual([0, 1, 2, 3, 0, 3]);
    expect([0, 1, 2, 3].map((o) => normalizeOrient(requireType('brick-2x2'), o))).toEqual([0, 0, 0, 0]);
  });
});

const spec = (typeId: string, x: number, y: number, z: number, orient = 0, color = 'rouge') => ({ typeId, color, x, y, z, orient });

describe('appuis sur une pente', () => {
  it('on peut poser sur le rang de tenons, pas sur la partie en pente', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    game.place(spec('slope-2x4', 4, 0, 4, 0)); // tenons : z = 4, 5, 6 ; pente : z = 7
    const onStuds = evaluatePlacement(game.model, spec('brick-2x2', 4, 3, 4));
    expect(onStuds.ok).toBe(true);
    const onSlope = evaluatePlacement(game.model, spec('brick-2x2', 4, 3, 7, 0));
    expect(onSlope.ok).toBe(false);
    expect(onSlope.reason).toBe('tuile');
    const straddle = evaluatePlacement(game.model, spec('brick-2x2', 4, 3, 6, 0));
    expect(straddle.ok).toBe(true);
    expect(straddle.supportedCells).toHaveLength(2); // seul le rang z = 6 porte la pièce
  });

  it('une pièce posée sur la partie en pente d’une autre n’en dépend pas, mais ne tient que par ses autres appuis', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    const slope = game.place(spec('slope-2x4', 4, 0, 4, 0));
    if (!slope.ok) throw new Error('pente');
    const lid = game.place(spec('brick-2x2', 4, 3, 6, 0));
    if (!lid.ok) throw new Error('couvercle');
    expect(dependentsOf(game.model, slope.piece).map((p) => p.id)).toEqual([lid.piece.id]);
    expect(supportsOf(game.model, lid.piece).ids).toEqual([slope.piece.id]);
    expect(game.remove(slope.piece.id).ok).toBe(false); // le couvercle perdrait son seul appui
  });

  it('une pente se pose comme une brique : au moins un tenon dessous', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    game.place(spec('brick-2x4', 4, 0, 4, 0));
    expect(game.place(spec('slope-2x2', 4, 3, 4, 2)).ok).toBe(true);
    expect(game.place(spec('slope-2x2', 12, 3, 12, 0)).ok).toBe(false);
    expect(checkInvariants(game.model)).toEqual([]);
  });

  it('empiler une pente sur une pente : seuls les tenons portent', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    game.place(spec('gentle-2x4', 4, 0, 4, 0)); // tenons z = 4, 5 ; pente z = 6, 7
    expect(game.place(spec('slope-2x2', 4, 3, 6, 0)).ok).toBe(false);
    expect(game.place(spec('slope-2x2', 4, 3, 4, 0)).ok).toBe(true);
  });
});

describe('pentes dans les fichiers et la notice', () => {
  function roof(): Game {
    const game = new Game(16, 16, 'vert', () => 0);
    game.place(spec('brick-2x4', 4, 0, 4, 0));
    game.place(spec('slope-2x4', 4, 3, 4, 0, 'orange'));
    game.place(spec('gentle-2x3', 8, 0, 4, 3, 'bleu'));
    game.place(spec('corner-2x2', 8, 3, 4, 1, 'jaune-verre'));
    return game;
  }

  it('le projet les enregistre avec leur orientation (0 à 3) et les relit', () => {
    const game = roof();
    expect(game.model.count).toBe(4);
    const data = projectFromGame(game, { id: 'essai', name: 'Essai', createdAt: 1, updatedAt: 1 });
    const parsed = parseProject(JSON.parse(serializeProject(data)));
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.data.pieces.map((p) => p.orient)).toEqual([0, 0, 3, 1]);
  });

  it('le projet refuse un retournement qui n’existe pas pour une brique', () => {
    const game = roof();
    const data = projectFromGame(game, { id: 'essai', name: 'Essai', createdAt: 1, updatedAt: 1 });
    const bad = { ...data, pieces: data.pieces.map((p, i) => (i === 0 ? { ...p, orient: 2 } : p)) };
    expect(parseProject(JSON.parse(JSON.stringify(bad))).ok).toBe(false);
  });

  it('la notice rejouée redonne la construction', () => {
    const game = roof();
    const notice = buildNotice(game.model, game.baseColor);
    const replay = replayNotice(notice);
    expect(replay.errors).toEqual([]);
    expect(sameConstruction(replay.model, game.model)).toBe(true);
    expect(parseNotice(JSON.parse(serializeNotice(notice))).ok).toBe(true);
  });
});
