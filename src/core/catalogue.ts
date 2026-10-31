// Catalogue des pièces. Un type est défini par ses paramètres (profil, largeur, longueur),
// pas par une liste figée : le catalogue de la V1 n'est qu'un sous-ensemble de ce que le modèle sait exprimer.

/** Famille de pièces, telle qu'elle apparaît dans les onglets du tiroir. */
export type PieceKind = 'brick' | 'plate' | 'tile' | 'slope' | 'wheel' | 'opening';

/**
 * Forme : « box » = bloc rectangulaire (brique, plaque, tuile) ; « steep » = pente raide (1 rang en pente, environ 45°) ;
 * « gentle » = pente douce (2 rangs en pente, environ 30°) ; « corner » = pente d'angle (un seul tenon, le dessus descend vers deux côtés) ;
 * « wheels » = support à roues (voir `WheelSpec`) ; « round » = pièce ronde : cylindre debout d'un tenon de diamètre (colonne),
 * ou plaque ronde ; « switch » = interrupteur (tuile 1×2 à manette, voir `isSwitch`).
 */
export type Shape = 'box' | 'steep' | 'gentle' | 'corner' | 'wheels' | 'round' | 'switch' | 'door' | 'casement' | 'cardoor' | 'tailgate' | 'garage';

/**
 * Support à roues. Dans le sens de la longueur (`b` local), les roues occupent chacune un rang au bout du support :
 * une roue de chaque côté (`sides` = 2) ou une seule, au bout b = l - 1 (`sides` = 1). Les roues posent sur ce qui est dessous
 * et leur sommet arrive au ras du dessus du support : la pièce reste un bloc plein pour l'occupation, avec des tenons sur le support seulement.
 */
export interface WheelSpec {
  /** Longueur du support, en tenons (sa largeur est celle de la pièce). */
  readonly holderL: number;
  /** Hauteur du support, en unités de plaque (plaque = 1, brique = 3). */
  readonly holderH: number;
  /** Diamètre des roues, en unités de plaque ; c'est aussi la hauteur de la pièce. */
  readonly d: number;
  readonly sides: 1 | 2;
}

export interface PieceType {
  /** Identifiant stable, ex. « brick-2x4 ». Il suffit à reconstruire le type. */
  readonly id: string;
  readonly kind: PieceKind;
  /** Petit côté, en tenons (w <= l). */
  readonly w: number;
  /** Grand côté, en tenons. */
  readonly l: number;
  /** Hauteur en unités de plaque (plaque = 1, brique = 3). */
  readonly h: number;
  /** Forme du dessus. */
  readonly shape: Shape;
  /** A au moins un tenon sur le dessus (faux pour une tuile lisse). Voir `hasStudAt` pour savoir lesquelles de ses cases en portent. */
  readonly studs: boolean;
  /** Seulement pour un support à roues. */
  readonly wheel?: WheelSpec;
  /** Portière symétrique (charnière au bout b = l au lieu de b = 0) : les deux côtés d'une voiture s'ouvrent du même sens. */
  readonly mirror?: boolean;
}

/**
 * Orientation, en quarts de tour. 0 = petit côté selon X, 1 = petit côté selon Z (quart de tour de plus), 2 et 3 = les mêmes, retournées.
 * Une brique, une plaque ou une tuile n'a que 0 et 1 (le retournement ne change rien) ; une carrée n'a que 0.
 * Une pente a les quatre : elle descend vers +Z (0), -X (1), -Z (2) ou +X (3).
 */
export type Orient = 0 | 1 | 2 | 3;

export const KIND_HEIGHT: Record<PieceKind, number> = { brick: 3, plate: 1, tile: 1, slope: 3, wheel: 3, opening: 3 };

/** Couleur des pneus (et de la manette d'un interrupteur), quelle que soit la couleur choisie pour la pièce. */
export const TIRE_COLOR = 'noir';

/**
 * Interrupteur : une tuile 1×2 (lisse, rien ne tient dessus) surmontée d'une manette. Il se prend sous la finition « Lumineux »
 * du tiroir, pas dans l'onglet Tuiles. Il allume ou éteint les pièces lumineuses
 * de son ensemble (voir `lights.ts`). La manette dépasse d'une plaque : la pièce occupe deux plaques de haut. Quatre orientations :
 * la manette penche vers le bout b = l - 1 quand il est allumé, vers l'autre bout quand il est éteint (un demi-tour de la forme).
 */
