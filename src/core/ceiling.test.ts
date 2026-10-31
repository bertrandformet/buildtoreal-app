// Plafond relevable : une pose refusée faute de hauteur passe après relèvement ; la nouvelle hauteur est gardée.

import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { Model } from './model';
import { buildNotice, replayNotice, sameConstruction } from './notice';
import { gameFromProject, parseProject, projectFromGame, serializeProject } from './project';
import { evaluatePlacement } from './rules';

/** Une tour de colonnes jusqu'au plafond (30 briques par défaut). */
function tower(): Game {
  const game = new Game(16, 16, 'vert', () => 0);
  for (let y = 0; y < Model.DEFAULT_MAX_LEVEL; y += 12) {
    const out = game.place({ typeId: 'column-4', color: 'rouge', x: 4, y, z: 4, orient: 0 });
    if (!out.ok) break;
  }
  return game;
}

describe('plafond relevable', () => {
  it('au plafond, la pose est refusée ; après relèvement, elle passe', () => {
    const game = tower();
    const top = game.model.columnTop(4, 4);
    const q = { typeId: 'brick-1x1', x: 4, y: top, z: 4, orient: 0 };
    expect(top).toBe(84);
    expect(evaluatePlacement(game.model, { ...q, typeId: 'column-4' }).reason).toBe('trop_haut');
    expect(game.raiseCeiling()).toBe(40);
    expect(game.model.maxLevel).toBe(120);
    expect(game.place({ ...q, typeId: 'column-4', color: 'bleu' }).ok).toBe(true);
  });

  it('s’arrête à 100 briques', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    for (let i = 0; i < 12; i++) game.raiseCeiling();
    expect(game.model.maxLevel).toBe(Model.MAX_LEVEL_LIMIT);
    expect(game.canRaiseCeiling).toBe(false);
  });

  it('la nouvelle hauteur est gardée par le projet et par la notice', () => {
    const game = tower();
    game.raiseCeiling();
    game.place({ typeId: 'column-4', color: 'bleu', x: 4, y: game.model.columnTop(4, 4), z: 4, orient: 0 });
    const data = projectFromGame(game, { id: 'essai', name: 'Essai', createdAt: 1, updatedAt: 1 });
    const parsed = parseProject(JSON.parse(serializeProject(data)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(gameFromProject(parsed.data).model.maxLevel).toBe(120);
    const notice = buildNotice(game.model, game.baseColor);
    expect(notice.maxLevel).toBe(120);
    const replay = replayNotice(notice);
    expect(replay.errors).toEqual([]);
    expect(sameConstruction(replay.model, game.model)).toBe(true);
  });
});
