// Portes et fenêtres : forme, pose, ouverture et fermeture, fichiers et notice.

import { describe, expect, it } from 'vitest';
import { typeName } from '../i18n/typeLabel';
import { accentColor, canRotate, isOpening, requireType, typesOfKind } from './catalogue';
import { Game } from './game';
import { buildNotice, replayNotice, sameConstruction } from './notice';
import { gameFromProject, parseProject, projectFromGame, serializeProject } from './project';

const put = (game: Game, typeId: string, x: number, y: number, z: number, color = 'rouge', orient = 0) => {
  const out = game.place({ typeId, color, x, y, z, orient });
  if (!out.ok) throw new Error(`pose refusée : ${typeId} (${out.reason})`);
  return out.piece;
};

describe('ouvrants', () => {
  it('trois tailles de portes et de fenêtres, dans leur onglet', () => {
    const door = requireType('door-1x4-h5');
    const win = requireType('casement-1x4-h2');
    expect([door.kind, door.w, door.l, door.h, door.studs]).toEqual(['opening', 1, 4, 18, true]);
    expect([win.h, win.shape]).toEqual([9, 'casement']);
    expect(typesOfKind('opening')).toHaveLength(32);
    expect(['door-1x3-h5', 'door-1x6-h7', 'casement-1x3-h4', 'casement-1x6-h3'].map((id) => requireType(id).l)).toEqual([3, 6, 3, 6]);
    expect([5, 6, 7].map((g) => requireType(`door-1x4-h${g}`).h)).toEqual([18, 21, 24]);
    expect([2, 3, 4].map((g) => requireType(`casement-1x4-h${g}`).h)).toEqual([9, 12, 15]);
    expect(typeName(door)).toBe('Porte 1×4, hauteur 5');
    expect(typeName(win)).toBe('Fenêtre 1×4, hauteur 2');
    expect(requireType('door-1x4').h).toBe(18);
    expect(canRotate(door)).toBe(true);
    expect(isOpening('door-1x4-h6') && !isOpening('brick-2x4')).toBe(true);
    expect([accentColor('door-1x4-h5'), accentColor('casement-1x4-h2'), accentColor('brick-2x4')]).toEqual(['noir', 'ciel-verre', null]);
  });

  it('portières de voiture (2 ou 3 briques), hayons debout (1×2, 1×4) et portes doubles', () => {
    const plain = requireType('cardoor-1x4-h2');
    const glazed = requireType('cardoor-1x4-h3');
    expect([plain.w, plain.l, plain.h, glazed.h]).toEqual([1, 4, 6, 9]);
    expect([accentColor(plain.id), accentColor(glazed.id)]).toEqual([null, 'ciel-verre']);
    const gate = requireType('tailgate-1x4-h3');
    expect([gate.w, gate.l, gate.h, accentColor(gate.id)]).toEqual([1, 4, 9, 'ciel-verre']);
    expect(accentColor('tailgate-1x2-h2')).toBeNull();
    expect(typeName(plain)).toBe('Portière droite 1×4, hauteur 2');
    expect(typeName(requireType('cardoor-1x4-h2-m'))).toBe('Portière gauche 1×4, hauteur 2');
    expect(typeName(gate)).toBe('Hayon 1×4, hauteur 3');
    expect(typeName(requireType('door-1x6-h5'))).toBe('Porte double 1×6, hauteur 5');
    expect(typeName(requireType('casement-1x6-h2'))).toBe('Fenêtre double 1×6, hauteur 2');
    const game = new Game(16, 16, 'vert', () => 0);
    const door = put(game, plain.id, 2, 0, 2, 'rouge');
    const lid = put(game, gate.id, 6, 0, 6, 'rouge');
    expect(game.toggleOpening(door.id)).toBe(true);
    expect(game.toggleOpening(lid.id)).toBe(true);
    expect(game.toggleOpening(lid.id)).toBe(false);
  });

  it('s’ouvre et se ferme, mais seulement si c’est une porte ou une fenêtre', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    const door = put(game, 'door-1x4-h5', 2, 0, 2);
    const brick = put(game, 'brick-2x2', 8, 0, 8);
    expect(game.toggleOpening(door.id)).toBe(true);
    expect(game.openings.has(door.id)).toBe(true);
    expect(game.toggleOpening(door.id)).toBe(false);
    expect(game.toggleOpening(brick.id)).toBeNull();
  });

  it('on peut poser sur une porte et une fenêtre (tenons sur le dessus)', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    put(game, 'door-1x4-h5', 2, 0, 2, 'bleu', 1);
    expect(() => put(game, 'brick-2x4', 2, 18, 2, 'rouge', 1)).not.toThrow();
  });

  it('l’état ouvert est gardé dans le fichier ; un fichier sans ce champ s’ouvre fermé', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    const win = put(game, 'casement-1x4-h2', 2, 0, 2);
    game.toggleOpening(win.id);
    const data = projectFromGame(game, { id: 'essai', name: 'Essai', createdAt: 1, updatedAt: 1 });
    const parsed = parseProject(JSON.parse(serializeProject(data)));
    if (!parsed.ok) throw new Error('lecture');
    expect(parsed.data.opened).toEqual([win.id]);
    expect(gameFromProject(parsed.data).openings.has(win.id)).toBe(true);
    const { opened: _drop, ...old } = data;
    void _drop;
    const legacy = parseProject(JSON.parse(JSON.stringify(old)));
    expect(legacy.ok && gameFromProject(legacy.data).openings.size).toBe(0);
  });

  it('refuse un « ouvert » qui n’est pas un ouvrant', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    const brick = put(game, 'brick-2x2', 2, 0, 2);
    const data = { ...projectFromGame(game, { id: 'essai', name: 'Essai', createdAt: 1, updatedAt: 1 }), opened: [brick.id] };
    expect(parseProject(JSON.parse(JSON.stringify(data))).ok).toBe(false);
  });

  it('la notice rejoue les portes et les fenêtres', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    put(game, 'door-1x4-h6', 2, 0, 2, 'bleu');
    put(game, 'casement-1x4-h3', 2, 0, 8, 'blanc', 2);
    const replay = replayNotice(buildNotice(game.model, game.baseColor));
    expect(replay.errors).toEqual([]);
    expect(sameConstruction(replay.model, game.model)).toBe(true);
  });
});
