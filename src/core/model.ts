// Modèle de la construction : source de vérité, indépendante de toute interface et de tout rendu.
// Grille discrète : X et Z en tenons, Y en unités de plaque (une brique = 3 unités).

import { BASE_COLORS, footprintSize, hasStudAt, normalizeOrient, requireType, type Orient, type PieceType } from './catalogue';

export interface Piece {
  /** Identifiant stable : conservé par annuler/rétablir. */
  readonly id: number;
  readonly typeId: string;
  readonly color: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly orient: Orient;
  /** Rang de pose d'origine : conservé par annuler/rétablir (sert à ordonner la notice). */
  readonly placedAt: number;
}

export interface Cell {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PieceSpec {
  readonly typeId: string;
  readonly color: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly orient: number;
}

export interface ModelState {
  readonly nextId: number;
  readonly nextClock: number;
  readonly pieces: readonly Piece[];
}

export interface Snapshot {
  readonly baseW: number;
  readonly baseL: number;
  readonly plates: readonly BasePlate[];
  readonly pieces: readonly Piece[];
}

/** Une plaque de la surface de pose : coin minimal, taille (en tenons) et couleur. */
export interface BasePlate {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly l: number;
  readonly color: string;
}

/** Côté le plus long de la surface entière, en tenons : la surface tient toujours dans ce carré (16 384 tenons au plus). */
export const MAX_EXTENT = 128;

export function platesOverlap(a: BasePlate, b: BasePlate): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.l && b.z < a.z + a.l;
}

const INT = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

/**
 * Valide une liste de plaques lue d'un fichier : tailles et couleurs connues, sans chevauchement, coin de l'ensemble en (0, 0),
 * dans le carré de 64 tenons. Renvoie null si quelque chose cloche.
 */
export function parsePlates(raw: unknown): BasePlate[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 16) return null;
  const plates: BasePlate[] = [];
  for (const q of raw) {
    const r = q as Record<string, unknown> | null;
    if (!r || !INT(r['x'], 0, MAX_EXTENT - 1) || !INT(r['z'], 0, MAX_EXTENT - 1) || !INT(r['w'], 1, MAX_EXTENT) || !INT(r['l'], 1, MAX_EXTENT)) return null;
    if (typeof r['color'] !== 'string' || !BASE_COLORS.some((c) => c.id === r['color'])) return null;
    const plate: BasePlate = { x: r['x'], z: r['z'], w: r['w'], l: r['l'], color: r['color'] };
    if (plate.x + plate.w > MAX_EXTENT || plate.z + plate.l > MAX_EXTENT || plates.some((p) => platesOverlap(p, plate))) return null;
    plates.push(plate);
  }
  if (Math.min(...plates.map((p) => p.x)) !== 0 || Math.min(...plates.map((p) => p.z)) !== 0) return null;
  return plates;
}


export function pieceType(piece: Piece): PieceType {
  return requireType(piece.typeId);
}

export function pieceExtent(piece: Piece): { fx: number; fz: number; h: number } {
  const type = pieceType(piece);
  const { fx, fz } = footprintSize(type, piece.orient);
  return { fx, fz, h: type.h };
}

/** La case (x, z), au-dessus de la pièce, porte-t-elle un tenon ? Seul un tenon porte la pièce posée dessus. */
export function studAt(piece: Piece, x: number, z: number): boolean {
  return hasStudAt(pieceType(piece), piece.orient, x - piece.x, z - piece.z);
}

/** Toutes les cases occupées par une pièce. */
export function* cellsOf(piece: Piece): Generator<Cell> {
  const { fx, fz, h } = pieceExtent(piece);
  for (let dy = 0; dy < h; dy++) {
    for (let dz = 0; dz < fz; dz++) {
      for (let dx = 0; dx < fx; dx++) {
        yield { x: piece.x + dx, y: piece.y + dy, z: piece.z + dz };
      }
    }
  }
}