export const SWITCH_ID = 'switch-1x2';

export function isSwitch(typeId: string): boolean {
  return typeId === SWITCH_ID;
}

/**
 * Ouvrants : un cadre 1×3, 1×4 ou 1×6 dont le milieu (l - 2 tenons) est vide, avec son battant articulé sur un montant (deux battants à partir de 4 tenons de vide). Un toucher l'ouvre ou le ferme
 * (voir `Game.toggleOpening`) ; ouvert, le battant ne gêne rien (l'état est visuel, la notice les montre fermés). Quatre orientations :
 * le battant s'ouvre vers le côté (a = 1) et sa charnière est au bout b = 1 ; un demi-tour change de côté et de charnière.
 * Hauteur (voir `openingBricks`) : celle du passage d'une porte ou de la vitre d'une fenêtre, sans le cadre.
 */
type OpeningShape = 'door' | 'casement' | 'cardoor' | 'tailgate' | 'garage';
const OPENINGS: Record<string, { shape: OpeningShape; w: number; l: number; h: number; mirror?: boolean }> = {};
/** Identifiants proposés dans le tiroir, dans l'ordre : portes puis fenêtres, par largeur puis par hauteur. */
export const OPENING_IDS: string[] = [];
/** La hauteur d'un ouvrant est celle du passage (porte sans montants) ou de la vitre, en briques : 5 à 7 pour une porte, 2 à 4 pour une fenêtre. */
for (const [shape, prefix, heights] of [['door', 'door', [5, 6, 7]], ['casement', 'casement', [2, 3, 4]]] as const) {
  for (const l of [3, 4, 6]) {
    for (const g of heights) {
      const id = `${prefix}-1x${l}-h${g}`;
      // Le cadre ajoute une brique : le linteau d'une porte, la traverse haute et l'appui d'une fenêtre.
      OPENINGS[id] = { shape, w: 1, l, h: 3 * g + 3 };
      OPENING_IDS.push(id);
    }
  }
}
/**
 * Voitures. Portière 1×4 : un seul battant plein (2 briques de haut) ou vitré (3), articulé à un bout, qui pivote vers l'extérieur ;
 * sa version « miroir » (suffixe -m) est articulée à l'autre bout, pour que les deux côtés d'une voiture s'ouvrent du même sens.
 * Hayon 1×2, 1×4 ou 1×6 (largeur de la voiture) : un panneau debout, plein (2 briques de haut) ou vitré (3), articulé par le haut, dont le bas se relève.
 */
for (const bricks of [2, 3]) {
  for (const mirror of [false, true]) {
    const id = `cardoor-1x4-h${bricks}${mirror ? '-m' : ''}`;
    OPENINGS[id] = { shape: 'cardoor', w: 1, l: 4, h: 3 * bricks, ...(mirror ? { mirror } : {}) };
    OPENING_IDS.push(id);
  }
}
for (const l of [2, 4, 6]) {
  for (const bricks of [2, 3]) {
    const id = `tailgate-1x${l}-h${bricks}`;
    OPENINGS[id] = { shape: 'tailgate', w: 1, l, h: 3 * bricks };
    OPENING_IDS.push(id);
  }
}

/**
 * Porte de garage : un panneau 1×6 ou 1×8, de six ou sept briques de haut (assez pour une voiture), qui s'enroule en haut de la baie
 * quand on l'ouvre : le passage est alors entièrement libre.
 */
for (const l of [6, 8]) {
  for (const bricks of [6, 7]) {
    const id = `garage-1x${l}-h${bricks}`;
    OPENINGS[id] = { shape: 'garage', w: 1, l, h: 3 * bricks };
    OPENING_IDS.push(id);
  }
}

// Identifiants des premières versions (fichiers déjà enregistrés) : toujours lisibles, plus proposés.
Object.assign(OPENINGS, {
  'door-1x3': { shape: 'door', l: 3, h: 15 },
  'door-1x4': { shape: 'door', l: 4, h: 18 },
  'door-1x6': { shape: 'door', l: 6, h: 18 },
  'casement-1x3': { shape: 'casement', l: 3, h: 9 },
  'casement-1x4': { shape: 'casement', l: 4, h: 9 },
  'casement-1x6': { shape: 'casement', l: 6, h: 9 },
});

