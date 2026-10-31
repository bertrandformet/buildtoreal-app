// La promesse du produit : la notice permet de reconstruire exactement la construction.
// Critère : zéro différence sur trois constructions de référence, par rejeu automatique de la notice sérialisée,
// sans accès au modèle source.

import { describe, expect, it } from 'vitest';
import { CATALOGUE, COLORS, normalizeOrient, requireType } from './catalogue';
import { Game } from './game';
import {
  DEFAULT_MAX_PER_STEP,
  MAX_STEP_SPREAD,
  assemblyOrder,
  buildNotice,
  constructionKey,
  noticePieceCount,
  parseNotice,
  parseNoticeJson,
  partsOf,
  replayNotice,
  sameConstruction,
  serializeNotice,
} from './notice';
import { buildDenseReference, buildReferenceMultiLevel, buildReferenceSimple, makeRng, randInt } from './reference';
import { landingLevel } from './rules';

function simple(): Game {
  const g = new Game(16, 16, 'vert');
  buildReferenceSimple(g);
  return g;
}
function dense(): Game {
  const g = new Game(32, 32, 'gris');
  buildDenseReference(g, 200, 11);
  return g;
}
function multi(): Game {
  const g = new Game(24, 24, 'sable');
  buildReferenceMultiLevel(g);
  return g;
}

const REFERENCES: Array<[string, () => Game]> = [
  ['simple', simple],
  ['dense', dense],
  ['multi-niveaux', multi],
];

describe.each(REFERENCES)('construction de référence « %s »', (_name, make) => {
  const game = make();
  const notice = buildNotice(game.model, game.baseColor);

  it('contient chaque pièce exactement une fois', () => {
    expect(noticePieceCount(notice)).toBe(game.model.count);
  });

  it('respecte le plafond de pièces par étape', () => {
    for (const step of notice.steps) {
      expect(step.pieces.length).toBeGreaterThan(0);
      expect(step.pieces.length).toBeLessThanOrEqual(DEFAULT_MAX_PER_STEP);
    }
  });

  it("garde chaque étape locale (écart maximal avec sa première pièce)", () => {
    for (const step of notice.steps) {
      const first = step.pieces[0]!;
      for (const p of step.pieces) {
        expect(Math.max(Math.abs(p.x - first.x), Math.abs(p.z - first.z))).toBeLessThanOrEqual(MAX_STEP_SPREAD);
      }
    }
  });

  it('se rejoue sans erreur et redonne exactement la construction', () => {
    const replay = replayNotice(notice);
    expect(replay.errors).toEqual([]);
    expect(replay.ok).toBe(true);
    expect(sameConstruction(replay.model, game.model)).toBe(true);
  });

  it('se reconstruit depuis la notice sérialisée seule (zéro différence)', () => {
    const parsed = parseNoticeJson(serializeNotice(notice));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const replay = replayNotice(parsed.notice);
    expect(replay.ok).toBe(true);
    expect(constructionKey(replay.model)).toBe(constructionKey(game.model));
    expect(replay.model.count).toBe(game.model.count);
  });

  it('liste exactement les mêmes pièces que la construction', () => {
    const all = notice.steps.flatMap((s) => s.pieces);
    const total = partsOf(all).reduce((n, l) => n + l.count, 0);
    expect(total).toBe(game.model.count);
  });
});