export class Model {
  /** Hauteur maximale par défaut, en unités de plaque (90 = 30 briques empilées). */
  static readonly DEFAULT_MAX_LEVEL = 90;
  /** Plafond le plus haut qu'on puisse atteindre en le relevant (100 briques), et le pas d'un relèvement (10 briques). */
  static readonly MAX_LEVEL_LIMIT = 300;
  static readonly CEILING_STEP = 30;

  /** Hauteur maximale de cette construction (en unités de plaque) : un paramètre du projet, qu'on peut relever. */
  maxLevel: number;

  private readonly pieces = new Map<number, Piece>();
  private readonly cells = new Map<number, number>();
  /** Plaques de la surface de pose, coin minimal de l'ensemble en (0, 0). */
  private platesList: BasePlate[];
  private extentW = 0;
  private extentL = 0;
  /** Taille minimale de la surface : celle demandée à la création (le rejeu d'une notice part d'une plaque, la taille finale réservée). */
  private readonly minW: number;
  private readonly minL: number;
  private nextId = 1;
  private nextClock = 1;

  /** Sans `plates` : une seule plaque, de toute la taille (couleur sans importance pour les règles). */
  constructor(baseW: number, baseL: number, maxLevel: number = Model.DEFAULT_MAX_LEVEL, plates?: readonly BasePlate[]) {
    this.maxLevel = maxLevel;
    this.minW = baseW;
    this.minL = baseL;
    this.platesList = plates ? [...plates] : [{ x: 0, z: 0, w: baseW, l: baseL, color: 'vert' }];
    this.measure();
  }

  /** Largeur (X) et longueur (Z) de la surface entière : la boîte qui contient toutes les plaques. */
  get baseW(): number {
    return this.extentW;
  }

  get baseL(): number {
    return this.extentL;
  }

  get plates(): readonly BasePlate[] {
    return this.platesList;
  }

  private measure(): void {
    this.extentW = Math.max(this.minW, ...this.platesList.map((p) => p.x + p.w));
    this.extentL = Math.max(this.minL, ...this.platesList.map((p) => p.z + p.l));
  }

  /** La case (x, z) est-elle au-dessus d'une plaque ? Seules ces cases portent une pièce posée au sol. */
  onPlate(x: number, z: number): boolean {
    return this.platesList.some((p) => x >= p.x && x < p.x + p.w && z >= p.z && z < p.z + p.l);
  }

  /** Pas fixe : la clé d'une case ne change pas quand la surface s'agrandit. */
  private key(x: number, y: number, z: number): number {
    return (y * MAX_EXTENT + z) * MAX_EXTENT + x;
  }

  /** Ajoute une plaque (déjà placée, coordonnées positives, sans chevauchement : vérifié par `Game`). */
  addPlate(plate: BasePlate): void {
    this.platesList.push(plate);
    this.measure();
  }

  /** Retire la dernière plaque ajoutée (annulation). */
  popPlate(): BasePlate {
    if (this.platesList.length <= 1) throw new Error('La première plaque ne se retire pas');
    const plate = this.platesList.pop()!;
    this.measure();
    return plate;
  }

  /** Décale tout (plaques et pièces) de (dx, dz) : sert quand une plaque s'ajoute à gauche ou au fond. */
  translate(dx: number, dz: number): void {
    if (dx === 0 && dz === 0) return;
    const pieces = this.all();
    this.cells.clear();
    this.pieces.clear();
    this.platesList = this.platesList.map((p) => ({ ...p, x: p.x + dx, z: p.z + dz }));
    this.measure();
    for (const p of pieces) this.insert({ ...p, x: p.x + dx, z: p.z + dz });
  }

  get count(): number {
    return this.pieces.size;
  }

  get(id: number): Piece | undefined {
    return this.pieces.get(id);
  }

  /** Pièces triées par identifiant (ordre déterministe). */
  all(): Piece[] {
    return [...this.pieces.values()].sort((a, b) => a.id - b.id);
  }

  pieceAt(x: number, y: number, z: number): Piece | undefined {
    if (x < 0 || z < 0 || y < 0 || x >= this.baseW || z >= this.baseL || y >= this.maxLevel) return undefined;
    const id = this.cells.get(this.key(x, y, z));
    return id === undefined ? undefined : this.pieces.get(id);
  }