/** Hauteur du passage (porte) ou de la vitre (fenêtre) ; pour une portière ou un hayon, hauteur de la pièce. En briques. */
export function openingBricks(type: PieceType): number {
  return type.shape === 'cardoor' || type.shape === 'tailgate' || type.shape === 'garage' ? type.h / 3 : (type.h - 3) / 3;
}

export function isOpening(typeId: string): boolean {
  return typeId in OPENINGS;
}

/**
 * Couleur de la seconde partie d'une pièce à deux matériaux : pneus et manette d'interrupteur noirs, poignée de porte noire,
 * vitre bleutée transparente d'une fenêtre. Null : une seule couleur.
 */
export function accentColor(typeId: string): string | null {
  const shape = getType(typeId)?.shape;
  if (shape === 'wheels' || shape === 'switch' || shape === 'door') return TIRE_COLOR;
  if (shape === 'cardoor' || shape === 'tailgate') return getType(typeId)!.h >= 9 ? 'ciel-verre' : null;
  return shape === 'casement' ? 'ciel-verre' : null;
}

/** Diamètres de roue, en unités de plaque : 5 plaques = 2 tenons pile, la largeur du support. */
const SMALL_WHEEL = 3;
const BIG_WHEEL = 5;

/** Supports à roues proposés. L'identifiant nomme le support ; l'emprise ajoute le rang de chaque roue. */
const WHEEL_SPECS: Readonly<Record<string, WheelSpec>> = {
  'wheels-2x4': { holderL: 4, holderH: 3, d: BIG_WHEEL, sides: 2 },
  'wheels-2x2': { holderL: 2, holderH: 1, d: SMALL_WHEEL, sides: 2 },
  'wheel-2x2': { holderL: 2, holderH: 1, d: SMALL_WHEEL, sides: 1 },
  'bigwheel-2x2': { holderL: 2, holderH: 1, d: BIG_WHEEL, sides: 1 },
};

/** Cylindres debout : de 1 à 4 briques de haut, rangés avec les briques. L'identifiant donne la hauteur, en briques. */
const COLUMN_HEIGHTS: Readonly<Record<string, number>> = { 'column-1': 1, 'column-2': 2, 'column-3': 3, 'column-4': 4 };

/** Plaques rondes : un disque de la hauteur d'une plaque, un tenon par case (1×1 : un tenon, 2×2 : quatre). */
const ROUND_PLATES: Readonly<Record<string, number>> = { 'roundplate-1x1': 1, 'roundplate-2x2': 2 };

/** Rangs (b local) occupés par le support d'une pièce à roues : de `from` inclus à `to` exclu. */
export function holderRows(type: PieceType): { from: number; to: number } {
  if (!type.wheel) return { from: 0, to: type.l };
  const from = type.wheel.sides === 2 ? 1 : 0;
  return { from, to: from + type.wheel.holderL };
}

/** Pièce qui ne change pas d'aspect en tournant : une seule orientation (0). */
function fullySymmetric(type: PieceType): boolean {
  return type.shape === 'round' || (type.shape === 'box' && type.w === type.l);
}

/** Pièce symétrique par un demi-tour : deux orientations seulement (0 et 1). */
function halfTurnSymmetric(type: PieceType): boolean {
  return type.shape === 'box' || (type.shape === 'wheels' && type.wheel?.sides === 2);
}

export function makeTypeId(kind: PieceKind, w: number, l: number): string {
  const a = Math.min(w, l);
  const b = Math.max(w, l);
  return `${kind}-${a}x${b}`;
}

/** Nombre de rangs (dans le sens de la longueur) occupés par la partie en pente. */
const SLOPE_ROWS: Record<Exclude<Shape, 'box' | 'corner' | 'wheels' | 'round' | 'switch' | 'door' | 'casement' | 'cardoor' | 'tailgate' | 'garage'>, number> = { steep: 1, gentle: 2 };

/** Nombre de rangs plats (avec tenons) d'une pente raide ou douce ; 0 pour les autres formes. */
export function flatRows(type: PieceType): number {
  return type.shape === 'steep' || type.shape === 'gentle' ? type.l - SLOPE_ROWS[type.shape] : 0;
}

