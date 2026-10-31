import { describe, expect, it } from 'vitest';
import { getType } from './catalogue';
import { Game } from './game';
import { Journal, UNDO_GRACE_MS } from './journal';
import { checkInvariants, evaluatePlacement, evaluateRemoval, landingLevel, supportsOf } from './rules';

const newGame = (size = 16) => new Game(size, size, 'vert');

function put(game: Game, typeId: string, x: number, y: number, z: number, orient = 0) {
  const out = game.place({ typeId, color: 'rouge', x, y, z, orient });
  if (!out.ok) throw new Error(`Pose refusée (${out.reason}) : ${typeId} en ${x},${y},${z}`);
  return out.piece;
}

describe('catalogue paramétrique', () => {
  it('reconstruit un type depuis son identifiant', () => {
    expect(getType('brick-2x4')).toMatchObject({ w: 2, l: 4, h: 3, studs: true });
    expect(getType('plate-1x2')).toMatchObject({ h: 1, studs: true });
    expect(getType('tile-2x2')).toMatchObject({ h: 1, studs: false });
    expect(getType('brick-5x3')).toBeUndefined();
    expect(getType('n-importe-quoi')).toBeUndefined();
  });
});

describe('règles de pose', () => {
  it('accepte une pose sur la plaque de base', () => {
    const g = newGame();
    expect(evaluatePlacement(g.model, { typeId: 'brick-2x4', x: 0, y: 0, z: 0, orient: 0 }).ok).toBe(true);
  });

  it('refuse une pose hors de la plaque', () => {
    const g = newGame();
    expect(evaluatePlacement(g.model, { typeId: 'brick-2x4', x: 15, y: 0, z: 0, orient: 0 }).reason).toBe('hors_plaque');
    expect(evaluatePlacement(g.model, { typeId: 'brick-2x4', x: -1, y: 0, z: 0, orient: 0 }).reason).toBe('hors_plaque');
    // En orientation 1, l'emprise est 4 selon X.
    expect(evaluatePlacement(g.model, { typeId: 'brick-2x4', x: 13, y: 0, z: 0, orient: 1 }).reason).toBe('hors_plaque');
    expect(evaluatePlacement(g.model, { typeId: 'brick-2x4', x: 12, y: 0, z: 0, orient: 1 }).ok).toBe(true);
  });

  it('refuse une collision', () => {
    const g = newGame();
    put(g, 'brick-2x2', 3, 0, 3);
    const r = evaluatePlacement(g.model, { typeId: 'brick-1x1', x: 4, y: 1, z: 4, orient: 0 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('collision');
    // Une brique 1×1 posée au niveau 1 chevauche 2 des 3 couches de la brique 2×2.
    expect(r.collidingCells.length).toBe(2);
  });

  it('refuse une pièce en l’air', () => {
    const g = newGame();
    expect(evaluatePlacement(g.model, { typeId: 'brick-2x2', x: 3, y: 3, z: 3, orient: 0 }).reason).toBe('sans_appui');
  });

  it('refuse une pose décalée d’un niveau (ni collision ni appui)', () => {
    const g = newGame();
    put(g, 'brick-2x2', 3, 0, 3); // occupe y = 0..2, dessus à 3
    expect(evaluatePlacement(g.model, { typeId: 'plate-2x2', x: 3, y: 4, z: 3, orient: 0 }).reason).toBe('sans_appui');
    expect(evaluatePlacement(g.model, { typeId: 'plate-2x2', x: 3, y: 3, z: 3, orient: 0 }).ok).toBe(true);
  });

  it('autorise un porte-à-faux dès qu’une case repose sur un tenon', () => {
    const g = newGame();
    put(g, 'brick-1x1', 5, 0, 5);
    const r = evaluatePlacement(g.model, { typeId: 'plate-2x4', x: 5, y: 3, z: 5, orient: 0 });
    expect(r.ok).toBe(true);
    expect(r.supportedCells.length).toBe(1);
  });

  it('ne s’appuie pas sur une tuile (pas de tenons)', () => {
    const g = newGame();
    put(g, 'tile-2x2', 4, 0, 4);
    const r = evaluatePlacement(g.model, { typeId: 'brick-1x1', x: 4, y: 1, z: 4, orient: 0 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('tuile');
  });

  it('pose une tuile sur des tenons', () => {
    const g = newGame();
    put(g, 'brick-2x2', 4, 0, 4);
    expect(evaluatePlacement(g.model, { typeId: 'tile-2x2', x: 4, y: 3, z: 4, orient: 0 }).ok).toBe(true);
  });

  it('respecte une hauteur maximale relevée', () => {
    const g = newGame();
    g.model.maxLevel = 120;
    expect(evaluatePlacement(g.model, { typeId: 'brick-1x1', x: 0, y: 89, z: 0, orient: 0 }).reason).toBe('sans_appui');
  });

  it('refuse au-dessus de la hauteur maximale', () => {
    const g = newGame();
    expect(evaluatePlacement(g.model, { typeId: 'brick-1x1', x: 0, y: 89, z: 0, orient: 0 }).reason).toBe('trop_haut');
  });

  it('normalise l’orientation des pièces carrées', () => {
    const g = newGame();
    const p = put(g, 'brick-2x2', 0, 0, 0, 1);
    expect(p.orient).toBe(0);
  });

  it('calcule le niveau de chute au-dessus de la colonne la plus haute', () => {
    const g = newGame();
    expect(landingLevel(g.model, 'brick-2x2', 0, 4, 4)).toBe(0);
    put(g, 'brick-1x1', 4, 0, 4);
    put(g, 'plate-1x2', 4, 3, 4);
    expect(landingLevel(g.model, 'brick-2x2', 0, 4, 4)).toBe(4);
    expect(landingLevel(g.model, 'brick-2x2', 0, 8, 8)).toBe(0);
  });
});

describe('règles de suppression (dernier appui)', () => {
  it('refuse de retirer l’unique appui d’une pièce', () => {
    const g = newGame();
    const low = put(g, 'brick-2x2', 4, 0, 4);
    const high = put(g, 'brick-2x2', 4, 3, 4);
    const r = g.remove(low.id);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.stranded.map((p) => p.id)).toEqual([high.id]);
    expect(g.model.count).toBe(2);
  });

  it('autorise de retirer un pilier d’un pont à deux piliers', () => {
    const g = newGame();
    const left = put(g, 'brick-1x1', 4, 0, 4);
    const right = put(g, 'brick-1x1', 7, 0, 4);
    const deck = put(g, 'plate-1x4', 4, 3, 4, 1);
    expect(deck.orient).toBe(1);
    expect(evaluateRemoval(g.model, left.id).ok).toBe(true);
    expect(g.remove(left.id).ok).toBe(true);
    // Il ne reste que le pilier de droite : on ne peut plus le retirer.
    expect(g.remove(right.id).ok).toBe(false);
    expect(supportsOf(g.model, deck).ids).toEqual([right.id]);
    expect(checkInvariants(g.model)).toEqual([]);
  });

  it('autorise de retirer une pièce qui ne porte rien', () => {
    const g = newGame();
    put(g, 'brick-2x2', 4, 0, 4);
    const top = put(g, 'brick-1x1', 4, 3, 4);
    expect(g.remove(top.id).ok).toBe(true);
  });

  it('une tuile ne porte rien : elle se retire toujours', () => {
    const g = newGame();
    put(g, 'brick-2x2', 4, 0, 4);
    const tile = put(g, 'tile-2x2', 4, 3, 4);
    expect(g.remove(tile.id).ok).toBe(true);
  });
});

describe('annuler / rétablir', () => {
  it('conserve l’identifiant et le rang de pose d’une pièce rétablie', () => {
    const g = newGame();
    const a = put(g, 'brick-2x2', 4, 0, 4);
    g.undo();
    expect(g.model.count).toBe(0);
    g.redo();
    expect(g.model.get(a.id)).toEqual(a);
  });

  it('annuler une suppression redonne la même pièce', () => {
    const g = newGame();
    const a = put(g, 'brick-2x2', 4, 0, 4);
    g.remove(a.id);
    g.undo();
    expect(g.model.get(a.id)).toEqual(a);
  });

  it('une nouvelle commande vide la pile de rétablissement', () => {
    const g = newGame();
    put(g, 'brick-2x2', 4, 0, 4);
    g.undo();
    expect(g.canRedo).toBe(true);
    put(g, 'brick-1x1', 0, 0, 0);
    expect(g.canRedo).toBe(false);
  });
});

describe('journal des poses', () => {
  it('compte les poses refusées et les annulations rapides comme ratées', () => {
    let t = 0;
    const g = new Game(16, 16, 'vert', () => t);
    put(g, 'brick-2x2', 0, 0, 0); // acceptée, conservée
    t = 1000;
    g.place({ typeId: 'brick-2x2', color: 'rouge', x: 0, y: 0, z: 0, orient: 0 }); // refusée (collision)
    t = 2000;
    put(g, 'brick-1x1', 8, 0, 8); // acceptée…
    t = 3000;
    g.undo(); // …annulée 1 s plus tard : ratée
    t = 4000;
    put(g, 'brick-1x1', 9, 0, 9); // acceptée, conservée
    const s = g.journal.stats();
    expect(s.attempts).toBe(4);
    expect(s.refused).toBe(1);
    expect(s.undoneQuickly).toBe(1);
    expect(s.missed).toBe(2);
    expect(s.missRate).toBe(0.5);
  });

  it('ne compte pas une annulation tardive', () => {
    let t = 0;
    const j = new Journal(() => t);
    j.record('place', 1);
    t = UNDO_GRACE_MS + 1;
    j.record('undo', 1);
    expect(j.stats().undoneQuickly).toBe(0);
  });

  it('l’annulation d’une suppression ne compte pas comme pose ratée', () => {
    let t = 0;
    const g = new Game(16, 16, 'vert', () => t);
    const a = put(g, 'brick-1x1', 1, 0, 1);
    t = 100;
    g.remove(a.id);
    t = 200;
    g.undo();
    expect(g.journal.stats().undoneQuickly).toBe(0);
  });
});
