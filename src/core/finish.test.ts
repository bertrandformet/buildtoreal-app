// Finition transparente : une couleur « verre » est la couleur de base avec le suffixe -verre.

import { describe, expect, it } from 'vitest';
import { COLORS, baseColorId, clearColorId, colorHex, isClear, isKnownColor } from './catalogue';
import { Game } from './game';
import { buildNotice, partsOf, parseNotice, replayNotice, sameConstruction, serializeNotice } from './notice';
import { parseProject, projectFromGame, serializeProject } from './project';

describe('couleurs transparentes', () => {
  it('chaque couleur existe en version transparente, avec la même teinte', () => {
    for (const c of COLORS) {
      const clear = clearColorId(c.id);
      expect(isClear(clear)).toBe(true);
      expect(isClear(c.id)).toBe(false);
      expect(baseColorId(clear)).toBe(c.id);
      expect(clearColorId(clear)).toBe(clear);
      expect(colorHex(clear)).toBe(c.hex);
      expect(isKnownColor(clear)).toBe(true);
    }
  });

  it('refuse les identifiants inconnus, même avec le suffixe', () => {
    expect(isKnownColor('fuchsia')).toBe(false);
    expect(isKnownColor('fuchsia-verre')).toBe(false);
    expect(isKnownColor('-verre')).toBe(false);
    expect(isKnownColor('bleu-verre-verre')).toBe(false);
  });
});

function sample(): Game {
  const game = new Game(16, 16, 'vert', () => 0);
  game.place({ typeId: 'brick-2x4', color: 'bleu', x: 2, y: 0, z: 2, orient: 0 });
  game.place({ typeId: 'brick-2x4', color: 'bleu-verre', x: 6, y: 0, z: 2, orient: 0 });
  game.place({ typeId: 'brick-2x4', color: 'rouge-verre', x: 2, y: 3, z: 2, orient: 0 });
  return game;
}

describe('pièces transparentes dans les fichiers et la notice', () => {
  it('le projet les enregistre et les relit', () => {
    const data = projectFromGame(sample(), { id: 'essai', name: 'Essai', createdAt: 1, updatedAt: 1 });
    const parsed = parseProject(JSON.parse(serializeProject(data)));
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.data.pieces.map((p) => p.color)).toEqual(['bleu', 'bleu-verre', 'rouge-verre']);
  });

  it('le projet refuse une couleur transparente inconnue', () => {
    const data = projectFromGame(sample(), { id: 'essai', name: 'Essai', createdAt: 1, updatedAt: 1 });
    const bad = { ...data, pieces: data.pieces.map((p, i) => (i === 0 ? { ...p, color: 'fuchsia-verre' } : p)) };
    expect(parseProject(JSON.parse(JSON.stringify(bad))).ok).toBe(false);
  });

  it('la notice distingue la pièce opaque de la pièce transparente, les rejoue et les relit', () => {
    const game = sample();
    const notice = buildNotice(game.model, game.baseColor);
    const lines = partsOf(notice.steps.flatMap((s) => s.pieces));
    expect(lines.map((l) => l.color).sort()).toEqual(['bleu', 'bleu-verre', 'rouge-verre']);
    const replay = replayNotice(notice);
    expect(replay.errors).toEqual([]);
    expect(sameConstruction(replay.model, game.model)).toBe(true);
    const back = parseNotice(JSON.parse(serializeNotice(notice)));
    expect(back.ok).toBe(true);
  });
});
