// Façade du cœur : toute modification de la construction passe par ici, sous forme de commandes réversibles.
// La liste des commandes est extensible (fusionner… viendra plus tard).
// Une commande transporte la pièce complète, avec son identifiant et son rang de pose d'origine :
// annuler puis rétablir redonne donc exactement le même modèle.

import { Journal } from './journal';
import { isGlow, isOpening, isSwitch, normalizeOrient, requireType } from './catalogue';
import { MAX_EXTENT, Model, platesOverlap, type BasePlate, type ModelState, type Piece, type PieceSpec, type Snapshot } from './model';
import { evaluateGroupPlacement, transformGroup } from './group';
import { evaluatePlacement, evaluateRemoval, supportsOf, type PlacementReason } from './rules';

export type Command =
  | { readonly kind: 'place'; readonly piece: Piece }
  | { readonly kind: 'remove'; readonly piece: Piece }
  /** Déplacement : la même pièce (même identifiant) avant et après, sur un seul pas d'historique. */
  | { readonly kind: 'move'; readonly before: Piece; readonly after: Piece }
  /** Déplacement d'un ensemble : les mêmes pièces avant et après, sur un seul pas d'historique. */
  | { readonly kind: 'moveGroup'; readonly before: readonly Piece[]; readonly after: readonly Piece[] }
  /** Plaque ajoutée à la surface ; `dx`, `dz` : décalage de tout le reste quand elle s'ajoute à gauche ou au fond. */
  | { readonly kind: 'addPlate'; readonly plate: BasePlate; readonly dx: number; readonly dz: number };

/** Côté d'une plaque : -X (gauche), +X (droite), -Z (fond), +Z (devant), dans le repère de la surface. */
export type PlateSide = 'x-' | 'x+' | 'z-' | 'z+';

export type AddPlateOutcome =
  | { readonly ok: true; readonly plate: BasePlate; readonly dx: number; readonly dz: number }
  | { readonly ok: false; readonly reason: 'occupe' | 'trop_grand' };

/**
 * Où irait une plaque de `size` × `size` ajoutée du côté `side` de la plaque `from` : collée à ce côté, alignée sur son coin.
 * Coordonnées éventuellement négatives (avant décalage). Refus si elle chevauche une plaque, ou si la surface dépasserait
 * le carré de 64 tenons.
 */
export function plateBeside(
  plates: readonly BasePlate[],
  from: BasePlate,
  side: PlateSide,
  size: number,
  color: string,
): { readonly ok: true; readonly plate: BasePlate } | { readonly ok: false; readonly reason: 'occupe' | 'trop_grand' } {
  const x = side === 'x+' ? from.x + from.w : side === 'x-' ? from.x - size : from.x;
  const z = side === 'z+' ? from.z + from.l : side === 'z-' ? from.z - size : from.z;
  const plate: BasePlate = { x, z, w: size, l: size, color };
  if (plates.some((p) => platesOverlap(p, plate))) return { ok: false, reason: 'occupe' };
  const all = [...plates, plate];
  const w = Math.max(...all.map((p) => p.x + p.w)) - Math.min(...all.map((p) => p.x));
  const l = Math.max(...all.map((p) => p.z + p.l)) - Math.min(...all.map((p) => p.z));
  return w <= MAX_EXTENT && l <= MAX_EXTENT ? { ok: true, plate } : { ok: false, reason: 'trop_grand' };
}

/** Nouvel emplacement d'une pièce déplacée. */
export interface MoveTarget {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly orient: number;
}

/** Nouvel emplacement d'un ensemble déplacé : quarts de tour, puis coin minimal de sa boîte (voir `transformGroup`). */
export interface GroupTarget {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly turns: number;
}

export type GroupDropOutcome =
  | { readonly ok: true; readonly pieces: readonly Piece[]; readonly moved: boolean }
  | { readonly ok: false; readonly reason: PlacementReason };

export type LiftOutcome =
  | { readonly ok: true; readonly piece: Piece }
  | { readonly ok: false; readonly reason: 'absente' | 'dernier_appui'; readonly stranded: readonly Piece[] };

export type DropOutcome =
  | { readonly ok: true; readonly piece: Piece; readonly moved: boolean }
  | { readonly ok: false; readonly reason: PlacementReason };

export type PlaceOutcome =
  | { readonly ok: true; readonly piece: Piece }
  | { readonly ok: false; readonly reason: PlacementReason };

