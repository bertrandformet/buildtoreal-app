// Notice de montage, calculée à partir du modèle final (jamais de l'historique brut) et validée par rejeu.
//
// Ordre : une pièce vient après toutes celles qui se trouvent sous elle dans les mêmes colonnes (ses appuis,
// mais aussi ce qui est glissé sous un surplomb), et, à contrainte égale, selon l'ordre de pose réel du joueur.
// Étapes : tranches consécutives de cet ordre, plafonnées en nombre de pièces et en étalement.
// Plaques : la première est là dès le départ ; chacune des suivantes a sa propre étape, juste avant la première étape qui pose
// une pièce au sol dessus. Celles qui restent vides viennent à la fin.

import { BASE_COLORS, getType, isKnownColor, normalizeOrient, requireType, type Orient, type PieceKind } from './catalogue';
import { MAX_EXTENT, Model, parsePlates, pieceExtent, type BasePlate, type Piece } from './model';
import { evaluatePlacement } from './rules';

export const NOTICE_SCHEMA = 1;
export const DEFAULT_MAX_PER_STEP = 6;
/** Écart maximal (en tenons) entre la première pièce d'une étape et les suivantes. */
export const MAX_STEP_SPREAD = 10;

export interface NoticePiece {
  readonly typeId: string;
  readonly color: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly orient: Orient;
}

/** Une étape pose des pièces, ou bien ajoute une plaque (`plate` : son rang dans `Notice.plates`, à partir de 1 ; pas de pièces). */
export interface NoticeStep {
  readonly pieces: readonly NoticePiece[];
  readonly plate?: number;
}

export interface Notice {
  readonly schema: typeof NOTICE_SCHEMA;
  readonly base: { readonly w: number; readonly l: number; readonly color: string };
  /** Plaques de la surface. Absent des notices d'avant la V2 : une seule plaque, `base`. */
  readonly plates?: readonly BasePlate[];
  readonly maxLevel: number;
  readonly steps: readonly NoticeStep[];
}

/** Les plaques d'une notice : celles enregistrées, ou la seule plaque `base`. */
export function noticePlates(notice: Pick<Notice, 'base' | 'plates'>): BasePlate[] {
  return notice.plates ? notice.plates.map((p) => ({ ...p })) : [{ x: 0, z: 0, w: notice.base.w, l: notice.base.l, color: notice.base.color }];
}

export interface PartLine {
  readonly typeId: string;
  readonly color: string;
  readonly count: number;
}

function toNoticePiece(p: Piece): NoticePiece {
  return { typeId: p.typeId, color: p.color, x: p.x, y: p.y, z: p.z, orient: p.orient };
}

/** Pièces situées sous celle-ci, dans les colonnes de son emprise. */
function piecesBelow(model: Model, piece: Piece): Piece[] {
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

export function buildNotice(model: Model, baseColor: string, maxPerStep: number = DEFAULT_MAX_PER_STEP): Notice {
  const order = assemblyOrder(model);
  const steps: NoticeStep[] = [];
  let current: Piece[] = [];
  const flush = () => {
    if (current.length > 0) steps.push({ pieces: current.map(toNoticePiece) });
    current = [];
  };
  for (const p of order) {
    const first = current[0];
    const spread = first ? Math.max(Math.abs(p.x - first.x), Math.abs(p.z - first.z)) : 0;
    if (current.length >= maxPerStep || spread > MAX_STEP_SPREAD) flush();
    current.push(p);
  }
  flush();
  const plates = model.plates.map((p) => ({ ...p }));
  const all = plates.length > 1 ? withPlateSteps(steps, plates) : steps;
  return { schema: NOTICE_SCHEMA, base: { w: model.baseW, l: model.baseL, color: baseColor }, ...(plates.length > 1 ? { plates } : {}), maxLevel: model.maxLevel, steps: all };
}

/** Une pièce posée au sol couvre-t-elle une case de cette plaque ? */
function standsOn(p: NoticePiece, plate: BasePlate): boolean {
  if (p.y !== 0) return false;
  const { fx, fz } = pieceExtent({ ...p, id: 0, placedAt: 0 });
  return p.x < plate.x + plate.w && p.x + fx > plate.x && p.z < plate.z + plate.l && p.z + fz > plate.z;
}

/** Insère une étape par plaque ajoutée (rang 1 et suivants) : juste avant sa première utilisation, ou à la fin. */
function withPlateSteps(steps: readonly NoticeStep[], plates: readonly BasePlate[]): NoticeStep[] {
  const pending = plates.map((_, i) => i).slice(1);
  const out: NoticeStep[] = [];
  for (const step of steps) {
    for (const i of [...pending]) {
      if (step.pieces.some((p) => standsOn(p, plates[i]!))) {
        out.push({ pieces: [], plate: i });
        pending.splice(pending.indexOf(i), 1);
      }
    }
    out.push(step);
  }
  for (const i of pending) out.push({ pieces: [], plate: i });
  return out;
}

export interface ReplayResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly model: Model;
}

