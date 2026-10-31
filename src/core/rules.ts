// Règles de pose et de suppression. Fonctions pures sur le modèle, sans rendu ni interface.
//
// Pose valide : dans les limites de la surface, sans collision, et avec au moins une case du dessous
// posée sur un tenon ou, au sol, au-dessus d'une plaque (porte-à-faux autorisés, y compris au-dessus du vide entre deux plaques). Une tuile n'a pas de tenons, une pente n'en a que sur son rang du haut : rien ne s'appuie sur le reste.
// Suppression valide : refusée seulement si une autre pièce perdrait son dernier appui.

import { footprintSize, normalizeOrient, requireType, type Orient } from './catalogue';
import { pieceExtent, pieceType, studAt, type Cell, type Model, type Piece } from './model';

export type PlacementReason = 'hors_plaque' | 'trop_haut' | 'collision' | 'sans_appui' | 'tuile';

export interface PlacementQuery {
  readonly typeId: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly orient: number;
}

export interface PlacementResult {
  readonly ok: boolean;
  readonly reason?: PlacementReason;
  /** Cases de l'emprise (au niveau y) posées sur un tenon ou sur la plaque de base. */
  readonly supportedCells: readonly Cell[];
  /** Cases de l'emprise qui entrent en collision avec une pièce existante. */
  readonly collidingCells: readonly Cell[];
}

export function evaluatePlacement(model: Model, q: PlacementQuery): PlacementResult {
  const type = requireType(q.typeId);
  const orient: Orient = normalizeOrient(type, q.orient);
  const { fx, fz } = footprintSize(type, orient);
  const supportedCells: Cell[] = [];
  const collidingCells: Cell[] = [];

  if (q.x < 0 || q.z < 0 || q.y < 0 || q.x + fx > model.baseW || q.z + fz > model.baseL) {
    return { ok: false, reason: 'hors_plaque', supportedCells, collidingCells };
  }
  if (q.y + type.h > model.maxLevel) {
    return { ok: false, reason: 'trop_haut', supportedCells, collidingCells };
  }

  let tileBelow = false;
  for (let dz = 0; dz < fz; dz++) {
    for (let dx = 0; dx < fx; dx++) {
      const cx = q.x + dx;
      const cz = q.z + dz;
      for (let dy = 0; dy < type.h; dy++) {
        if (model.pieceAt(cx, q.y + dy, cz)) collidingCells.push({ x: cx, y: q.y + dy, z: cz });
      }
      if (q.y === 0) {
        if (model.onPlate(cx, cz)) supportedCells.push({ x: cx, y: q.y, z: cz });
        continue;
      }
      const below = model.pieceAt(cx, q.y - 1, cz);
      if (below && below.y + pieceType(below).h === q.y) {
        if (studAt(below, cx, cz)) supportedCells.push({ x: cx, y: q.y, z: cz });
        else tileBelow = true;
      }
    }
  }

  if (collidingCells.length > 0) return { ok: false, reason: 'collision', supportedCells, collidingCells };
  if (supportedCells.length === 0) {
    return { ok: false, reason: tileBelow ? 'tuile' : 'sans_appui', supportedCells, collidingCells };
  }
  return { ok: true, supportedCells, collidingCells };
}

/**
 * Niveau auquel une pièce « tombe » si on la lâche à cet endroit : au-dessus de la colonne la plus haute de son emprise.
 * Une pièce à roues, elle, roule au plus bas : le premier niveau où elle tient (sans collision, avec un appui), ce qui la fait
 * passer sous une construction quand il y a la place.
 */
export function landingLevel(model: Model, typeId: string, orient: number, x: number, z: number): number {
  const type = requireType(typeId);
  const { fx, fz } = footprintSize(type, normalizeOrient(type, orient));
  const top = stackTop(model, fx, fz, x, z);
  if (type.shape === 'wheels') {
    for (let y = 0; y < top; y++) if (evaluatePlacement(model, { typeId, x, y, z, orient }).ok) return y;
  }
  return top;
}

/** Sommet de la colonne la plus haute sous l'emprise (fx × fz) posée en (x, z). */
export function stackTop(model: Model, fx: number, fz: number, x: number, z: number): number {
  let top = 0;
  for (let dz = 0; dz < fz; dz++) {
    for (let dx = 0; dx < fx; dx++) {
      const cx = x + dx;
      const cz = z + dz;
      if (cx < 0 || cz < 0 || cx >= model.baseW || cz >= model.baseL) continue;
      top = Math.max(top, model.columnTop(cx, cz));
    }
  }
  return top;
}

export interface Supports {
  readonly onGround: boolean;
  readonly ids: readonly number[];
}

/** Pièces sur lesquelles repose une pièce (par leurs tenons). Au sol, elle tient si une de ses cases est au-dessus d'une plaque. */
export function supportsOf(model: Model, piece: Piece): Supports {
  const { fx, fz } = pieceExtent(piece);
  if (piece.y === 0) {
    for (let dz = 0; dz < fz; dz++) for (let dx = 0; dx < fx; dx++) if (model.onPlate(piece.x + dx, piece.z + dz)) return { onGround: true, ids: [] };
    return { onGround: false, ids: [] };
  }
  const ids = new Set<number>();
  for (let dz = 0; dz < fz; dz++) {
    for (let dx = 0; dx < fx; dx++) {
      const below = model.pieceAt(piece.x + dx, piece.y - 1, piece.z + dz);
      if (below && below.y + pieceType(below).h === piece.y && studAt(below, piece.x + dx, piece.z + dz)) ids.add(below.id);
    }
  }
  return { onGround: false, ids: [...ids].sort((a, b) => a - b) };
}

/** Pièces posées directement sur celle-ci (qui s'appuient au moins en partie sur ses tenons). */
export function dependentsOf(model: Model, piece: Piece): Piece[] {
  if (!pieceType(piece).studs) return [];
  const { fx, fz, h } = pieceExtent(piece);
  const above = piece.y + h;
  const found = new Map<number, Piece>();
  for (let dz = 0; dz < fz; dz++) {
    for (let dx = 0; dx < fx; dx++) {
      if (!studAt(piece, piece.x + dx, piece.z + dz)) continue;
      const q = model.pieceAt(piece.x + dx, above, piece.z + dz);
      if (q && q.y === above) found.set(q.id, q);
    }
  }
  return [...found.values()].sort((a, b) => a.id - b.id);
}

export interface RemovalResult {
  readonly ok: boolean;
  /** Pièces qui perdraient leur dernier appui si on retirait celle-ci. */
  readonly stranded: readonly Piece[];
}

export function evaluateRemoval(model: Model, id: number): RemovalResult {
  const piece = model.get(id);
  if (!piece) return { ok: false, stranded: [] };
  const stranded = dependentsOf(model, piece).filter((q) => {
    const s = supportsOf(model, q);
    return !s.onGround && s.ids.every((sid) => sid === id);
  });
  return { ok: stranded.length === 0, stranded };
}

/** Contrôle global de cohérence (tests) : pas de pièce sans appui, occupation cohérente. */
export function checkInvariants(model: Model): string[] {
  const errors: string[] = [];
  if (!model.occupancyMatchesPieces()) errors.push("L'occupation ne correspond pas aux pièces");
  for (const p of model.all()) {
    const s = supportsOf(model, p);
    if (!s.onGround && s.ids.length === 0) errors.push(`Pièce ${p.id} sans appui`);
  }
  return errors;
}