export type RemoveOutcome =
  | { readonly ok: true; readonly piece: Piece }
  | { readonly ok: false; readonly reason: 'absente' | 'dernier_appui'; readonly stranded: readonly Piece[] };

/** Une case « + » : la plaque `from`, le côté, et la plaque qu'on ajouterait (aperçu, coordonnées avant décalage). */
export interface PlateHint {
  readonly from: number;
  readonly side: PlateSide;
  readonly preview: BasePlate;
}

/** Distance au bord (en tenons) à partir de laquelle la case « + » apparaît. */
export const EDGE_MARGIN = 2;

/**
 * Cases « + » à proposer quand on construit dans le rectangle (x, z, fx, fz) : pour chaque bord de plaque à moins de
 * `EDGE_MARGIN` tenons, s'il n'y a pas déjà une plaque de ce côté et qu'une plaque y tient. L'aperçu a la taille de la plaque
 * d'origine si elle tient, sinon la plus grande taille qui tient.
 */
export function edgeHints(plates: readonly BasePlate[], x: number, z: number, fx: number, fz: number, sizes: readonly number[]): PlateHint[] {
  const hints: PlateHint[] = [];
  const sides: PlateSide[] = ['x-', 'x+', 'z-', 'z+'];
  plates.forEach((p, from) => {
    const overX = x < p.x + p.w && x + fx > p.x;
    const overZ = z < p.z + p.l && z + fz > p.z;
    if (!overX || !overZ) return;
    for (const side of sides) {
      const near =
        side === 'x-' ? x <= p.x + EDGE_MARGIN - 1 : side === 'x+' ? x + fx >= p.x + p.w - EDGE_MARGIN + 1 : side === 'z-' ? z <= p.z + EDGE_MARGIN - 1 : z + fz >= p.z + p.l - EDGE_MARGIN + 1;
      if (!near) continue;
      const tries = [p.w, ...[...sizes].sort((a, b) => b - a)].filter((n, i, all) => n <= p.w && all.indexOf(n) === i);
      for (const size of tries) {
        const out = plateBeside(plates, p, side, size, p.color);
        if (out.ok) {
          hints.push({ from, side, preview: out.plate });
          break;
        }
      }
    }
  });
  return hints;
}

export class Game {
  readonly model: Model;
  readonly journal: Journal;
  /** Couleur de la première plaque (celle du départ). */
  get baseColor(): string {
    return this.model.plates[0]!.color;
  }

  /**
   * Pièces soulevées en cours de déplacement : retirées du modèle, hors historique, jusqu'à ce qu'on les dépose ou qu'on annule.
   * Une seule pour `lift`, un ensemble pour `liftGroup` ; la première est la pièce touchée.
   */
  private liftedPieces: Piece[] = [];
  /** Interrupteurs éteints (identifiants). Un geste de jeu, pas de construction : hors historique. */
  private readonly off = new Set<number>();
  private readonly links = new Map<number, Set<number>>();
  private readonly opened = new Set<number>();
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private listeners = new Set<() => void>();

