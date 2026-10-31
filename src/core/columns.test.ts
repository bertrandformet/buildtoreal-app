// Cylindres debout (colonnes) et petites pièces 1×1 : types, orientation, appuis, enregistrement et notice.

import { describe, expect, it } from 'vitest';
import { sizeText, typeName } from '../i18n/typeLabel';
import { CATALOGUE, canRotate, nextOrient, normalizeOrient, requireType, studCells, typesOfKind } from './catalogue';
import { Game } from './game';
import { buildNotice, replayNotice, sameConstruction } from './notice';
import { parseProject, projectFromGame, serializeProject } from './project';
import { checkInvariants, evaluatePlacement } from './rules';

const COLUMNS = CATALOGUE.filter((id) => requireType(id).shape === 'round' && requireType(id).kind === 'brick');
const spec = (typeId: string, x: number, y: number, z: number, orient = 0, color = 'rouge') => ({ typeId, color, x, y, z, orient });

describe('cylindres', () => {
  it('quatre cylindres d’un tenon, de 1 à 4 briques de haut, rangés avec les briques', () => {
    expect(COLUMNS).toEqual(['column-1', 'column-2', 'column-3', 'column-4']);
    expect(COLUMNS.map((id) => requireType(id).h)).toEqual([3, 6, 9, 12]);
    expect(typesOfKind('brick').map((t) => t.id)).toEqual(expect.arrayContaining(COLUMNS));
    for (const id of COLUMNS) expect(studCells(requireType(id), 0)).toEqual([{ dx: 0, dz: 0 }]);
  });

  it('un cylindre ne pivote pas : une seule orientation', () => {
    const col = requireType('column-2');
    expect(canRotate(col)).toBe(false);
    expect([0, 1, 2, 3].map((o) => normalizeOrient(col, o))).toEqual([0, 0, 0, 0]);
    expect(nextOrient(col, 0)).toBe(0);
  });

  it('les noms donnent la hauteur en briques', () => {
    expect(COLUMNS.map((id) => typeName(requireType(id)))).toEqual(['Cylindre 1×1', 'Cylindre 1×2', 'Cylindre 1×3', 'Cylindre 1×4']);
    expect(sizeText(requireType('column-3'))).toBe('rond 3');
  });

  it('une colonne occupe toute sa hauteur et porte une pièce sur son tenon', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    expect(game.place(spec('column-4', 4, 0, 4)).ok).toBe(true);
    expect(evaluatePlacement(game.model, spec('brick-1x1', 4, 6, 4)).reason).toBe('collision');
    expect(game.place(spec('column-4', 6, 0, 4)).ok).toBe(true);
    // Un linteau 1×4 posé sur deux colonnes : un portique.
    expect(game.place(spec('plate-1x4', 4, 12, 4, 1)).ok).toBe(true);
    expect(checkInvariants(game.model)).toEqual([]);
    const data = projectFromGame(game, { id: 'essai', name: 'Essai', createdAt: 1, updatedAt: 1 });
    expect(parseProject(JSON.parse(serializeProject(data))).ok).toBe(true);
    const notice = buildNotice(game.model, game.baseColor);
    const replay = replayNotice(notice);
    expect(replay.errors).toEqual([]);
    expect(sameConstruction(replay.model, game.model)).toBe(true);
  });
});

describe('pièces 1×1', () => {
  it('la brique et la plaque existent en 1×1', () => {
    expect(CATALOGUE).toContain('brick-1x1');
    expect(CATALOGUE).toContain('plate-1x1');
    for (const id of ['tile-1x4', 'tile-1x6', 'tile-1x8', 'tile-2x4', 'tile-2x6', 'tile-2x8', 'brick-1x6', 'brick-1x8', 'brick-2x8', 'plate-1x8', 'plate-2x8', 'plate-8x8']) expect(CATALOGUE).toContain(id);
    expect(requireType('plate-1x1').h).toBe(1);
  });
});

describe('plaques rondes', () => {
  it('1×1 et 2×2, de la hauteur d’une plaque, un tenon par case, rangées avec les plaques', () => {
    const discs = CATALOGUE.filter((id) => requireType(id).shape === 'round' && requireType(id).kind === 'plate');
    expect(discs).toEqual(['roundplate-1x1', 'roundplate-2x2']);
    expect(discs.map((id) => requireType(id).h)).toEqual([1, 1]);
    expect(discs.map((id) => studCells(requireType(id), 0).length)).toEqual([1, 4]);
    expect(discs.map((id) => canRotate(requireType(id)))).toEqual([false, false]);
    expect(discs.map((id) => typeName(requireType(id)))).toEqual(['Plaque ronde 1×1', 'Plaque ronde 2×2']);
    expect(sizeText(requireType('roundplate-2x2'))).toBe('rond 2×2');
  });

  it('une brique se pose sur une plaque ronde 2×2', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    expect(game.place(spec('roundplate-2x2', 4, 0, 4)).ok).toBe(true);
    expect(game.place(spec('brick-2x2', 4, 1, 4)).ok).toBe(true);
    expect(checkInvariants(game.model)).toEqual([]);
  });
});