describe("ordre de montage", () => {
  it('place ce qui est glissé sous un surplomb avant le tablier qui le recouvre', () => {
    const g = multi();
    const order = assemblyOrder(g.model);
    const rank = new Map(order.map((p, i) => [p.id, i]));
    // Contrôle direct : le pilier glissé sous le tablier (6, 9, niveau 3) précède le tablier (4, 9, niveau 6).
    const under = g.model.pieceAt(6, 3, 9)!;
    const deck = g.model.pieceAt(6, 6, 9)!;
    expect(rank.get(under.id)!).toBeLessThan(rank.get(deck.id)!);
    // Et chaque pièce vient après toutes celles qui se trouvent sous elle.
    for (const p of g.model.all()) {
      const below = g.model.pieceAt(p.x, p.y - 1, p.z);
      if (below) expect(rank.get(below.id)!).toBeLessThan(rank.get(p.id)!);
    }
  });

  it("suit l'ordre de pose réel quand rien ne l'interdit", () => {
    const g = new Game(16, 16, 'vert');
    const a = g.place({ typeId: 'brick-2x2', color: 'rouge', x: 0, y: 0, z: 0, orient: 0 });
    const b = g.place({ typeId: 'brick-2x2', color: 'bleu', x: 8, y: 0, z: 8, orient: 0 });
    const c = g.place({ typeId: 'brick-2x2', color: 'vert', x: 4, y: 0, z: 4, orient: 0 });
    if (!a.ok || !b.ok || !c.ok) throw new Error('pose refusée');
    expect(assemblyOrder(g.model).map((p) => p.id)).toEqual([a.piece.id, b.piece.id, c.piece.id]);
  });

  it('ignore la pose, la suppression puis la repose : la notice ne contient que la construction finale', () => {
    const g = new Game(16, 16, 'vert');
    const first = g.place({ typeId: 'brick-2x2', color: 'rouge', x: 2, y: 0, z: 2, orient: 0 });
    if (!first.ok) throw new Error('pose refusée');
    g.remove(first.piece.id);
    g.place({ typeId: 'brick-2x2', color: 'bleu', x: 2, y: 0, z: 2, orient: 0 });
    const notice = buildNotice(g.model, g.baseColor);
    expect(noticePieceCount(notice)).toBe(1);
    expect(notice.steps[0]!.pieces[0]!.color).toBe('bleu');
  });
});

describe('notice : propriété sur des constructions aléatoires', () => {
  for (let seed = 1; seed <= 25; seed++) {
    it(`graine ${seed}`, () => {
      const rng = makeRng(seed * 101);
      const game = new Game(16, 16, 'bleu', () => 0);
      for (let i = 0; i < 250; i++) {
        const r = rng();
        if (r < 0.75) {
          const typeId = CATALOGUE[randInt(rng, CATALOGUE.length)]!;
          const orient = normalizeOrient(requireType(typeId), randInt(rng, 2));
          const x = randInt(rng, 16);
          const z = randInt(rng, 16);
          const y = rng() < 0.9 ? landingLevel(game.model, typeId, orient, x, z) : randInt(rng, 9);
          game.place({ typeId, color: COLORS[randInt(rng, COLORS.length)]!.id, x, y, z, orient });
        } else if (r < 0.9) {
          const pieces = game.model.all();
          if (pieces.length > 0) game.remove(pieces[randInt(rng, pieces.length)]!.id);
        } else {
          game.undo();
        }
      }
      const notice = buildNotice(game.model, game.baseColor, 1 + randInt(rng, 9));
      const replay = replayNotice(notice);
      expect(replay.errors).toEqual([]);
      expect(sameConstruction(replay.model, game.model)).toBe(true);
    });
  }
});

describe('notice : validation des données importées', () => {
  const good = () => JSON.parse(serializeNotice(buildNotice(simple().model, 'vert')));

  it('accepte une notice produite par le jeu', () => {
    expect(parseNotice(good()).ok).toBe(true);
  });

  it.each([
    ['schéma inconnu', (n: any) => (n.schema = 99)],
    ['plaque trop grande', (n: any) => (n.base.w = 5000)],
    ['couleur de plaque inconnue', (n: any) => (n.base.color = 'fuchsia')],
    ['type de pièce inconnu', (n: any) => (n.steps[0].pieces[0].typeId = 'mur-2x2')],
    ['couleur de pièce inconnue', (n: any) => (n.steps[0].pieces[0].color = '<script>')],
    ['position non entière', (n: any) => (n.steps[0].pieces[0].x = 1.5)],
    ['orientation invalide', (n: any) => (n.steps[0].pieces[0].orient = 3)],
    ['aucune étape', (n: any) => (n.steps = [])],
  ])('refuse : %s', (_label, corrupt) => {
    const n = good();
    corrupt(n);
    expect(parseNotice(n).ok).toBe(false);
  });

  it('refuse un JSON illisible', () => {
    expect(parseNoticeJson('{pas du json').ok).toBe(false);
  });

  it('signale une notice dont une pose est invalide au rejeu', () => {
    const n = good();
    n.steps[0].pieces[0].y = 12; // pièce en l'air
    const parsed = parseNotice(n);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(replayNotice(parsed.notice).ok).toBe(false);
  });
});
