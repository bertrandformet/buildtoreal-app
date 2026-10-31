// Projet sauvegardé : format versionné, validé champ par champ à l'import.
// Un fichier invalide ne produit jamais de modèle : l'appelant garde sa construction en cours.

import { BASE_COLORS, getType, isGlow, isKnownColor, isOpening, isSwitch, normalizeOrient, requireType } from './catalogue';
import { Game } from './game';
import { legacyLinks } from './lights';
import { MAX_EXTENT, Model, parsePlates, type BasePlate, type Piece } from './model';
import { checkInvariants } from './rules';

export const PROJECT_SCHEMA = 1;
export const MAX_PROJECT_PIECES = 5000;

export interface ProjectData {
  readonly schema: typeof PROJECT_SCHEMA;
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly base: { readonly w: number; readonly l: number; readonly color: string };
  readonly maxLevel: number;
  readonly nextId: number;
  readonly nextClock: number;
  readonly pieces: readonly Piece[];
  /**
   * Plaques de la surface (coin minimal de l'ensemble en 0, 0). Absent des fichiers d'avant la V2 : une seule plaque, `base`.
   * `base` reste la boîte de la surface entière et la couleur de la première plaque, pour les versions précédentes de l'appli.
   */
  readonly plates?: readonly BasePlate[];
  /** Interrupteurs éteints (identifiants de pièces). Absent des fichiers plus anciens : tout est allumé. */
  readonly switchesOff?: readonly number[];
  /** Portes et fenêtres ouvertes (identifiants de pièces). Absent : tout est fermé. */
  readonly opened?: readonly number[];
  /**
   * Pièces lumineuses commandées par chaque interrupteur : [interrupteur, pièces]. Absent des fichiers d'avant les liens
   * explicites : ils sont alors déduits de l'ensemble clipsé (`legacyLinks`).
   */
  readonly switchLinks?: ReadonlyArray<readonly [number, readonly number[]]>;
}

export interface ProjectMeta {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** Identifiant aléatoire de projet (lettres, chiffres, tirets). */
export function newProjectId(random: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 12; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(random() * 36)];
  return s;
}

export function defaultProjectName(now: number): string {
  const d = new Date(now);
  const two = (n: number) => String(n).padStart(2, '0');
  return `Construction du ${two(d.getDate())}/${two(d.getMonth() + 1)} à ${two(d.getHours())}h${two(d.getMinutes())}`;
}

export function projectFromGame(game: Game, meta: ProjectMeta): ProjectData {
  const state = game.exportState();
  return {
    schema: PROJECT_SCHEMA,
    id: meta.id,
    name: meta.name,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    base: { w: game.model.baseW, l: game.model.baseL, color: game.baseColor },
    maxLevel: game.model.maxLevel,
    nextId: state.nextId,
    nextClock: state.nextClock,
    pieces: state.pieces,
    plates: game.model.plates.map((p) => ({ ...p })),
    switchesOff: state.pieces.filter((p) => game.switchesOff.has(p.id)).map((p) => p.id),
    opened: state.pieces.filter((p) => game.openings.has(p.id)).map((p) => p.id),
    switchLinks: state.pieces
      .filter((p) => game.switchLinks.has(p.id))
      .map((p) => [p.id, [...game.switchLinks.get(p.id)!].filter((id) => game.model.get(id)).sort((a, b) => a - b)] as const)
      .filter(([, ids]) => ids.length > 0),
  };
}

/** Reconstruit une partie (sans historique) depuis un projet validé. */
export function gameFromProject(data: ProjectData, now?: () => number): Game {
  const model = Model.fromState(data.base.w, data.base.l, data.maxLevel, data, platesOf(data));
  const game = new Game(data.base.w, data.base.l, data.base.color, now, model);
  game.setSwitchesOff(data.switchesOff ?? []);
  game.setOpenings(data.opened ?? []);
  game.setLinks(data.switchLinks ?? legacyLinks(model));
  return game;
}

/** Les plaques d'un projet : celles enregistrées, ou la seule plaque `base` d'un fichier d'avant la V2. */
export function platesOf(data: Pick<ProjectData, 'base' | 'plates'>): BasePlate[] {
  return data.plates ? data.plates.map((p) => ({ ...p })) : [{ x: 0, z: 0, w: data.base.w, l: data.base.l, color: data.base.color }];
}

const INT = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

