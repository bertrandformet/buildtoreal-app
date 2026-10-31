// Roues : types, tenons sur le support seulement, orientations, appuis, enregistrement et notice.

import { describe, expect, it } from 'vitest';
import { typeName } from '../i18n/typeLabel';
import { CATALOGUE, canRotate, footprintSize, hasStudAt, holderRows, nextOrient, normalizeOrient, requireType, studCells, type Orient } from './catalogue';
import { Game } from './game';
import { buildNotice, parseNotice, partsOf, replayNotice, sameConstruction, serializeNotice } from './notice';
import { parseProject, projectFromGame, serializeProject } from './project';
import { checkInvariants, evaluatePlacement } from './rules';

const WHEELS = CATALOGUE.filter((id) => requireType(id).kind === 'wheel');
const ORIENTS: Orient[] = [0, 1, 2, 3];
const spec = (typeId: string, x: number, y: number, z: number, orient = 0, color = 'rouge') => ({ typeId, color, x, y, z, orient });

describe('types de roues', () => {
  it('le catalogue propose quatre supports à roues, de la hauteur de leurs roues', () => {
    expect(WHEELS).toEqual(['wheels-2x4', 'wheels-2x2', 'wheel-2x2', 'bigwheel-2x2']);
    expect(WHEELS.map((id) => requireType(id).h)).toEqual([5, 3, 3, 5]);
  });

  it('l’emprise ajoute un rang par roue au support', () => {
    expect(WHEELS.map((id) => footprintSize(requireType(id), 0))).toEqual([
      { fx: 2, fz: 6 },
      { fx: 2, fz: 4 },
      { fx: 2, fz: 3 },
      { fx: 2, fz: 3 },
    ]);
  });

  it('les noms donnent la taille du support', () => {
    expect(WHEELS.map((id) => typeName(requireType(id)))).toEqual(['Roues 2×4', 'Petites roues 2×2', 'Petite roue 2×2', 'Grande roue 2×2']);
  });
});

describe('tenons des roues', () => {
  it('seul le support porte des tenons, jamais les rangs de roue', () => {
    const big = requireType('wheels-2x4');
    expect(studCells(big, 0)).toHaveLength(8);
    for (let dx = 0; dx < 2; dx++) {
      expect(hasStudAt(big, 0, dx, 0)).toBe(false);
      expect(hasStudAt(big, 0, dx, 5)).toBe(false);
      for (let dz = 1; dz <= 4; dz++) expect(hasStudAt(big, 0, dx, dz)).toBe(true);
    }
    expect(holderRows(requireType('wheel-2x2'))).toEqual({ from: 0, to: 2 });
  });

  it('la roue seule change de côté avec l’orientation : +Z, -X, -Z, +X', () => {
    const single = requireType('wheel-2x2');
    const free = (o: Orient) => {
      const { fx, fz } = footprintSize(single, o);
      const cells: string[] = [];
      for (let dz = 0; dz < fz; dz++) for (let dx = 0; dx < fx; dx++) if (!hasStudAt(single, o, dx, dz)) cells.push(`${dx},${dz}`);
      return cells;
    };
    expect(free(0)).toEqual(['0,2', '1,2']);
    expect(free(1)).toEqual(['0,0', '0,1']);
    expect(free(2)).toEqual(['0,0', '1,0']);
    expect(free(3)).toEqual(['2,0', '2,1']);
  });
});

describe('orientations des roues', () => {
  it('deux roues : deux orientations ; une roue seule : les quatre', () => {
    for (const id of WHEELS) expect(canRotate(requireType(id)), id).toBe(true);
    const pair = requireType('wheels-2x2');
    expect(ORIENTS.map((o) => normalizeOrient(pair, o))).toEqual([0, 1, 0, 1]);
    expect(nextOrient(pair, 1)).toBe(0);
    const single = requireType('bigwheel-2x2');
    expect(ORIENTS.map((o) => normalizeOrient(single, o))).toEqual([0, 1, 2, 3]);
    expect(nextOrient(single, 3)).toBe(0);
  });
});

describe('appuis des roues', () => {
  it('les roues posent sur la plaque ; une plaque tient sur le support, pas sur un pneu', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    expect(game.place(spec('wheels-2x4', 4, 0, 4)).ok).toBe(true); // support z = 5 à 8, roues z = 4 et 9
    const onHolder = evaluatePlacement(game.model, spec('plate-2x4', 4, 5, 5));
    expect(onHolder.ok).toBe(true);
    expect(onHolder.supportedCells).toHaveLength(8);
    const onTire = evaluatePlacement(game.model, spec('plate-1x2', 4, 5, 4, 1));
    expect(onTire.ok).toBe(false);
    expect(onTire.reason).toBe('tuile');
  });

  it('une petite voiture : deux essieux sous un châssis qui couvre aussi les roues', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    expect(game.place(spec('wheels-2x4', 2, 0, 2, 1)).ok).toBe(true);
    expect(game.place(spec('wheels-2x4', 2, 0, 6, 1)).ok).toBe(true);
    const chassis = game.place(spec('plate-6x6', 2, 5, 2, 0, 'bleu'));
    expect(chassis.ok).toBe(true);
    expect(checkInvariants(game.model)).toEqual([]);
  });

  it('une roue ne traverse pas une pièce voisine', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    game.place(spec('brick-1x1', 6, 0, 6));
    expect(evaluatePlacement(game.model, spec('wheel-2x2', 5, 0, 4)).reason).toBe('collision'); // roue en z = 6
  });
});

describe('roues dans les fichiers et la notice', () => {
  function car(): Game {
    const game = new Game(16, 16, 'vert', () => 0);
    game.place(spec('wheels-2x2', 2, 0, 2, 1, 'gris'));
    game.place(spec('bigwheel-2x2', 8, 0, 2, 3, 'jaune'));
    game.place(spec('wheel-2x2', 12, 0, 2, 2, 'blanc-verre'));
    game.place(spec('plate-2x4', 3, 3, 2, 1));
    return game;
  }

  it('le projet les enregistre avec leur orientation et les relit', () => {
    const game = car();
    const data = projectFromGame(game, { id: 'essai', name: 'Essai', createdAt: 1, updatedAt: 1 });
    const parsed = parseProject(JSON.parse(serializeProject(data)));
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.data.pieces.map((p) => p.orient)).toEqual([1, 3, 2, 1]);
  });

  it('le projet refuse un retournement qui n’existe pas pour deux roues', () => {
    const game = car();
    const data = projectFromGame(game, { id: 'essai', name: 'Essai', createdAt: 1, updatedAt: 1 });
    const bad = { ...data, pieces: data.pieces.map((p, i) => (i === 0 ? { ...p, orient: 3 } : p)) };
    expect(parseProject(JSON.parse(JSON.stringify(bad))).ok).toBe(false);
  });

  it('la notice rejouée redonne la construction, roues listées après les autres pièces', () => {
    const game = car();
    const notice = buildNotice(game.model, game.baseColor);
    const replay = replayNotice(notice);
    expect(replay.errors).toEqual([]);
    expect(sameConstruction(replay.model, game.model)).toBe(true);
    expect(parseNotice(JSON.parse(serializeNotice(notice))).ok).toBe(true);
    expect(partsOf(game.model.all()).map((l) => l.typeId)).toEqual(['plate-2x4', 'wheel-2x2', 'bigwheel-2x2', 'wheels-2x2']);
  });
});
