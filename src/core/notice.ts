// Notice de montage, calculée à partir du modèle final (jamais de l'historique brut) et validée par rejeu.
//
// Ordre : une pièce vient après toutes celles qui se trouvent sous elle dans les mêmes colonnes (ses appuis,
// mais aussi ce qui est glissé sous un surplomb), et, à contrainte égale, selon l'ordre de pose réel du joueur.
// Étapes : tranches consécutives de cet ordre, plafonnées en nombre de pièces et en étalement.
// Plaques : la première est là dès le départ ; chacune des suivantes a sa propre étape, juste avant la première étape qui pose
// une pièce au sol dessus. Celles qui restent vides viennent à la fin.

import { BASE_COLORS, getType, isKnownColor, normalizeOrient, requireType, type Orient, type PieceKind } from './catalogue';
import { MAX_EXTENT, Model, parsePlates, pieceExtent, type BasePlate, type Piece } from './model';
import { assemblyOrder, piecesBelow } from './assembly';
import { localizeModule, MAX_MODULE_NAME, type LocalModule, type ModuleDef } from './modules';
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

/**
 * Module (sous-assemblage) : une étape « build » le construit à part (ses pièces sont dans le repère de sa petite plaque, `plate`, qui
 * est la seule surface) ; l'étape « place » le pose ensuite d'un seul bloc dans la construction (repère de la construction).
 */
export interface NoticeModuleRef {
  readonly id: number;
  readonly name: string;
  readonly role: 'build' | 'place';
  /** Seulement pour « build » : numéro de la partie et nombre de parties, et la petite plaque sur laquelle on construit. */
  readonly part?: number;
  readonly parts?: number;
  readonly plate?: { readonly w: number; readonly l: number };
}

/** Une étape pose des pièces, ou bien ajoute une plaque (`plate` : son rang dans `Notice.plates`, à partir de 1 ; pas de pièces). */
export interface NoticeStep {
  readonly pieces: readonly NoticePiece[];
  readonly plate?: number;
  readonly module?: NoticeModuleRef;
}

/** Une étape construit un module à part (ses pièces ne sont pas dans la construction à cette étape). */
export function isModuleBuild(step: NoticeStep): boolean {
  return step.module?.role === 'build';
}