const cache = new Map<string, PieceType>();

/** Construit (ou retrouve) un type à partir de son identifiant. Retourne undefined si l'identifiant est invalide. */
export function getType(id: string): PieceType | undefined {
  const known = cache.get(id);
  if (known) return known;
  const bricks = COLUMN_HEIGHTS[id];
  if (bricks) {
    const type: PieceType = { id, kind: 'brick', shape: 'round', w: 1, l: 1, h: bricks * KIND_HEIGHT.brick, studs: true };
    cache.set(id, type);
    return type;
  }
  if (id === SWITCH_ID) {
    const type: PieceType = { id, kind: 'tile', shape: 'switch', w: 1, l: 2, h: 2, studs: false };
    cache.set(id, type);
    return type;
  }
  const opening = OPENINGS[id];
  if (opening) {
    const type: PieceType = { id, kind: 'opening', shape: opening.shape, w: opening.w, l: opening.l, h: opening.h, studs: true, ...(opening.mirror ? { mirror: true } : {}) };
    cache.set(id, type);
    return type;
  }
  const disc = ROUND_PLATES[id];
  if (disc) {
    const type: PieceType = { id, kind: 'plate', shape: 'round', w: disc, l: disc, h: KIND_HEIGHT.plate, studs: true };
    cache.set(id, type);
    return type;
  }
  const wheel = WHEEL_SPECS[id];
  if (wheel) {
    const type: PieceType = { id, kind: 'wheel', shape: 'wheels', w: 2, l: wheel.holderL + wheel.sides, h: wheel.d, studs: true, wheel };
    cache.set(id, type);
    return type;
  }
  const m = /^(brick|plate|tile|slope|gentle|corner)-(\d+)x(\d+)$/.exec(id);
  if (!m) return undefined;
  const prefix = m[1]!;
  const w = Number(m[2]);
  const l = Number(m[3]);
  if (w < 1 || l < w || l > 16) return undefined;
  let kind: PieceKind;
  let shape: Shape = 'box';
  if (prefix === 'brick' || prefix === 'plate' || prefix === 'tile') {
    kind = prefix;
  } else {
    kind = 'slope';
    shape = prefix === 'slope' ? 'steep' : prefix === 'gentle' ? 'gentle' : 'corner';
    // Une pente raide a au moins un rang plat en plus du rang en pente, une pente douce en a deux de pente ; l'angle est un 2×2.
    if (shape === 'steep' && (w > 2 || l < 2 || l > 4)) return undefined;
    if (shape === 'gentle' && (w !== 2 || l < 3 || l > 4)) return undefined;
    if (shape === 'corner' && !(w === 2 && l === 2)) return undefined;
  }
  const type: PieceType = { id, kind, shape, w, l, h: KIND_HEIGHT[kind], studs: kind !== 'tile' };
  cache.set(id, type);
  return type;
}

export function requireType(id: string): PieceType {
  const t = getType(id);
  if (!t) throw new Error(`Type de pièce inconnu : ${id}`);
  return t;
}

/** Catalogue des pièces proposées dans le tiroir, dans l'ordre d'affichage. */
export const CATALOGUE: readonly string[] = [
  'brick-1x1',
  'brick-1x2',
  'brick-1x4',
  'brick-1x6',
  'brick-1x8',
  'brick-2x2',
  'brick-2x3',
  'brick-2x4',
  'brick-2x6',
  'brick-2x8',
  'column-1',
  'column-2',
  'column-3',
  'column-4',
  'plate-1x1',
  'plate-1x2',
  'plate-1x4',
  'plate-1x6',
  'plate-1x8',
  'plate-2x2',
  'plate-2x4',
  'plate-2x6',
  'plate-2x8',
  'plate-4x4',
  'plate-6x6',
  'plate-8x8',
  'roundplate-1x1',
  'roundplate-2x2',
  'wheels-2x4',
  'wheels-2x2',
  'wheel-2x2',
  'bigwheel-2x2',
  'tile-1x1',
  'tile-1x2',
  'tile-1x4',
  'tile-1x6',
  'tile-1x8',
  'tile-2x2',
  'tile-2x4',
  'tile-2x6',
  'tile-2x8',
  'switch-1x2',
  ...OPENING_IDS,
  'slope-1x2',
  'slope-2x2',
  'slope-2x3',
  'slope-2x4',
  'gentle-2x3',
  'gentle-2x4',
  'corner-2x2',
];

