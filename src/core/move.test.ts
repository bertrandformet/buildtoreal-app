// Déplacement d'une pièce posée : soulever, déposer, annuler le déplacement, historique.

import { describe, expect, it } from 'vitest';
import { CATALOGUE, COLORS, normalizeOrient, requireType } from './catalogue';
import { Game } from './game';
import type { Snapshot } from './model';
import { makeRng, randInt } from './reference';
import { checkInvariants, landingLevel } from './rules';

const clone = (s: Snapshot): string => JSON.stringify(s);
const brick = (x: number, y: number, z: number, orient = 0, typeId = 'brick-2x4', color = 'rouge') => ({ typeId, color, x, y, z, orient });

function twoBricksAndALid() {
  const game = new Game(16, 16, 'vert', () => 0);
  const a = game.place(brick(2, 0, 2));
  const b = game.place(brick(8, 0, 2));
  if (!a.ok || !b.ok) throw new Error('mise en place');
  return { game, a: a.piece, b: b.piece };
}

describe('déplacer une pièce', () => {
  it('soulève, dépose ailleurs, et annuler / rétablir redonnent exactement les mêmes états', () => {
    const { game, a } = twoBricksAndALid();
    const start = clone(game.snapshot());
    expect(game.lift(a.id).ok).toBe(true);
    expect(game.model.count).toBe(1);
    expect(game.lifted?.id).toBe(a.id);
    const out = game.drop(brick(2, 0, 8));
    expect(out.ok && out.moved).toBe(true);
    const moved = clone(game.snapshot());
    expect(moved).not.toBe(start);
    expect(game.lifted).toBeNull();
    expect(game.historyDepth).toBe(3);
    expect(game.undo()).toBe(true);
    expect(clone(game.snapshot())).toBe(start);
    expect(game.redo()).toBe(true);
    expect(clone(game.snapshot())).toBe(moved);
    expect(checkInvariants(game.model)).toEqual([]);
  });

  it('garde le même identifiant et reçoit un rang de pose neuf', () => {
    const { game, a, b } = twoBricksAndALid();
    game.lift(a.id);
    const out = game.drop(brick(2, 0, 8));
    if (!out.ok) throw new Error('refusé');
    expect(out.piece.id).toBe(a.id);
    expect(out.piece.placedAt).toBeGreaterThan(b.placedAt);
  });

  it('la rotation fait partie du déplacement', () => {
    const { game, a } = twoBricksAndALid();
    game.lift(a.id);
    const out = game.drop(brick(2, 0, 2, 1));
    expect(out.ok && out.moved).toBe(true);
    expect(game.model.get(a.id)?.orient).toBe(1);
  });

  it("déposer au même endroit n'ajoute rien à l'historique", () => {
    const { game, a } = twoBricksAndALid();
    const depth = game.historyDepth;
    game.lift(a.id);
    const out = game.drop(brick(2, 0, 2));
    expect(out.ok && !out.moved).toBe(true);
    expect(game.historyDepth).toBe(depth);
    expect(game.model.get(a.id)).toBeDefined();
    expect(game.lifted).toBeNull();
  });

  it('un dépôt refusé laisse la pièce soulevée ; annuler la remet exactement en place', () => {
    const { game, a } = twoBricksAndALid();
    const start = clone(game.snapshot());
    game.lift(a.id);
    const onTop = game.drop(brick(8, 0, 2)); // sur l'autre brique, au même niveau : collision
    expect(onTop.ok).toBe(false);
    const out = game.drop(brick(2, 5, 8)); // en l'air : sans appui
    expect(out).toEqual({ ok: false, reason: 'sans_appui' });
    expect(game.lifted?.id).toBe(a.id);
    game.cancelLift();
    expect(clone(game.snapshot())).toBe(start);
    expect(game.historyDepth).toBe(2);
  });

  it('refuse de soulever une pièce dont une autre dépend entièrement, comme pour un retrait', () => {
    const { game, a } = twoBricksAndALid();
    const lid = game.place(brick(2, 3, 2));
    if (!lid.ok) throw new Error('couvercle');
    const out = game.lift(a.id);
    expect(out.ok).toBe(false);
    expect(out.ok ? [] : out.stranded.map((p) => p.id)).toEqual([lid.piece.id]);
    expect(game.lifted).toBeNull();
    expect(game.model.get(a.id)).toBeDefined();
  });

  it('soulever une pièce dont les voisines ont un autre appui est permis, et la pièce du dessus reste en place', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    game.place(brick(2, 0, 2));
    game.place(brick(2, 0, 6));
    const lid = game.place({ typeId: 'brick-2x4', color: 'bleu', x: 2, y: 3, z: 4, orient: 0 });
    if (!lid.ok) throw new Error('pont');
    const first = game.model.get(1)!;
    expect(game.lift(first.id).ok).toBe(true);
    expect(game.model.get(lid.piece.id)).toBeDefined();
  });

  it("soulever puis annuler ne laisse aucune trace dans l'historique, et les autres commandes annulent le soulèvement", () => {
    const { game, a } = twoBricksAndALid();
    game.lift(a.id);
    expect(game.historyDepth).toBe(2);
    const placed = game.place(brick(12, 0, 12));
    expect(placed.ok).toBe(true);
    expect(game.lifted).toBeNull();
    expect(game.model.get(a.id)).toBeDefined();
    game.lift(a.id);
    game.undo(); // annule la dernière pose, et remet d'abord la pièce soulevée
    expect(game.model.get(a.id)).toBeDefined();
    expect(game.model.count).toBe(2);
  });

  it("l'état enregistré contient la pièce soulevée : un déplacement interrompu ne perd rien", () => {
    const { game, a } = twoBricksAndALid();
    game.lift(a.id);
    expect(game.exportState().pieces.map((p) => p.id)).toEqual([a.id, 2]);
    expect(game.model.exportState().pieces).toHaveLength(1);
  });

  it('un déplacement ne compte pas dans les « poses ratées »', () => {
    const { game, a } = twoBricksAndALid();
    const before = game.journal.stats();
    game.lift(a.id);
    game.drop(brick(8, 0, 2)); // refusé
    game.drop(brick(2, 0, 8));
    game.undo();
    const after = game.journal.stats();
    expect(after.attempts).toBe(before.attempts);
    expect(after.missed).toBe(before.missed);
  });
});