  /** Hauteur (en unités de plaque) du haut de la colonne (x, z) : 0 si elle est vide. */
  columnTop(x: number, z: number): number {
    for (let y = this.maxLevel - 1; y >= 0; y--) {
      const p = this.pieceAt(x, y, z);
      if (p) return y + 1;
    }
    return 0;
  }

  /** Crée une nouvelle pièce (identifiant et rang de pose neufs) sans l'insérer. */
  createPiece(spec: PieceSpec): Piece {
    const type = requireType(spec.typeId);
    return {
      id: this.nextId++,
      typeId: spec.typeId,
      color: spec.color,
      x: spec.x,
      y: spec.y,
      z: spec.z,
      orient: normalizeOrient(type, spec.orient),
      placedAt: this.nextClock++,
    };
  }

  /** Réserve un nouveau rang de pose (une pièce déplacée est reposée : elle prend le rang suivant). */
  reserveRank(): number {
    return this.nextClock++;
  }

  /** Insertion brute : les règles de pose sont vérifiées par `rules.ts`, pas ici. */
  insert(piece: Piece): void {
    if (this.pieces.has(piece.id)) throw new Error(`Pièce ${piece.id} déjà présente`);
    const keys: number[] = [];
    for (const c of cellsOf(piece)) {
      if (c.x < 0 || c.z < 0 || c.y < 0 || c.x >= this.baseW || c.z >= this.baseL || c.y >= this.maxLevel) {
        throw new Error(`Pièce ${piece.id} hors limites`);
      }
      const k = this.key(c.x, c.y, c.z);
      if (this.cells.has(k)) throw new Error(`Collision à l'insertion de la pièce ${piece.id}`);
      keys.push(k);
    }
    this.pieces.set(piece.id, piece);
    for (const k of keys) this.cells.set(k, piece.id);
  }

  remove(id: number): Piece {
    const piece = this.pieces.get(id);
    if (!piece) throw new Error(`Pièce ${id} absente`);
    for (const c of cellsOf(piece)) this.cells.delete(this.key(c.x, c.y, c.z));
    this.pieces.delete(id);
    return piece;
  }

  /** État complet à sauvegarder : les pièces (identifiants et rangs de pose compris) et les compteurs. */
  exportState(): ModelState {
    return { nextId: this.nextId, nextClock: this.nextClock, pieces: this.all() };
  }

  /** Reconstruit un modèle depuis un état sauvegardé. Lève une erreur si les pièces se chevauchent ou sortent de la plaque. */
  static fromState(baseW: number, baseL: number, maxLevel: number, state: ModelState, plates?: readonly BasePlate[]): Model {
    const model = new Model(baseW, baseL, maxLevel, plates);
    for (const p of [...state.pieces].sort((a, b) => a.id - b.id)) model.insert(p);
    const maxId = state.pieces.reduce((n, p) => Math.max(n, p.id), 0);
    const maxClock = state.pieces.reduce((n, p) => Math.max(n, p.placedAt), 0);
    model.nextId = Math.max(state.nextId, maxId + 1);
    model.nextClock = Math.max(state.nextClock, maxClock + 1);
    return model;
  }

  /** Représentation normalisée et comparable (tests, sauvegarde). N'inclut pas les compteurs internes. */
  snapshot(): Snapshot {
    return { baseW: this.baseW, baseL: this.baseL, plates: [...this.platesList], pieces: this.all() };
  }

  /** Reconstruit l'occupation depuis les pièces, pour contrôler la cohérence (tests). */
  occupancyMatchesPieces(): boolean {
    const rebuilt = new Map<number, number>();
    for (const p of this.pieces.values()) {
      for (const c of cellsOf(p)) {
        const k = this.key(c.x, c.y, c.z);
        if (rebuilt.has(k)) return false;
        rebuilt.set(k, p.id);
      }
    }
    if (rebuilt.size !== this.cells.size) return false;
    for (const [k, id] of rebuilt) if (this.cells.get(k) !== id) return false;
    return true;
  }
}