/** Les formes de pente, dans l'ordre où l'on veut les voir dans le tiroir. */
export function isSlope(type: PieceType): boolean {
  return type.shape !== 'box';
}

/** Pièces d'un onglet du tiroir. L'interrupteur n'est dans aucun : il se prend sous la finition « Lumineux ». */
export function typesOfKind(kind: PieceKind): PieceType[] {
  return CATALOGUE.map(requireType).filter((t) => t.kind === kind && !isSwitch(t.id));
}

/** Orientation valide pour ce type (voir `Orient`). */
export function normalizeOrient(type: PieceType, orient: number): Orient {
  const o = ((Math.trunc(orient) % 4) + 4) % 4;
  if (fullySymmetric(type)) return 0;
  if (halfTurnSymmetric(type)) return (o % 2) as Orient;
  return o as Orient;
}

/** Une pièce peut-elle pivoter ? Une pente ou des roues toujours ; un bloc seulement s'il n'est pas carré ; un cylindre jamais. */
export function canRotate(type: PieceType): boolean {
  return !fullySymmetric(type);
}

/** Orientation suivante quand on touche « Tourner » : quart de tour pour une pente, bascule pour un bloc. */
export function nextOrient(type: PieceType, orient: number): Orient {
  const o = normalizeOrient(type, orient);
  if (fullySymmetric(type)) return 0;
  if (halfTurnSymmetric(type)) return o === 0 ? 1 : 0;
  return ((o + 1) % 4) as Orient;
}

/**
 * Case de l'emprise (après orientation) qui correspond à la case locale (a, b) : `a` le long du petit côté, `b` le long de la longueur,
 * la pente descendant vers b croissant quand l'orientation est 0.
 */
export function cellOf(type: PieceType, orient: Orient, a: number, b: number): { dx: number; dz: number } {
  if (orient === 0) return { dx: a, dz: b };
  if (orient === 1) return { dx: type.l - 1 - b, dz: a };
  if (orient === 2) return { dx: type.w - 1 - a, dz: type.l - 1 - b };
  return { dx: b, dz: type.w - 1 - a };
}

const studCache = new Map<string, ReadonlySet<number>>();

/** Cases de l'emprise (indice dz × fx + dx) qui portent un tenon, selon la forme et l'orientation. */
function studSet(type: PieceType, orient: Orient): ReadonlySet<number> {
  const key = `${type.id}|${orient}`;
  const known = studCache.get(key);
  if (known) return known;
  const { fx } = footprintSize(type, orient);
  const set = new Set<number>();
  const add = (a: number, b: number) => {
    const c = cellOf(type, orient, a, b);
    set.add(c.dz * fx + c.dx);
  };
  if (type.shape === 'box' || type.shape === 'round' || type.kind === 'opening') {
    if (type.studs) for (let a = 0; a < type.w; a++) for (let b = 0; b < type.l; b++) add(a, b);
  } else if (type.shape === 'wheels') {
    const { from, to } = holderRows(type);
    for (let a = 0; a < type.w; a++) for (let b = from; b < to; b++) add(a, b);
  } else if (type.shape === 'corner') {
    add(0, 0);
  } else {
    const rows = flatRows(type);
    for (let a = 0; a < type.w; a++) for (let b = 0; b < rows; b++) add(a, b);
  }
  studCache.set(key, set);
  return set;
}

/** La case (dx, dz) de l'emprise porte-t-elle un tenon ? */
export function hasStudAt(type: PieceType, orient: Orient, dx: number, dz: number): boolean {
  const { fx } = footprintSize(type, orient);
  return studSet(type, orient).has(dz * fx + dx);
}

/** Cases de l'emprise qui portent un tenon. */
export function studCells(type: PieceType, orient: Orient): Array<{ dx: number; dz: number }> {
  const { fx } = footprintSize(type, orient);
  return [...studSet(type, orient)].map((i) => ({ dx: i % fx, dz: Math.floor(i / fx) }));
}

/** Emprise au sol (en tenons) selon l'orientation. */
export function footprintSize(type: PieceType, orient: Orient): { fx: number; fz: number } {
  return orient % 2 === 0 ? { fx: type.w, fz: type.l } : { fx: type.l, fz: type.w };
}

