// Ce que le jeu enregistre doit toujours se rouvrir : plafonds partagés avec la relecture, modules disjoints, noms de pièces piégés.

import { describe, expect, it } from 'vitest';
import { getType } from './catalogue';
import { Game, type PlateSide } from './game';
import { MAX_PIECES, MAX_PLATES } from './model';
import { MAX_COPIES, MAX_MODULES } from './modules';
import { gameFromProject, parseProject, projectFromGame, serializeProject } from './project';

const put = (game: Game, typeId: string, x: number, y: number, z: number, color = 'rouge') => {
  const out = game.place({ typeId, color, x, y, z, orient: 0 });
  if (!out.ok) throw new Error(`pose refusée : ${typeId} (${out.reason})`);
  return out.piece;
};

const roundTrip = (game: Game) => {
  const data = projectFromGame(game, { id: 'essai', name: 'Essai', createdAt: 1, updatedAt: 1 });
  const parsed = parseProject(JSON.parse(serializeProject(data)));
  if (!parsed.ok) throw new Error(`relecture refusée : ${parsed.error}`);
  return gameFromProject(parsed.data);
};

describe('noms de pièces piégés', () => {
  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'])('« %s » n’est pas une pièce', (name) => {
    expect(getType(name)).toBeUndefined();
  });

  it('un projet dont une pièce s’appelle « constructor » est refusé', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    put(game, 'brick-2x4', 2, 0, 2);
    const data = projectFromGame(game, { id: 'essai', name: 'Essai', createdAt: 1, updatedAt: 1 });
    for (const name of ['constructor', '__proto__']) {
      const bad = JSON.parse(serializeProject(data));
      bad.pieces[0].typeId = name;
      expect(parseProject(bad).ok, name).toBe(false);
      const badColor = JSON.parse(serializeProject(data));
      badColor.pieces[0].color = name;
      expect(parseProject(badColor).ok, `couleur ${name}`).toBe(false);
    }
  });
});

describe('plafonds', () => {
  it('pièces : la 5 001ᵉ est refusée et le projet à 5 000 pièces se rouvre', () => {
    const game = new Game(128, 128, 'vert', () => 0);
    for (let i = 0; i < MAX_PIECES; i++) put(game, 'brick-1x1', i % 100, 0, Math.floor(i / 100));
    expect(game.place({ typeId: 'brick-1x1', color: 'rouge', x: 100, y: 0, z: 0, orient: 0 })).toEqual({ ok: false, reason: 'limite' });
    expect(roundTrip(game).model.count).toBe(MAX_PIECES);
  });

  it('plaques : la 17ᵉ est refusée et le projet à 16 plaques se rouvre', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    const add = (from: number, side: PlateSide) => game.addPlate(from, side, 16, 'vert');
    for (let i = 0; i < 7; i++) expect(add(i, 'x+').ok).toBe(true);
    for (let j = 0; j < 8; j++) expect(add(j, 'z+').ok).toBe(true);
    expect(game.model.plates).toHaveLength(MAX_PLATES);
    expect(add(0, 'z-')).toEqual({ ok: false, reason: 'limite' });
    expect(roundTrip(game).model.plates).toHaveLength(MAX_PLATES);
  });

  it('modules : le 201ᵉ est refusé et le projet à 200 modules se rouvre', () => {
    const game = new Game(64, 64, 'vert', () => 0);
    const stacks: number[][] = [];
    for (let i = 0; i < MAX_MODULES + 1; i++) {
      const x = (i % 32) * 2;
      const z = Math.floor(i / 32) * 2;
      stacks.push([put(game, 'brick-1x1', x, 0, z).id, put(game, 'brick-1x1', x, 3, z).id]);
    }
    for (let i = 0; i < MAX_MODULES; i++) expect(game.createModule(stacks[i]!, `M${i}`).ok).toBe(true);
    expect(game.createModule(stacks[MAX_MODULES]!, 'Trop')).toEqual({ ok: false, reason: 'limite' });
    expect(game.beginModule('Trop')).toEqual({ ok: false, reason: 'limite' });
    expect(roundTrip(game).modules).toHaveLength(MAX_MODULES);
  });

  it('copies : au plus 50 par module, même si le fichier en contient plus', () => {
    const game = new Game(64, 64, 'vert', () => 0);
    const stack = (x: number, z: number) => [put(game, 'brick-1x1', x, 0, z).id, put(game, 'brick-1x1', x, 3, z).id];
    const first = stack(0, 0);
    const copies = Array.from({ length: MAX_COPIES + 10 }, (_, i) => stack(2 + (i % 30) * 2, 2 + Math.floor(i / 30) * 2));
    const data = projectFromGame(game, { id: 'essai', name: 'Essai', createdAt: 1, updatedAt: 1 });
    const raw = JSON.parse(serializeProject(data));
    raw.modules = [{ id: 1, name: 'M', pieces: first, copies }];
    const parsed = parseProject(raw);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.data.modules?.[0]?.copies).toHaveLength(MAX_COPIES);
    expect(roundTrip(gameFromProject(parsed.data)).modules[0]!.copies).toHaveLength(MAX_COPIES);
  });
});

describe('une pièce n’est que dans un seul module', () => {
  it('retirer une pièce, créer un autre module avec sa voisine, puis ↶ ne met pas une pièce dans deux modules', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    const a = put(game, 'brick-2x4', 2, 0, 2, 'blanc');
    const b = put(game, 'brick-1x1', 2, 3, 2);
    const c = put(game, 'brick-1x1', 3, 3, 2);
    expect(game.createModule([a.id, b.id], 'Premier').ok).toBe(true);
    expect(game.remove(b.id).ok).toBe(true);
    expect(game.modules).toHaveLength(0);
    expect(game.createModule([a.id, c.id], 'Second').ok).toBe(true);
    expect(game.undo()).toBe(true);
    const ids = game.modules.flatMap((m) => m.pieceIds);
    expect(new Set(ids).size).toBe(ids.length);
    expect(game.modules.map((m) => m.name)).toEqual(['Premier']);
    expect(roundTrip(game).modules).toHaveLength(1);
  });
});