/** Rejoue la notice dans un modèle vide : chaque pose doit être valide selon les règles du jeu. */
export function replayNotice(notice: Notice): ReplayResult {
  const plates = noticePlates(notice);
  // On part de la première plaque ; les autres arrivent à leur étape (la taille finale de la surface est réservée d'emblée).
  // Une notice sans étape de plaque (première version à plusieurs plaques) les pose toutes au départ.
  const staged = notice.steps.some((s) => s.plate !== undefined);
  const model = new Model(notice.base.w, notice.base.l, notice.maxLevel, staged ? plates.slice(0, 1) : plates);
  const errors: string[] = [];
  notice.steps.forEach((step, i) => {
    if (step.plate !== undefined) model.addPlate(plates[step.plate]!);
    for (const p of step.pieces) {
      const result = evaluatePlacement(model, p);
      if (!result.ok) {
        errors.push(`étape ${i + 1} : ${p.typeId} en (${p.x}, ${p.y}, ${p.z}) refusée (${result.reason})`);
        continue;
      }
      model.insert(model.createPiece(p));
    }
  });
  return { ok: errors.length === 0, errors, model };
}

/** Clé comparable d'une construction : mêmes pièces, mêmes positions, orientations et couleurs (identifiants ignorés). */
export function constructionKey(model: Model): string {
  const rows = model
    .all()
    .map((p) => [p.y, p.z, p.x, p.typeId, p.orient, p.color].join('|'))
    .sort();
  return `${model.baseW}x${model.baseL}#${rows.join(';')}`;
}

export function sameConstruction(a: Model, b: Model): boolean {
  return constructionKey(a) === constructionKey(b);
}

export function noticePieceCount(notice: Notice): number {
  return notice.steps.reduce((n, s) => n + s.pieces.length, 0);
}