describe('déplacements au hasard', () => {
  it('les invariants tiennent, annuler tout vide la plaque et rétablir tout redonne le même modèle', () => {
    for (const seed of [3, 17, 91]) {
      const rng = makeRng(seed);
      const game = new Game(16, 16, 'vert', () => 0);
      for (let i = 0; i < 160; i++) {
        const r = rng();
        const pieces = game.model.all();
        if (r < 0.55 || pieces.length < 2) {
          const typeId = CATALOGUE[randInt(rng, CATALOGUE.length)]!;
          const orient = normalizeOrient(requireType(typeId), randInt(rng, 2));
          const x = randInt(rng, 16);
          const z = randInt(rng, 16);
          game.place({ typeId, color: COLORS[randInt(rng, COLORS.length)]!.id, x, y: landingLevel(game.model, typeId, orient, x, z), z, orient });
        } else if (r < 0.9) {
          const p = pieces[randInt(rng, pieces.length)]!;
          const lifted = game.lift(p.id);
          if (lifted.ok) {
            const orient = normalizeOrient(requireType(p.typeId), randInt(rng, 2));
            const x = randInt(rng, 16);
            const z = randInt(rng, 16);
            const out = game.drop({ x, y: landingLevel(game.model, p.typeId, orient, x, z), z, orient });
            if (!out.ok) game.cancelLift();
          }
        } else {
          game.undo();
        }
        expect(game.lifted).toBeNull();
        expect(checkInvariants(game.model), `graine ${seed}, opération ${i}`).toEqual([]);
      }
      const finalState = clone(game.snapshot());
      const finalDepth = game.historyDepth;
      let depth = finalDepth;
      const states: string[] = [];
      while (game.canUndo) {
        states.push(clone(game.snapshot()));
        game.undo();
        depth--;
      }
      expect(depth).toBe(0);
      expect(game.model.count).toBe(0);
      // On rétablit autant qu'on a annulé : si la partie a fini sur des « annuler », il reste d'autres actions à rétablir au-delà.
      for (let k = 0; k < finalDepth; k++) game.redo();
      expect(clone(game.snapshot())).toBe(finalState);
    }
  });
});
