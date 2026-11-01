// Modules (sous-assemblages) : des pièces que la notice fait construire à part, puis poser d'un seul bloc.
// Fonctions pures sur le modèle, sans rendu ni interface.
//
// Un module se construit seul : ses pièces, ramenées au sol (la plus basse à y = 0) sur une petite plaque qui les entoure d'un tenon
// de marge, doivent se poser une à une selon les règles du jeu, sans autre appui qu'elles-mêmes.

import { Model, pieceExtent, type Piece } from './model';
import { assemblyOrder } from './assembly';
import type { NoticePiece } from './notice';
import { evaluatePlacement } from './rules';

export interface ModuleDef {
  readonly id: number;
  readonly name: string;
  /** Identifiants des pièces du module. Seules celles qui existent encore comptent. */
  readonly pieceIds: readonly number[];
}

export const MIN_MODULE_PIECES = 2;
export const MAX_MODULE_NAME = 40;
/** Couleur de la petite plaque sur laquelle un module se construit, dans la notice. */
export const MODULE_PLATE_COLOR = 'gris';

export interface LocalModule {
  /** Pièces du module, dans leur repère propre (décalé pour partir du coin de la petite plaque), dans l'ordre de montage. */
  readonly pieces: readonly NoticePiece[];
  /** Les mêmes pièces dans le repère de la construction, dans le même ordre. */
  readonly placed: readonly NoticePiece[];
  readonly plate: { readonly w: number; readonly l: number };
}

const toNoticePiece = (p: Piece, dx = 0, dy = 0, dz = 0): NoticePiece => ({
  typeId: p.typeId,
  color: p.color,
  x: p.x + dx,
  y: p.y + dy,
  z: p.z + dz,
  orient: p.orient,
});

/**
 * Les pièces du module dans leur repère propre et dans l'ordre de montage, ou la raison pour laquelle il ne se construit pas seul.
 * Le modèle d'essai garde l'ordre de pose d'origine pour départager les pièces.
 */
export function localizeModule(model: Model, ids: readonly number[]): LocalModule | { readonly problem: string } {
  const pieces = ids.map((id) => model.get(id));
  if (pieces.some((p) => !p)) return { problem: 'absente' };
  const own = (pieces as Piece[]).slice().sort((a, b) => a.placedAt - b.placedAt || a.id - b.id);
  if (own.length < MIN_MODULE_PIECES) return { problem: 'trop_peu' };
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const p of own) {
    const { fx, fz } = pieceExtent(p);
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x + fx);
    maxZ = Math.max(maxZ, p.z + fz);
  }
  const dx = 1 - minX;
  const dy = -minY;
  const dz = 1 - minZ;
  const w = maxX - minX + 2;
  const l = maxZ - minZ + 2;
  const plate = { w, l };
  const sub = new Model(w, l, model.maxLevel, [{ x: 0, z: 0, w, l, color: MODULE_PLATE_COLOR }]);
  const byLocal = new Map<number, Piece>();
  for (const p of own) {
    const q = sub.createPiece(toNoticePiece(p, dx, dy, dz));
    sub.insert(q);
    byLocal.set(q.id, p);
  }
  const order = assemblyOrder(sub);
  // Rejeu : chaque pièce doit tenir, dans cet ordre, avec pour seuls appuis la plaque et les pièces déjà posées du module.
  const replay = new Model(w, l, model.maxLevel, [{ x: 0, z: 0, w, l, color: MODULE_PLATE_COLOR }]);
  const local: NoticePiece[] = [];
  const placed: NoticePiece[] = [];
  for (const q of order) {
    const spec = { typeId: q.typeId, color: q.color, x: q.x, y: q.y, z: q.z, orient: q.orient };
    const result = evaluatePlacement(replay, spec);
    if (!result.ok) return { problem: result.reason ?? 'sans_appui' };
    replay.insert(replay.createPiece(spec));
    local.push({ ...spec, orient: q.orient });
    placed.push(toNoticePiece(byLocal.get(q.id)!));
  }
  return { pieces: local, placed, plate };
}

/** Vrai si le module se construit seul (voir `localizeModule`). */
export function moduleProblem(model: Model, ids: readonly number[]): string | null {
  const local = localizeModule(model, ids);
  return 'problem' in local ? local.problem : null;
}