/** Regroupe des pièces identiques (même type, même couleur) avec leur quantité. */
export function partsOf(pieces: readonly NoticePiece[]): PartLine[] {
  const counts = new Map<string, PartLine>();
  for (const p of pieces) {
    const key = `${p.typeId}|${p.color}`;
    const known = counts.get(key);
    counts.set(key, { typeId: p.typeId, color: p.color, count: (known?.count ?? 0) + 1 });
  }
  const kindRank: Record<PieceKind, number> = { brick: 0, plate: 1, tile: 2, slope: 3, wheel: 4, opening: 5 };
  return [...counts.values()].sort((a, b) => {
    const ta = requireType(a.typeId);
    const tb = requireType(b.typeId);
    return kindRank[ta.kind] - kindRank[tb.kind] || ta.w * ta.l - tb.w * tb.l || ta.l - tb.l || ta.h - tb.h || a.color.localeCompare(b.color);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Sérialisation : la notice exportée contient ses propres données, relisibles et validées.

export function serializeNotice(notice: Notice): string {
  return JSON.stringify(notice);
}

const INT = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

export type ParseResult = { readonly ok: true; readonly notice: Notice } | { readonly ok: false; readonly error: string };

/** Valide des données importées. Ne fait confiance à rien : tout champ est contrôlé. */
export function parseNotice(raw: unknown): ParseResult {
  const bad = (error: string): ParseResult => ({ ok: false, error });
  if (typeof raw !== 'object' || raw === null) return bad('données absentes');
  const r = raw as Record<string, unknown>;
  if (r['schema'] !== NOTICE_SCHEMA) return bad('version de format inconnue');
  const base = r['base'] as Record<string, unknown> | undefined;
  if (!base || !INT(base['w'], 1, MAX_EXTENT) || !INT(base['l'], 1, MAX_EXTENT)) return bad('plaque de base invalide');
  if (typeof base['color'] !== 'string' || !BASE_COLORS.some((c) => c.id === base['color'])) return bad('couleur de plaque invalide');
  if (!INT(r['maxLevel'], 3, 300)) return bad('hauteur maximale invalide');
  let plates: BasePlate[] | undefined;
  if (r['plates'] !== undefined) {
    const parsed = parsePlates(r['plates']);
    if (!parsed || Math.max(...parsed.map((p) => p.x + p.w)) !== base['w'] || Math.max(...parsed.map((p) => p.z + p.l)) !== base['l']) return bad('plaques invalides');
    plates = parsed;
  }
  const stepsRaw = r['steps'];
  if (!Array.isArray(stepsRaw) || stepsRaw.length < 1 || stepsRaw.length > 2000) return bad("nombre d'étapes invalide");
  let total = 0;
  const steps: NoticeStep[] = [];
  const plateSteps = new Set<number>();
  for (const s of stepsRaw) {
    const plateRaw = (s as { plate?: unknown } | null)?.plate;
    if (plateRaw !== undefined) {
      if (!plates || !INT(plateRaw, 1, plates.length - 1) || plateSteps.has(plateRaw)) return bad('étape de plaque invalide');
      if (((s as { pieces?: unknown }).pieces as unknown[] | undefined)?.length) return bad('étape de plaque invalide');
      plateSteps.add(plateRaw);
      steps.push({ pieces: [], plate: plateRaw });
      continue;
    }
    const piecesRaw = (s as { pieces?: unknown } | null)?.pieces;
    if (!Array.isArray(piecesRaw) || piecesRaw.length < 1 || piecesRaw.length > 100) return bad('étape invalide');
    const pieces: NoticePiece[] = [];
    for (const p of piecesRaw) {
      const q = p as Record<string, unknown> | null;
      if (!q || typeof q['typeId'] !== 'string' || !getType(q['typeId'])) return bad('type de pièce invalide');
      if (typeof q['color'] !== 'string' || !isKnownColor(q['color'])) return bad('couleur de pièce invalide');
      if (!INT(q['x'], 0, MAX_EXTENT - 1) || !INT(q['y'], 0, 299) || !INT(q['z'], 0, MAX_EXTENT - 1)) return bad('position invalide');
      const type = requireType(q['typeId']);
      if (!INT(q['orient'], 0, 3) || normalizeOrient(type, q['orient']) !== q['orient']) return bad('orientation invalide');
      pieces.push({ typeId: q['typeId'], color: q['color'], x: q['x'], y: q['y'], z: q['z'], orient: normalizeOrient(type, q['orient']) });
    }
    total += pieces.length;
    if (total > 5000) return bad('trop de pièces');
    steps.push({ pieces });
  }
  // Chaque plaque ajoutée a exactement une étape (ou aucune : notice de la première version à plusieurs plaques).
  if (plates && plateSteps.size !== 0 && plateSteps.size !== plates.length - 1) return bad('étape de plaque manquante');
  return { ok: true, notice: { schema: NOTICE_SCHEMA, base: { w: base['w'], l: base['l'], color: base['color'] }, ...(plates ? { plates } : {}), maxLevel: r['maxLevel'], steps } };
}

export function parseNoticeJson(text: string): ParseResult {
  try {
    return parseNotice(JSON.parse(text));
  } catch {
    return { ok: false, error: 'JSON illisible' };
  }
}
