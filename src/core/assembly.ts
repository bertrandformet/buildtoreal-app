// Ordre de montage d'un modèle : une pièce vient après toutes celles qui se trouvent sous elle dans les mêmes colonnes
// (ses appuis, mais aussi ce qui est glissé sous un surplomb), et, à contrainte égale, selon l'ordre de pose réel du joueur.

import { pieceExtent, type Model, type Piece } from './model';

/** Pièces situées sous celle-ci, dans les colonnes de son emprise. */
export function piecesBelow(model: Model, piece: Piece): Piece[] {
  const { fx, fz } = pieceExtent(piece);
  const found = new Map<number, Piece>();
  for (let dz = 0; dz < fz; dz++) {
    for (let dx = 0; dx < fx; dx++) {
      let y = piece.y - 1;
      while (y >= 0) {
        const q = model.pieceAt(piece.x + dx, y, piece.z + dz);
        if (q) {
          found.set(q.id, q);
          y = q.y - 1;
        } else {
          y--;
        }
      }
    }
  }
  return [...found.values()];
}

/** Ordre de montage : tri topologique, départagé par l'ordre de pose réel. */
export function assemblyOrder(model: Model): Piece[] {
  const pieces = model.all();
  const waiting = new Map<number, number>();
  const unlocks = new Map<number, Piece[]>();
  for (const p of pieces) {
    const below = piecesBelow(model, p);
    waiting.set(p.id, below.length);
    for (const q of below) {
      const list = unlocks.get(q.id);
      if (list) list.push(p);
      else unlocks.set(q.id, [p]);
    }
  }
  const byRank = (a: Piece, b: Piece) => a.placedAt - b.placedAt || a.id - b.id;
  const ready = pieces.filter((p) => waiting.get(p.id) === 0).sort(byRank);
  const order: Piece[] = [];
  while (ready.length > 0) {
    const p = ready.shift()!;
    order.push(p);
    for (const next of unlocks.get(p.id) ?? []) {
      const left = (waiting.get(next.id) ?? 0) - 1;
      waiting.set(next.id, left);
      if (left === 0) {
        let i = 0;
        while (i < ready.length && byRank(ready[i]!, next) < 0) i++;
        ready.splice(i, 0, next);
      }
    }
  }
  if (order.length !== pieces.length) throw new Error('Ordre de montage impossible : dépendance circulaire');
  return order;
}