/** Retire les caractères de contrôle et borne la longueur d'un nom. */
export function cleanName(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

export type ProjectParse = { readonly ok: true; readonly data: ProjectData } | { readonly ok: false; readonly error: string };

/** Valide des données importées ou relues du stockage. Ne fait confiance à rien. */
export function parseProject(raw: unknown): ProjectParse {
  const bad = (error: string): ProjectParse => ({ ok: false, error });
  if (typeof raw !== 'object' || raw === null) return bad('données absentes');
  const r = raw as Record<string, unknown>;
  if (r['schema'] !== PROJECT_SCHEMA) return bad('version de format inconnue');
  if (typeof r['id'] !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(r['id'])) return bad('identifiant invalide');
  if (typeof r['name'] !== 'string') return bad('nom invalide');
  if (!INT(r['createdAt'], 0, 8.64e15) || !INT(r['updatedAt'], 0, 8.64e15)) return bad('dates invalides');
  const base = r['base'] as Record<string, unknown> | undefined;
  if (!base || !INT(base['w'], 1, MAX_EXTENT) || !INT(base['l'], 1, MAX_EXTENT)) return bad('plaque de base invalide');
  if (typeof base['color'] !== 'string' || !BASE_COLORS.some((c) => c.id === base['color'])) return bad('couleur de plaque invalide');
  if (!INT(r['maxLevel'], 3, 300)) return bad('hauteur maximale invalide');
  if (!INT(r['nextId'], 1, 1e9) || !INT(r['nextClock'], 1, 1e9)) return bad('compteurs invalides');
  const raws = r['pieces'];
  if (!Array.isArray(raws) || raws.length > MAX_PROJECT_PIECES) return bad('pièces invalides');

  const pieces: Piece[] = [];
  const ids = new Set<number>();
  for (const p of raws) {
    const q = p as Record<string, unknown> | null;
    if (!q || typeof q['typeId'] !== 'string' || !getType(q['typeId'])) return bad('type de pièce invalide');
    if (typeof q['color'] !== 'string' || !isKnownColor(q['color'])) return bad('couleur de pièce invalide');
    if (!INT(q['id'], 1, 1e9) || ids.has(q['id'])) return bad('identifiant de pièce invalide');
    if (!INT(q['placedAt'], 1, 1e9)) return bad('rang de pose invalide');
    if (!INT(q['x'], 0, MAX_EXTENT - 1) || !INT(q['y'], 0, 299) || !INT(q['z'], 0, MAX_EXTENT - 1)) return bad('position invalide');
    const type = requireType(q['typeId']);
    const orient = q['orient'];
    if (!INT(orient, 0, 3) || normalizeOrient(type, orient) !== orient) return bad('orientation invalide');
    ids.add(q['id']);
    pieces.push({ id: q['id'], typeId: q['typeId'], color: q['color'], x: q['x'], y: q['y'], z: q['z'], orient, placedAt: q['placedAt'] });
  }

  let plates: BasePlate[] | undefined;
  if (r['plates'] !== undefined) {
    const parsed = parsePlates(r['plates']);
    if (!parsed) return bad('plaques invalides');
    // La boîte `base` doit être celle des plaques : les versions précédentes de l'appli s'en servent.
    if (Math.max(...parsed.map((p) => p.x + p.w)) !== base['w'] || Math.max(...parsed.map((p) => p.z + p.l)) !== base['l']) return bad('plaques invalides');
    plates = parsed;
  }
  const off = r['switchesOff'];
  let switchesOff: number[] | undefined;
  if (off !== undefined) {
    const switches = new Set(pieces.filter((p) => isSwitch(p.typeId)).map((p) => p.id));
    if (!Array.isArray(off) || off.some((id) => !INT(id, 1, 1e9) || !switches.has(id as number))) return bad('interrupteurs invalides');
    switchesOff = [...new Set(off as number[])];
  }
  const rawOpened = r['opened'];
  let opened: number[] | undefined;
  if (rawOpened !== undefined) {
    const openings = new Set(pieces.filter((p) => isOpening(p.typeId)).map((p) => p.id));
    if (!Array.isArray(rawOpened) || rawOpened.some((id) => !openings.has(id as number))) return bad('ouvrants invalides');
    opened = [...new Set(rawOpened as number[])];
  }
  const rawLinks = r['switchLinks'];
  let switchLinks: Array<[number, number[]]> | undefined;
  if (rawLinks !== undefined) {
    const switches = new Set(pieces.filter((p) => isSwitch(p.typeId)).map((p) => p.id));
    const glows = new Set(pieces.filter((p) => isGlow(p.color)).map((p) => p.id));
    if (!Array.isArray(rawLinks)) return bad('liens invalides');
    switchLinks = [];
    for (const entry of rawLinks) {
      if (!Array.isArray(entry) || entry.length !== 2 || !switches.has(entry[0]) || !Array.isArray(entry[1]) || entry[1].some((id: unknown) => !glows.has(id as number))) return bad('liens invalides');
      switchLinks.push([entry[0] as number, [...new Set(entry[1] as number[])]]);
    }
  }

  const data: ProjectData = {
    schema: PROJECT_SCHEMA,
    id: r['id'],
    name: cleanName(r['name']) || 'Construction',
    createdAt: r['createdAt'],
    updatedAt: r['updatedAt'],
    base: { w: base['w'], l: base['l'], color: base['color'] },
    maxLevel: r['maxLevel'],
    nextId: r['nextId'],
    nextClock: r['nextClock'],
    pieces,
    ...(plates ? { plates } : {}),
    ...(switchesOff ? { switchesOff } : {}),
    ...(opened ? { opened } : {}),
    ...(switchLinks ? { switchLinks } : {}),
  };
  // Les pièces doivent former une construction valide : pas de collision, pas de sortie de plaque, pas de pièce sans appui.
  try {
    const model = Model.fromState(data.base.w, data.base.l, data.maxLevel, data, platesOf(data));
    const errors = checkInvariants(model);
    if (errors.length > 0) return bad(`construction incohérente (${errors[0]})`);
  } catch {
    return bad('pièces qui se chevauchent ou sortent de la plaque');
  }
  return { ok: true, data };
}

export function serializeProject(data: ProjectData): string {
  return JSON.stringify(data);
}

export function parseProjectJson(text: string): ProjectParse {
  try {
    return parseProject(JSON.parse(text));
  } catch {
    return { ok: false, error: 'JSON illisible' };
  }
}