/** Les pièces de la construction finie, selon la notice : tout sauf les étapes qui construisent un module à part. */
export function noticeFinalPieces(notice: Pick<Notice, 'steps'>): NoticePiece[] {
  return notice.steps.filter((s) => !isModuleBuild(s)).flatMap((s) => s.pieces);
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

export { assemblyOrder } from './assembly';

type OrderItem = { readonly piece: Piece } | { readonly module: ModuleDef; readonly local: LocalModule };

/** Les modules utilisables : au moins deux pièces existantes, aucune pièce partagée, et qui se construisent seuls. */
function usableModules(model: Model, modules: readonly ModuleDef[]): Array<{ def: ModuleDef; local: LocalModule }> {
  const taken = new Set<number>();
  const out: Array<{ def: ModuleDef; local: LocalModule }> = [];
  for (const m of modules) {
    const ids = m.pieceIds.filter((id) => model.get(id));
    if (ids.some((id) => taken.has(id))) continue;
    const local = localizeModule(model, ids);
    if ('problem' in local) continue;
    for (const id of ids) taken.add(id);
    out.push({ def: { ...m, pieceIds: ids }, local });
  }
  return out;
}

/**
 * Ordre de montage avec modules : chaque module est un seul bloc, posé quand toutes les pièces dont il dépend le sont, et avant celles qui
 * reposent sur lui. Renvoie null si un module rend l'ordre impossible (une pièce serait à la fois sous une pièce du module et au-dessus d'une autre).
 */
function orderItems(model: Model, modules: ReadonlyArray<{ def: ModuleDef; local: LocalModule }>): OrderItem[] | null {
  const pieces = model.all();
  const nodeOf = new Map<number, string>();
  const nodes = new Map<string, { item: OrderItem; rank: number; tie: number }>();
  for (const { def, local } of modules) {
    const key = `m${def.id}`;
    let rank = Infinity;
    for (const id of def.pieceIds) {
      nodeOf.set(id, key);
      rank = Math.min(rank, model.get(id)!.placedAt);
    }
    nodes.set(key, { item: { module: def, local }, rank, tie: Math.min(...def.pieceIds) });
  }
  for (const p of pieces) {
    if (nodeOf.has(p.id)) continue;
    nodeOf.set(p.id, `p${p.id}`);
    nodes.set(`p${p.id}`, { item: { piece: p }, rank: p.placedAt, tie: p.id });
  }
  const before = new Map<string, Set<string>>();
  const unlocks = new Map<string, Set<string>>();
  for (const key of nodes.keys()) before.set(key, new Set());
  for (const p of pieces) {
    const mine = nodeOf.get(p.id)!;
    for (const q of piecesBelow(model, p)) {
      const theirs = nodeOf.get(q.id)!;
      if (theirs === mine) continue;
      before.get(mine)!.add(theirs);
      if (!unlocks.has(theirs)) unlocks.set(theirs, new Set());
      unlocks.get(theirs)!.add(mine);
    }
  }
  const byRank = (a: string, b: string) => nodes.get(a)!.rank - nodes.get(b)!.rank || nodes.get(a)!.tie - nodes.get(b)!.tie;
  const ready = [...nodes.keys()].filter((k) => before.get(k)!.size === 0).sort(byRank);
  const order: OrderItem[] = [];
  while (ready.length > 0) {
    const key = ready.shift()!;
    order.push(nodes.get(key)!.item);
    for (const next of unlocks.get(key) ?? []) {
      const waiting = before.get(next)!;
      waiting.delete(key);
      if (waiting.size === 0) {
        let i = 0;
        while (i < ready.length && byRank(ready[i]!, next) < 0) i++;
        ready.splice(i, 0, next);
      }
    }
  }
  return order.length === nodes.size ? order : null;
}

/**
 * Notice du modèle. `modules` : les sous-assemblages à construire à part ; chacun donne des étapes encadrées « Construis d'abord ceci »,
 * puis une étape qui le pose d'un seul bloc. Un module qui ne se construit pas seul, ou qui rend l'ordre impossible, est ignoré
 * (ses pièces sont alors posées comme les autres).
 */
export function buildNotice(model: Model, baseColor: string, maxPerStep: number = DEFAULT_MAX_PER_STEP, modules: readonly ModuleDef[] = []): Notice {
  let items = modules.length > 0 ? orderItems(model, usableModules(model, modules)) : null;
  items ??= assemblyOrder(model).map((piece) => ({ piece }));
  const steps: NoticeStep[] = [];
  let current: NoticePiece[] = [];
  const flush = () => {
    if (current.length > 0) steps.push({ pieces: current });
    current = [];
  };
  for (const item of items) {
    if ('piece' in item) {
      const p = toNoticePiece(item.piece);
      const first = current[0];
      const spread = first ? Math.max(Math.abs(p.x - first.x), Math.abs(p.z - first.z)) : 0;
      if (current.length >= maxPerStep || spread > MAX_STEP_SPREAD) flush();
      current.push(p);
      continue;
    }
    flush();
    const { module: def, local } = item;
    // Parties du module : mêmes règles de découpage que la construction, dans son repère propre. Le nombre de parties est connu à la fin.
    const groups: NoticePiece[][] = [];
    let part: NoticePiece[] = [];
    for (const p of local.pieces) {
      const first = part[0];
      const spread = first ? Math.max(Math.abs(p.x - first.x), Math.abs(p.z - first.z)) : 0;
      if (part.length >= maxPerStep || spread > MAX_STEP_SPREAD) {
        groups.push(part);
        part = [];
      }
      part.push(p);
    }
    if (part.length > 0) groups.push(part);
    const name = def.name.slice(0, MAX_MODULE_NAME);
    groups.forEach((pieces, k) => steps.push({ pieces, module: { id: def.id, name, role: 'build', part: k + 1, parts: groups.length, plate: local.plate } }));
    steps.push({ pieces: local.placed, module: { id: def.id, name, role: 'place' } });
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
      if (!isModuleBuild(step) && step.pieces.some((p) => standsOn(p, plates[i]!))) {
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
  // Les modules se construisent chacun dans leur petit modèle, puis doivent se retrouver à l'identique dans la construction.
  const built = new Map<number, Model>();
  notice.steps.forEach((step, i) => {
    if (step.plate !== undefined) model.addPlate(plates[step.plate]!);
    const mod = step.module;
    if (mod?.role === 'build') {
      let sub = built.get(mod.id);
      if (!sub) {
        const w = mod.plate?.w ?? 1;
        const l = mod.plate?.l ?? 1;
        sub = new Model(w, l, notice.maxLevel, [{ x: 0, z: 0, w, l, color: 'gris' }]);
        built.set(mod.id, sub);
      }
      for (const p of step.pieces) {
        const result = evaluatePlacement(sub, p);
        if (!result.ok) {
          errors.push(`étape ${i + 1} : module « ${mod.name} », ${p.typeId} en (${p.x}, ${p.y}, ${p.z}) refusée (${result.reason})`);
          continue;
        }
        sub.insert(sub.createPiece(p));
      }
      return;
    }
    for (const p of step.pieces) {
      const result = evaluatePlacement(model, p);
      if (!result.ok) {
        errors.push(`étape ${i + 1} : ${p.typeId} en (${p.x}, ${p.y}, ${p.z}) refusée (${result.reason})`);
        continue;
      }
      model.insert(model.createPiece(p));
    }
    if (mod?.role === 'place') {
      const sub = built.get(mod.id);
      if (!sub || !sameShape(sub, step.pieces)) errors.push(`étape ${i + 1} : le module « ${mod.name} » posé n'est pas celui qui a été construit`);
    }
  });
  return { ok: errors.length === 0, errors, model };
}

/** Le module construit à part et les pièces posées ont-ils la même forme, au décalage près ? */
function sameShape(built: Model, placed: readonly NoticePiece[]): boolean {
  const mine = built.all();
  if (mine.length !== placed.length || placed.length === 0) return false;
  const key = (p: { typeId: string; color: string; x: number; y: number; z: number; orient: number }, dx: number, dy: number, dz: number) =>
    [p.y - dy, p.z - dz, p.x - dx, p.typeId, p.orient, p.color].join('|');
  const origin = (list: ReadonlyArray<{ x: number; y: number; z: number }>) => ({
    x: Math.min(...list.map((p) => p.x)),
    y: Math.min(...list.map((p) => p.y)),
    z: Math.min(...list.map((p) => p.z)),
  });
  const a = origin(mine);
  const b = origin(placed);
  const left = mine.map((p) => key(p, a.x, a.y, a.z)).sort();
  const right = placed.map((p) => key(p, b.x, b.y, b.z)).sort();
  return left.every((k, i) => k === right[i]);
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
  return noticeFinalPieces(notice).length;
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
    const modRaw = (s as { module?: unknown } | null)?.module;
    let module: NoticeModuleRef | undefined;
    if (modRaw !== undefined) {
      const m = modRaw as Record<string, unknown> | null;
      if (!m || !INT(m['id'], 1, 9999) || typeof m['name'] !== 'string' || m['name'].length < 1 || m['name'].length > MAX_MODULE_NAME) return bad('module invalide');
      if (m['role'] === 'build') {
        const plate = m['plate'] as Record<string, unknown> | undefined;
        if (!INT(m['part'], 1, 60) || !INT(m['parts'], 1, 60) || m['part'] > m['parts'] || !plate || !INT(plate['w'], 3, MAX_EXTENT) || !INT(plate['l'], 3, MAX_EXTENT)) return bad('module invalide');
        module = { id: m['id'], name: m['name'], role: 'build', part: m['part'], parts: m['parts'], plate: { w: plate['w'], l: plate['l'] } };
      } else if (m['role'] === 'place') {
        module = { id: m['id'], name: m['name'], role: 'place' };
      } else {
        return bad('module invalide');
      }
    }
    const piecesRaw = (s as { pieces?: unknown } | null)?.pieces;
    if (!Array.isArray(piecesRaw) || piecesRaw.length < 1 || piecesRaw.length > (module?.role === 'place' ? 400 : 100)) return bad('étape invalide');
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
    steps.push({ pieces, ...(module ? { module } : {}) });
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
