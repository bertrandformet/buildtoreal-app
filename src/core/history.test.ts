// Tests par propriétés : séquences aléatoires de commandes, graine fixe (reproductibles).
//  1. annuler tout ramène au modèle vide ;
//  2. rétablir tout redonne le même modèle, champ par champ (identifiants et rangs de pose compris) ;
//  3. l'état après chaque annulation/rétablissement est identique à l'état enregistré à cette profondeur ;
//  4. les invariants tiennent après chaque opération.

import { describe, expect, it } from 'vitest';
import { CATALOGUE, COLORS, normalizeOrient, requireType } from './catalogue';
import { Game } from './game';
import type { Snapshot } from './model';
import { buildDenseReference, makeRng, randInt } from './reference';
import { checkInvariants, landingLevel } from './rules';

const clone = (s: Snapshot): string => JSON.stringify(s);

function randomSession(seed: number, ops: number) {
  const rng = makeRng(seed);
  const game = new Game(16, 16, 'vert', () => 0);
  // snapshots[d] = état attendu quand la profondeur d'historique vaut d.
  const snapshots: string[] = [clone(game.snapshot())];
  let depth = 0;

  for (let i = 0; i < ops; i++) {
    const r = rng();
    if (r < 0.6) {
      const typeId = CATALOGUE[randInt(rng, CATALOGUE.length)]!;
      const type = requireType(typeId);
      const orient = normalizeOrient(type, randInt(rng, 2));
      const x = randInt(rng, 16);
      const z = randInt(rng, 16);
      const y = rng() < 0.85 ? landingLevel(game.model, typeId, orient, x, z) : randInt(rng, 12);
      const out = game.place({ typeId, color: COLORS[randInt(rng, COLORS.length)]!.id, x, y, z, orient });
      if (out.ok) {
        depth++;
        snapshots.length = depth;
        snapshots.push(clone(game.snapshot()));
      }
    } else if (r < 0.75) {
      const pieces = game.model.all();
      if (pieces.length > 0) {
        const p = pieces[randInt(rng, pieces.length)]!;
        if (game.remove(p.id).ok) {
          depth++;
          snapshots.length = depth;
          snapshots.push(clone(game.snapshot()));
        }
      }
    } else if (r < 0.9) {
      if (game.undo()) {
        depth--;
        expect(clone(game.snapshot())).toBe(snapshots[depth]);
      }
    } else if (game.redo()) {
      depth++;
      expect(clone(game.snapshot())).toBe(snapshots[depth]);
    }
    expect(checkInvariants(game.model)).toEqual([]);
  }
  return { game, snapshots, depth };
}

describe('historique : propriétés sur séquences aléatoires', () => {
  for (let seed = 1; seed <= 25; seed++) {
    it(`graine ${seed}`, () => {
      const session = randomSession(seed, 400);
      const { game, snapshots } = session;
      let depth = session.depth;
      expect(clone(game.snapshot())).toBe(snapshots[depth]);
      // La session peut se terminer avec des commandes à rétablir : on remonte d'abord au sommet de l'historique.
      while (game.redo()) {
        depth++;
        expect(clone(game.snapshot())).toBe(snapshots[depth]);
      }
      const final = clone(game.snapshot());

      // 1. tout annuler ramène au modèle vide (et chaque étape correspond à l'état enregistré)
      let d = depth;
      while (game.undo()) {
        d--;
        expect(clone(game.snapshot())).toBe(snapshots[d]);
      }
      expect(d).toBe(0);
      expect(game.model.count).toBe(0);
      expect(clone(game.snapshot())).toBe(snapshots[0]);

      // 2. tout rétablir redonne exactement le même modèle
      while (game.redo()) d++;
      expect(d).toBe(depth);
      expect(clone(game.snapshot())).toBe(final);
      expect(checkInvariants(game.model)).toEqual([]);
    });
  }
});

describe('construction de référence dense', () => {
  it('pose 300 pièces valides, de façon reproductible', () => {
    const a = new Game(32, 32, 'vert');
    const placed = buildDenseReference(a, 300, 7);
    expect(placed).toBe(300);
    expect(checkInvariants(a.model)).toEqual([]);

    const b = new Game(32, 32, 'vert');
    buildDenseReference(b, 300, 7);
    expect(clone(b.snapshot())).toBe(clone(a.snapshot()));
  });
});