  constructor(baseW: number, baseL: number, baseColor: string, now: () => number = () => Date.now(), model?: Model) {
    this.model = model ?? new Model(baseW, baseL, Model.DEFAULT_MAX_LEVEL, [{ x: 0, z: 0, w: baseW, l: baseL, color: baseColor }]);
    this.journal = new Journal(now);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  /** La pièce soulevée (la pièce touchée, pour un ensemble), s'il y en a une. */
  get lifted(): Piece | null {
    return this.liftedPieces[0] ?? null;
  }

  /** Toutes les pièces soulevées : une seule, ou l'ensemble entier. */
  get liftedGroup(): readonly Piece[] {
    return this.liftedPieces;
  }

  /** État à enregistrer : les pièces soulevées y figurent, pour qu'un déplacement interrompu ne les perde jamais. */
  exportState(): ModelState {
    const state = this.model.exportState();
    if (this.liftedPieces.length === 0) return state;
    return { ...state, pieces: [...state.pieces, ...this.liftedPieces].sort((a, b) => a.id - b.id) };
  }

  /** Peut-on encore monter le plafond ? */
  get canRaiseCeiling(): boolean {
    return this.model.maxLevel < Model.MAX_LEVEL_LIMIT;
  }

  /**
   * Monte le plafond de 10 briques (jusqu'à 100). Un réglage de la construction, pas un geste : hors historique,
   * et jamais redescendu (des pièces peuvent déjà occuper la nouvelle hauteur). Renvoie le nouveau plafond, en briques.
   */
  raiseCeiling(): number {
    this.model.maxLevel = Math.min(Model.MAX_LEVEL_LIMIT, this.model.maxLevel + Model.CEILING_STEP);
    this.emit();
    return this.model.maxLevel / 3;
  }

  /** Interrupteurs éteints. */
  get switchesOff(): ReadonlySet<number> {
    return this.off;
  }

  /** Allume ou éteint un interrupteur posé. Renvoie le nouvel état (vrai = allumé), ou null si ce n'est pas un interrupteur. */
  toggleSwitch(id: number): boolean | null {
    const piece = this.model.get(id);
    if (!piece || !isSwitch(piece.typeId)) return null;
    if (this.off.has(id)) this.off.delete(id);
    else this.off.add(id);
    this.emit();
    return !this.off.has(id);
  }

  /** Portes et fenêtres ouvertes. */
  get openings(): ReadonlySet<number> {
    return this.opened;
  }

  /** Ouvre ou ferme une porte ou une fenêtre. Renvoie vrai si elle est ouverte après l'appel, null si ce n'en est pas une. */
  toggleOpening(id: number): boolean | null {
    const piece = this.model.get(id);
    if (!piece || !isOpening(piece.typeId)) return null;
    if (this.opened.has(id)) this.opened.delete(id);
    else this.opened.add(id);
    this.emit();
    return this.opened.has(id);
  }

  /** Remet l'état des ouvrants (relecture d'un projet). */
  setOpenings(ids: Iterable<number>): void {
    this.opened.clear();
    for (const id of ids) this.opened.add(id);
  }

  /** Pièces lumineuses commandées par chaque interrupteur. */
  get switchLinks(): ReadonlyMap<number, ReadonlySet<number>> {
    return this.links;
  }

  /** Relie une pièce lumineuse à un interrupteur, ou la détache si elle l'était. Renvoie vrai si elle est reliée après l'appel, null si le choix est invalide. */
  toggleLink(switchId: number, pieceId: number): boolean | null {
    const sw = this.model.get(switchId);
    const piece = this.model.get(pieceId);
    if (!sw || !isSwitch(sw.typeId) || !piece || !isGlow(piece.color)) return null;
    const set = this.links.get(switchId) ?? new Set<number>();
    const linked = !set.has(pieceId);
    if (linked) set.add(pieceId);
    else set.delete(pieceId);
    if (set.size > 0) this.links.set(switchId, set);
    else this.links.delete(switchId);
    this.emit();
    return linked;
  }

  /** Remplace tous les liens (relecture d'un projet). */
  setLinks(links: Iterable<readonly [number, Iterable<number>]>): void {
    this.links.clear();
    for (const [sid, ids] of links) {
      const set = new Set(ids);
      if (set.size > 0) this.links.set(sid, set);
    }
  }

  /** Interrupteurs posés (identifiants). */
  switches(): number[] {
    return this.model.all().filter((p) => isSwitch(p.typeId)).map((p) => p.id);
  }

  /** Au moins un interrupteur posé est-il allumé ? */
  get anySwitchOn(): boolean {
    return this.switches().some((id) => !this.off.has(id));
  }

  /** Allume (ou éteint) tous les interrupteurs d'un coup : même ceux qu'on ne peut pas toucher, cachés dans une construction. */
  setAllSwitches(on: boolean): void {
    this.off.clear();
    if (!on) for (const id of this.switches()) this.off.add(id);
    this.emit();
  }

  /** Remet l'état des interrupteurs (relecture d'un projet). */
  setSwitchesOff(ids: Iterable<number>): void {
    this.off.clear();
    for (const id of ids) this.off.add(id);
  }

  /**
   * Ajoute une plaque à côté de la plaque `from` (indice). Si elle va à gauche ou au fond, tout se décale pour que la surface
   * garde son coin en (0, 0). Un pas d'historique : ↶ la retire et remet tout en place.
   */
  addPlate(from: number, side: PlateSide, size: number, color: string): AddPlateOutcome {
    this.cancelLift();
    const src = this.model.plates[from];
    if (!src) return { ok: false, reason: 'occupe' };
    const beside = plateBeside(this.model.plates, src, side, size, color);
    if (!beside.ok) return beside;
    const placed = beside.plate;
    const dx = Math.max(0, -placed.x);
    const dz = Math.max(0, -placed.z);
    const plate = { ...placed, x: placed.x + dx, z: placed.z + dz };
    this.applyAddPlate(plate, dx, dz);
    this.undoStack.push({ kind: 'addPlate', plate, dx, dz });
    this.redoStack = [];
    this.emit();
    return { ok: true, plate, dx, dz };
  }

  private applyAddPlate(plate: BasePlate, dx: number, dz: number): void {
    this.model.translate(dx, dz);
    this.model.addPlate(plate);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get historyDepth(): number {
    return this.undoStack.length;
  }

  place(spec: PieceSpec): PlaceOutcome {
    this.cancelLift();
    const result = evaluatePlacement(this.model, spec);
    if (!result.ok) {
      const reason = result.reason ?? 'sans_appui';
      this.journal.record('refused', undefined, reason);
      return { ok: false, reason };
    }
    const piece = this.model.createPiece(spec);
    this.model.insert(piece);
    this.undoStack.push({ kind: 'place', piece });
    this.redoStack = [];
    this.journal.record('place', piece.id);
    this.emit();
    return { ok: true, piece };
  }

  remove(id: number): RemoveOutcome {
    this.cancelLift();
    const result = evaluateRemoval(this.model, id);
    if (!this.model.get(id)) return { ok: false, reason: 'absente', stranded: [] };
    if (!result.ok) {
      this.journal.record('remove_refused', id, 'dernier_appui');
      return { ok: false, reason: 'dernier_appui', stranded: result.stranded };
    }
    const piece = this.model.remove(id);
    this.undoStack.push({ kind: 'remove', piece });
    this.redoStack = [];
    this.journal.record('remove', id);
    this.emit();
    return { ok: true, piece };
  }

  /**
   * Soulève une pièce pour la déplacer. Même règle que pour un retrait : refusé si une autre pièce perdrait son dernier appui.
   * La pièce quitte le modèle (pour que l'aperçu de la nouvelle place ne la gêne pas) mais reste connue du jeu.
   */
  lift(id: number): LiftOutcome {
    this.cancelLift();
    const piece = this.model.get(id);
    if (!piece) return { ok: false, reason: 'absente', stranded: [] };
    const result = evaluateRemoval(this.model, id);
    if (!result.ok) {
      this.journal.record('move_refused', id, 'dernier_appui');
      return { ok: false, reason: 'dernier_appui', stranded: result.stranded };
    }
    this.model.remove(id);
    this.liftedPieces = [piece];
    this.emit();
    return { ok: true, piece };
  }

  /**
   * Soulève un ensemble (la pièce touchée en premier). Refusé si une pièce restante perdrait son dernier appui ;
   * avec `groupAbove` ou `groupConnected`, ça n'arrive jamais : tout ce qui repose sur l'ensemble en fait partie.
   */
  liftGroup(ids: readonly number[]): LiftOutcome {
    this.cancelLift();
    const pieces = ids.map((id) => this.model.get(id));
    if (pieces.length === 0 || pieces.some((p) => !p)) return { ok: false, reason: 'absente', stranded: [] };
    const group = pieces as Piece[];
    const inGroup = new Set(ids);
    // Une pièce restante ne doit pas perdre tous ses appuis : refusé si tous ceux qu'elle a font partie de l'ensemble.
    const stranded = new Map<number, Piece>();
    for (const q of this.model.all()) {
      if (inGroup.has(q.id)) continue;
      const s = supportsOf(this.model, q);
      if (!s.onGround && s.ids.length > 0 && s.ids.every((sid) => inGroup.has(sid))) stranded.set(q.id, q);
    }
    if (stranded.size > 0) {
      this.journal.record('move_refused', ids[0], 'dernier_appui');
      return { ok: false, reason: 'dernier_appui', stranded: [...stranded.values()] };
    }
    for (const p of group) this.model.remove(p.id);
    this.liftedPieces = group;
    this.emit();
    return { ok: true, piece: group[0]! };
  }

  /** Dépose l'ensemble soulevé : un seul pas d'historique. Un refus le laisse soulevé. */
  dropGroup(target: GroupTarget): GroupDropOutcome {
    const before = this.liftedPieces;
    if (before.length === 0) return { ok: false, reason: 'sans_appui' };
    const placed = transformGroup(before, target.turns, target.x, target.y, target.z);
    const result = evaluateGroupPlacement(this.model, placed);
    if (!result.ok) {
      const reason = result.reason ?? 'sans_appui';
      this.journal.record('move_refused', before[0]!.id, reason);
      return { ok: false, reason };
    }
    const unchanged = placed.every((p, i) => p.x === before[i]!.x && p.y === before[i]!.y && p.z === before[i]!.z && p.orient === before[i]!.orient);
    if (unchanged) {
      this.cancelLift();
      return { ok: true, pieces: before, moved: false };
    }
    // Nouveaux rangs de pose dans l'ordre d'origine : la notice garde l'ordre de montage de l'ensemble.
    const order = [...placed].sort((a, b) => a.placedAt - b.placedAt);
    const ranks = new Map(order.map((p) => [p.id, this.model.reserveRank()]));
    const after = placed.map((p) => ({ ...p, placedAt: ranks.get(p.id)! }));
    this.liftedPieces = [];
    for (const p of after) this.model.insert(p);
    this.undoStack.push({ kind: 'moveGroup', before, after });
    this.redoStack = [];
    this.journal.record('move', after[0]!.id);
    this.emit();
    return { ok: true, pieces: after, moved: true };
  }

  /** Dépose la pièce soulevée à son nouvel emplacement : un seul pas d'historique. Un refus la laisse soulevée. */
  drop(target: MoveTarget): DropOutcome {
    const before = this.liftedPieces.length === 1 ? this.liftedPieces[0]! : null;
    if (!before) return { ok: false, reason: 'sans_appui' };
    const orient = normalizeOrient(requireType(before.typeId), target.orient);
    const result = evaluatePlacement(this.model, { typeId: before.typeId, x: target.x, y: target.y, z: target.z, orient });
    if (!result.ok) {
      const reason = result.reason ?? 'sans_appui';
      this.journal.record('move_refused', before.id, reason);
      return { ok: false, reason };
    }
    if (before.x === target.x && before.y === target.y && before.z === target.z && before.orient === orient) {
      this.cancelLift();
      return { ok: true, piece: before, moved: false };
    }
    const after: Piece = { ...before, x: target.x, y: target.y, z: target.z, orient, placedAt: this.model.reserveRank() };
    this.liftedPieces = [];
    this.model.insert(after);
    this.undoStack.push({ kind: 'move', before, after });
    this.redoStack = [];
    this.journal.record('move', after.id);
    this.emit();
    return { ok: true, piece: after, moved: true };
  }

  /** Remet les pièces soulevées exactement où elles étaient, sans toucher à l'historique. */
  cancelLift(): void {
    const pieces = this.liftedPieces;
    if (pieces.length === 0) return;
    this.liftedPieces = [];
    for (const p of pieces) this.model.insert(p);
    this.emit();
  }

  undo(): boolean {
    this.cancelLift();
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    if (cmd.kind === 'place') this.model.remove(cmd.piece.id);
    else if (cmd.kind === 'remove') this.model.insert(cmd.piece);
    else if (cmd.kind === 'move') {
      this.model.remove(cmd.after.id);
      this.model.insert(cmd.before);
    } else if (cmd.kind === 'moveGroup') {
      for (const p of cmd.after) this.model.remove(p.id);
      for (const p of cmd.before) this.model.insert(p);
    } else {
      this.model.popPlate();
      this.model.translate(-cmd.dx, -cmd.dz);
    }
    this.redoStack.push(cmd);
    // Seule l'annulation d'une pose compte pour la mesure des « poses ratées ».
    this.journal.record('undo', cmd.kind === 'place' ? cmd.piece.id : undefined);
    this.emit();
    return true;
  }

  redo(): boolean {
    this.cancelLift();
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    if (cmd.kind === 'place') this.model.insert(cmd.piece);
    else if (cmd.kind === 'remove') this.model.remove(cmd.piece.id);
    else if (cmd.kind === 'move') {
      this.model.remove(cmd.before.id);
      this.model.insert(cmd.after);
    } else if (cmd.kind === 'moveGroup') {
      for (const p of cmd.before) this.model.remove(p.id);
      for (const p of cmd.after) this.model.insert(p);
    } else {
      this.applyAddPlate(cmd.plate, cmd.dx, cmd.dz);
    }
    this.undoStack.push(cmd);
    this.journal.record('redo');
    this.emit();
    return true;
  }

  snapshot(): Snapshot {
    return this.model.snapshot();
  }
}
