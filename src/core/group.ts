// Ensembles de pièces déplacées d'un bloc. Fonctions pures sur le modèle, sans rendu ni interface.
//
// Deux façons de prendre un ensemble : une pièce avec tout ce qui est posé dessus (et ce qui est posé sur celles-là…),
// ou tout ce qui est attaché à la pièce, dessus comme dessous. Un ensemble se tourne par quarts de tour et se pose comme
// une seule pièce : sans collision, dans la plaque, et avec au moins une case posée sur la plaque ou sur un tenon d'une
// pièce qui n'en fait pas partie (les pièces de l'ensemble restent clipsées entre elles).

import { footprintSize, normalizeOrient, requireType } from './catalogue';
import { pieceExtent, pieceType, studAt, type Cell, type Model, type Piece } from './model';
import { dependentsOf, stackTop, supportsOf, type PlacementReason } from './rules';

/** La pièce et tout ce qui repose dessus, de proche en proche. Identifiants triés, la pièce touchée comprise. */
export function groupAbove(model: Model, id: number): number[] {
  const start = model.get(id);
  if (!start) return [];
  const seen = new Set<number>([id]);
  const queue: Piece[] = [start];
  while (queue.length > 0) {
    for (const q of dependentsOf(model, queue.shift()!)) {
      if (!seen.has(q.id)) {
        seen.add(q.id);
        queue.push(q);
      }
    }
  }
  return [...seen].sort((a, b) => a - b);
}

/** Tout ce qui est attaché à la pièce, dessus comme dessous (la plaque de base ne compte pas). Identifiants triés. */
export function groupConnected(model: Model, id: number): number[] {
  const start = model.get(id);
  if (!start) return [];
  const seen = new Set<number>([id]);
  const queue: Piece[] = [start];
  while (queue.length > 0) {
    const p = queue.shift()!;
    const neighbours = [...dependentsOf(model, p), ...supportsOf(model, p).ids.map((sid) => model.get(sid)!)];
    for (const q of neighbours) {
      if (!seen.has(q.id)) {
        seen.add(q.id);
        queue.push(q);
      }
    }
  }
  return [...seen].sort((a, b) => a - b);
}

/** Boîte de l'ensemble : coin minimal et emprise au sol (en tenons). */
export interface GroupBounds {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly fx: number;
  readonly fz: number;
}

export function groupBounds(pieces: readonly Piece[]): GroupBounds {
  let x0 = Infinity;
  let y0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const p of pieces) {
    const { fx, fz } = pieceExtent(p);
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    z0 = Math.min(z0, p.z);
    x1 = Math.max(x1, p.x + fx);
    z1 = Math.max(z1, p.z + fz);
  }
  return { x: x0, y: y0, z: z0, fx: x1 - x0, fz: z1 - z0 };
}

/**
 * L'ensemble tourné de `turns` quarts de tour (même sens que l'orientation des pièces : +Z vers -X), puis placé avec le coin
 * minimal de sa boîte en (x, y, z). Les pièces gardent leur identifiant, leur couleur et leur rang de pose.
 */
export function transformGroup(pieces: readonly Piece[], turns: number, x: number, y: number, z: number): Piece[] {
  const k = ((Math.trunc(turns) % 4) + 4) % 4;
  // Un quart de tour envoie le point (px, pz) en (-pz, px) ; on tourne les rectangles d'emprise, puis on recale le tout.
  const turned = pieces.map((p) => {
    const type = pieceType(p);
    let x0 = p.x;
    let z0 = p.z;
    let { fx, fz } = pieceExtent(p);
    for (let i = 0; i < k; i++) {
      [x0, z0] = [-(z0 + fz), x0];
      [fx, fz] = [fz, fx];
    }
    return { ...p, x: x0, z: z0, orient: normalizeOrient(type, p.orient + k) };
  });
  const b = groupBounds(turned);
  return turned.map((p) => ({ ...p, x: p.x - b.x + x, y: p.y - b.y + y, z: p.z - b.z + z }));
}

/** Emprise au sol de l'ensemble après `turns` quarts de tour. */
export function groupFootprint(pieces: readonly Piece[], turns: number): { fx: number; fz: number } {
  const b = groupBounds(pieces);
  return turns % 2 === 0 ? { fx: b.fx, fz: b.fz } : { fx: b.fz, fz: b.fx };
}

/**
 * Niveau du bas de l'ensemble si on le lâche avec le coin de sa boîte en (x, z) : chaque pièce s'arrête au-dessus des colonnes
 * de son emprise, l'ensemble s'arrête dès que l'une d'elles touche. Le modèle ne doit pas contenir l'ensemble (soulevé).
 */
export function groupLanding(model: Model, pieces: readonly Piece[], turns: number, x: number, z: number): number {
  const placed = transformGroup(pieces, turns, x, 0, z);
  let level = 0;
  for (const p of placed) {
    const { fx, fz } = pieceExtent(p);
    level = Math.max(level, stackTop(model, fx, fz, p.x, p.z) - p.y);
  }
  return level;
}

export interface GroupPlacementResult {
  readonly ok: boolean;
  readonly reason?: PlacementReason;
  /** Cases du dessous de l'ensemble posées sur la plaque ou sur un tenon d'une autre pièce. */
  readonly supportedCells: readonly Cell[];
  readonly collidingCells: readonly Cell[];
}

/** Pose d'un ensemble déjà placé (voir `transformGroup`) dans un modèle qui ne le contient pas. */
export function evaluateGroupPlacement(model: Model, pieces: readonly Piece[]): GroupPlacementResult {
  const supportedCells: Cell[] = [];
  const collidingCells: Cell[] = [];
  let tileBelow = false;
  for (const p of pieces) {
    const type = requireType(p.typeId);
    const { fx, fz } = footprintSize(type, p.orient);
    if (p.x < 0 || p.z < 0 || p.y < 0 || p.x + fx > model.baseW || p.z + fz > model.baseL) {
      return { ok: false, reason: 'hors_plaque', supportedCells: [], collidingCells: [] };
    }
    if (p.y + type.h > model.maxLevel) return { ok: false, reason: 'trop_haut', supportedCells: [], collidingCells: [] };
  }
  for (const p of pieces) {
    const { fx, fz, h } = pieceExtent(p);
    for (let dz = 0; dz < fz; dz++) {
      for (let dx = 0; dx < fx; dx++) {
        const cx = p.x + dx;
        const cz = p.z + dz;
        for (let dy = 0; dy < h; dy++) {
          if (model.pieceAt(cx, p.y + dy, cz)) collidingCells.push({ x: cx, y: p.y + dy, z: cz });
        }
        if (p.y === 0) {
          if (model.onPlate(cx, cz)) supportedCells.push({ x: cx, y: 0, z: cz });
          continue;
        }
        const below = model.pieceAt(cx, p.y - 1, cz);
        if (below && below.y + pieceType(below).h === p.y) {
          if (studAt(below, cx, cz)) supportedCells.push({ x: cx, y: p.y, z: cz });
          else tileBelow = true;
        }
      }
    }
  }
  if (collidingCells.length > 0) return { ok: false, reason: 'collision', supportedCells, collidingCells };
  if (supportedCells.length === 0) return { ok: false, reason: tileBelow ? 'tuile' : 'sans_appui', supportedCells, collidingCells };
  return { ok: true, supportedCells, collidingCells };
}