/**
 * Palette de 16 couleurs, opaques (variante « Vives »). Les identifiants sont ceux des fichiers enregistrés : ne pas les changer.
 * Les écarts entre teintes sont contrôlés par `palette.test.ts`, y compris pour trois types de daltonisme.
 */
export interface ColorDef {
  readonly id: string;
  readonly hex: string;
}

export const COLORS: readonly ColorDef[] = [
  { id: 'rouge', hex: '#c23a37' },
  { id: 'orange', hex: '#ef8a2b' },
  { id: 'jaune', hex: '#f3c332' },
  { id: 'vert', hex: '#3f9f55' },
  { id: 'bleu', hex: '#2f6fd1' },
  { id: 'blanc', hex: '#f1f0ea' },
  { id: 'gris', hex: '#8b9298' },
  { id: 'noir', hex: '#2b2c31' },
  { id: 'rose', hex: '#ec7fb0' },
  { id: 'violet', hex: '#6f2da8' },
  { id: 'turquoise', hex: '#1fb5ad' },
  { id: 'marine', hex: '#1d1d72' },
  { id: 'marron', hex: '#5e3a22' },
  { id: 'sable', hex: '#d9b98a' },
  { id: 'ciel', hex: '#6cc3f0' },
  { id: 'anthracite', hex: '#4b4f58' },
];

/**
 * Finitions : chaque couleur existe aussi en version transparente (« verre »), givrée (translucide et dépolie) et lumineuse,
 * notées par un suffixe de l'identifiant de couleur (ex. « ciel-verre », « rose-givre », « jaune-lumi »). C'est le même identifiant
 * partout (modèle, fichiers, notice) : rien d'autre à enregistrer.
 */
export type Finish = 'opaque' | 'clear' | 'frost' | 'glow';
export const FINISHES: readonly Finish[] = ['opaque', 'clear', 'frost', 'glow'];
const FINISH_SUFFIX: Readonly<Record<Exclude<Finish, 'opaque'>, string>> = { clear: '-verre', frost: '-givre', glow: '-lumi' };
export const CLEAR_SUFFIX = FINISH_SUFFIX.clear;
/** Opacité d'une pièce transparente à l'écran (0 = invisible, 1 = opaque). */
export const GLASS_OPACITY = 0.55;

export function finishOf(id: string): Finish {
  for (const [finish, suffix] of Object.entries(FINISH_SUFFIX)) if (id.endsWith(suffix)) return finish as Finish;
  return 'opaque';
}

/** Couleur de base, sans la finition (« ciel-verre » donne « ciel »). */
export function baseColorId(id: string): string {
  const finish = finishOf(id);
  return finish === 'opaque' ? id : id.slice(0, -FINISH_SUFFIX[finish].length);
}

/** La même couleur avec une autre finition. */
export function withFinish(id: string, finish: Finish): string {
  const base = baseColorId(id);
  return finish === 'opaque' ? base : base + FINISH_SUFFIX[finish];
}

export function isClear(id: string): boolean {
  return finishOf(id) === 'clear';
}

/** Transparente ou givrée : on voit (plus ou moins) à travers ; pas d'ombre portée, ne cache pas ce qui est derrière. */
export function isTranslucent(id: string): boolean {
  const f = finishOf(id);
  return f === 'clear' || f === 'frost';
}

export function isGlow(id: string): boolean {
  return finishOf(id) === 'glow';
}

export function clearColorId(id: string): string {
  return withFinish(id, 'clear');
}

/** Vrai pour une couleur de la palette, opaque ou transparente. */
export function isKnownColor(id: string): boolean {
  return COLORS.some((c) => c.id === baseColorId(id));
}

export function colorHex(id: string): string {
  const base = baseColorId(id);
  return COLORS.find((c) => c.id === base)?.hex ?? '#888888';
}

export const BASE_COLORS: readonly ColorDef[] = [
  { id: 'vert', hex: '#4c9a5f' },
  { id: 'gris', hex: '#9aa0a6' },
  { id: 'bleu', hex: '#5b86c7' },
  { id: 'sable', hex: '#d9c7a0' },
];

export const BASE_SIZES = [16, 24, 32] as const;
