// Modèles d'exemple : petites constructions prêtes à ouvrir, écrites comme des listes de poses.
// Chaque pose passe par les règles du jeu (voir exampleModels.test.ts) : un modèle ne peut donc pas être invalide.
// Ils servent aussi de constructions de référence pour tester la notice, le déplacement et l'enregistrement.

import { Game, type PlateSide } from './game';
import { SWITCH_ID, footprintSize, normalizeOrient, requireType } from './catalogue';
import type { PieceSpec } from './model';

export interface ExampleModel {
  /** Identifiant stable ; les textes (nom, description) sont dans le fichier de traduction, sous `example.<id>`. */
  readonly id: 'house' | 'car' | 'truck' | 'castle' | 'manor' | 'bridge';
  readonly base: { readonly size: number; readonly color: string };
  /** Plaques ajoutées avant les poses, dans l'ordre : à côté de la plaque `from` (rang), du côté `side`, carrées de `size`. */
  readonly plates?: ReadonlyArray<{ readonly from: number; readonly side: PlateSide; readonly size: number; readonly color: string }>;
  /** Poses dans l'ordre : chaque pièce repose sur celles qui précèdent. */
  readonly pieces: readonly PieceSpec[];
  /** Rangs (dans `pieces`, à partir de 0) des portes, fenêtres, portières et hayons ouverts au départ. */
  readonly opened?: readonly number[];
  /** Circuits de lumière : [rang de l'interrupteur, rangs des pièces lumineuses qu'il commande] (voir `Game.toggleLink`). */
  readonly links?: ReadonlyArray<readonly [number, readonly number[]]>;
}

const piece = (typeId: string, color: string, x: number, y: number, z: number, orient = 0): PieceSpec => ({ typeId, color, x, y, z, orient });

/**
 * Maison de 14 × 10 tenons et six briques de haut : une porte au milieu de la façade, six fenêtres (deux devant, deux derrière,
 * une de chaque côté), un toit à deux pans en pentes douces, un faîte plat en plaques et une cheminée.
 * Les murs des côtés font toute la profondeur ; la façade et le fond se logent entre eux.
 */
function house(): PieceSpec[] {
  const out: PieceSpec[] = [];
  const rows = [0, 3, 6, 9, 12, 15];
  const tone = (row: number) => (row % 2 === 0 ? 'blanc' : 'sable');
  const WIN = 'casement-1x4-h2';
  // Murs de côté (x = 1 et x = 14, z de 3 à 12). Un rang plein : une 1×8 et une 1×2, en alternance d'un rang à l'autre.
  // La fenêtre (z de 5 à 8) occupe les rangs 1 à 3 : de part et d'autre, une 1×2 à gauche et une 1×4 à droite.
  for (const x of [1, 14]) {
    const turn = x === 1 ? 2 : 0; // le battant s'ouvre vers l'extérieur
    rows.forEach((y, row) => {
      if (row >= 1 && row <= 3) {
        out.push(piece('brick-1x2', tone(row), x, y, 3, 0), piece('brick-1x4', tone(row), x, y, 9, 0));
      } else if (row % 2 === 0) {
        out.push(piece('brick-1x8', tone(row), x, y, 3, 0), piece('brick-1x2', tone(row), x, y, 11, 0));
      } else {
        out.push(piece('brick-1x2', tone(row), x, y, 3, 0), piece('brick-1x8', tone(row), x, y, 5, 0));
      }
      if (row === 1) out.push(piece(WIN, 'blanc', x, y, 5, turn));
    });
  }
  // Façade (z = 12) : fenêtre, porte, fenêtre, chacun sur quatre tenons. La fenêtre a une brique sous elle et deux au-dessus.
  const windowColumn = (x: number, z: number, orient: number) => {
    out.push(piece('brick-1x4', 'sable', x, 0, z, 1), piece(WIN, 'blanc', x, 3, z, orient));
    out.push(piece('brick-1x4', 'blanc', x, 12, z, 1), piece('brick-1x4', 'sable', x, 15, z, 1));
  };
  windowColumn(2, 12, 1);
  out.push(piece('door-1x4-h5', 'marron', 6, 0, 12, 1));
  windowColumn(10, 12, 1);
  // Fond (z = 3) : fenêtre, mur plein, fenêtre.
  windowColumn(2, 3, 3);
  rows.forEach((y, row) => out.push(piece('brick-1x4', tone(row + 1), 6, y, 3, 1)));
  windowColumn(10, 3, 3);
  // Toit : sept pentes douces 2×4 de chaque côté. Celles du fond descendent vers l'arrière (orientation 2), celles de devant vers l'avant (0) ;
  // leurs rangs plats (z de 5 à 6 et de 9 à 10) portent des plaques 2×6 qui forment le faîte.
  // Les pignons : une brique 2×2 sur chaque mur de côté ferme le vide (z de 7 à 8) qui court sous les plaques du faîte.
  out.push(piece('brick-2x2', 'rouge', 1, 18, 7), piece('brick-2x2', 'rouge', 13, 18, 7));
  for (const x of [1, 3, 5, 7, 9, 11, 13]) {
    out.push(piece('gentle-2x4', 'rouge', x, 18, 3, 2), piece('gentle-2x4', 'rouge', x, 18, 9, 0));
    out.push(piece('plate-2x6', 'rouge', x, 21, 5, 0));
  }
  out.push(piece('brick-2x2', 'gris', 9, 22, 6), piece('brick-2x2', 'gris', 9, 25, 6));
  // Cloisons à l'intérieur, visibles par la porte et les fenêtres ouvertes : un mur dans le sens de la profondeur (x = 8, z de 4 à 9) et un
  // mur dans le sens de la largeur (z = 8, x de 2 à 7) percé d'une porte intérieure. Elles forment une pièce au fond à gauche et une pièce
  // au fond à droite ; le devant reste ouvert. Briques bleu ciel et blanches en alternance.
  rows.forEach((y, row) => {
    const inner = row % 2 === 0 ? 'ciel' : 'blanc';
    out.push(piece('brick-1x6', inner, 8, y, 4, 0), piece('brick-1x2', inner, 6, y, 8, 1));
  });
  out.push(piece('door-1x4-h5', 'marron', 2, 0, 8, 1));
  // Devant la porte : un paillasson sombre, puis des fleurs dans l'herbe (une tige verte et une corolle ronde).
  out.push(piece('tile-2x4', 'anthracite', 6, 0, 13, 1));
  const flowers: ReadonlyArray<readonly [number, number, string]> = [
    [2, 13, 'rose'], [4, 14, 'jaune'], [3, 15, 'rouge'], [11, 13, 'orange'], [13, 14, 'violet'], [12, 15, 'blanc'], [14, 13, 'rose'],
    [0, 4, 'jaune'], [0, 9, 'rouge'], [0, 12, 'violet'], [15, 4, 'orange'], [15, 9, 'rose'], [15, 12, 'jaune'], [7, 1, 'rouge'], [10, 1, 'blanc'],
  ];
  for (const [x, z, color] of flowers) out.push(piece('plate-1x1', 'vert', x, 0, z), piece('roundplate-1x1', color, x, 1, z));
  return out;
}

/**
 * Voiture large à quatre portes et hayon, longue de 14 tenons et large de 6 : deux essieux 2×4 (roues aux deux bouts), un châssis de
 * 6 de large, un capot, un pare-brise en briques transparentes, quatre portières vitrées, un toit en plaques, un hayon vitré et quatre
 * sièges. Les phares (face avant du capot) et les feux arrière (colonnes orange de chaque côté du hayon) sont des pièces lumineuses insérées dans la carrosserie. Un interrupteur sur le tableau de bord, à l'intérieur, les allume et les éteint tous. Elle roule vers -x : le capot est à gauche, le hayon à droite.
 * Les quatre portes sont articulées à l'avant et s'ouvrent dans le même sens, des deux côtés (voir les portières « miroir »).
 */
function carPieces(color: string): PieceSpec[] {
  const out: PieceSpec[] = [];
  out.push(piece('wheels-2x4', 'anthracite', 3, 0, 4), piece('wheels-2x4', 'anthracite', 12, 0, 4));
  for (const z of [4, 6, 8]) out.push(piece('brick-2x8', color, 2, 5, z, 1), piece('brick-2x6', color, 10, 5, z, 1));
  // Capot : les phares sont insérés dans la face avant (x = 2), de part et d'autre de la calandre.
  out.push(piece('brick-1x1', 'jaune-lumi', 2, 8, 4), piece('brick-1x4', color, 2, 8, 5, 0), piece('brick-1x1', 'jaune-lumi', 2, 8, 9));
  out.push(piece('brick-1x6', color, 3, 8, 4, 0), piece('brick-2x6', color, 4, 8, 4, 0));
  for (const y of [8, 11, 14]) out.push(piece('brick-1x6', 'ciel-verre', 6, y, 4, 0));
  for (const x of [8, 12]) for (const z of [5, 7]) out.push(piece('brick-2x2', 'noir', x, 8, z));
  out.push(piece(SWITCH_ID, 'blanc', 7, 8, 6, 0));
  // Les quatre portes sont articulées à l'avant et s'ouvrent dans le même sens : la version miroir sert au côté z = 9.
  for (const x of [7, 11]) out.push(piece('cardoor-1x4-h3', color, x, 8, 4, 3), piece('cardoor-1x4-h3-m', color, x, 8, 9, 1));
  // Hayon de quatre tenons entre deux feux arrière : des colonnes lumineuses de la hauteur du hayon, aux deux coins.
  out.push(piece('column-3', 'orange-lumi', 15, 8, 4), piece('column-3', 'orange-lumi', 15, 8, 9), piece('tailgate-1x4-h3', color, 15, 8, 5, 0));
  for (const z of [4, 6, 8]) out.push(piece('plate-2x8', color, 6, 17, z, 1), piece('plate-2x2', color, 14, 17, z));
  return out;
}

function car(): PieceSpec[] {
  return carPieces('rouge');
}

/**
 * Voiture étroite : un habitacle de 4 tenons de large (6 avec les roues), longue de 14. Quatre portières, un hayon de deux tenons entre deux feux
 * arrière orange intégrés, des phares jaunes intégrés dans la face avant du capot, deux sièges et un interrupteur sur le tableau de bord
 * qui commande les quatre feux. Elle roule vers -x.
 */
function carNarrow(color: string): PieceSpec[] {
  const out: PieceSpec[] = [];
  out.push(piece('wheels-2x4', 'anthracite', 3, 0, 4), piece('wheels-2x4', 'anthracite', 12, 0, 4));
  for (const z of [5, 7]) out.push(piece('brick-2x8', color, 2, 5, z, 1), piece('brick-2x6', color, 10, 5, z, 1));
  // Capot : phares dans la face avant (x = 2), de part et d'autre d'une calandre d'une brique 1×2.
  out.push(piece('brick-1x1', 'jaune-lumi', 2, 8, 5), piece('brick-1x2', color, 2, 8, 6, 0), piece('brick-1x1', 'jaune-lumi', 2, 8, 8));
  out.push(piece('brick-1x4', color, 3, 8, 5, 0), piece('brick-2x4', color, 4, 8, 5, 0));
  for (const y of [8, 11, 14]) out.push(piece('brick-1x4', 'ciel-verre', 6, y, 5, 0));
  out.push(piece('brick-2x2', 'noir', 8, 8, 6), piece('brick-2x2', 'noir', 12, 8, 6), piece(SWITCH_ID, 'blanc', 7, 8, 6, 0));
  for (const x of [7, 11]) out.push(piece('cardoor-1x4-h3', color, x, 8, 5, 3), piece('cardoor-1x4-h3-m', color, x, 8, 8, 1));
  out.push(piece('column-3', 'orange-lumi', 15, 8, 5), piece('column-3', 'orange-lumi', 15, 8, 8), piece('tailgate-1x2-h3', color, 15, 8, 6, 0));
  for (const z of [5, 7]) out.push(piece('plate-2x8', color, 6, 17, z, 1), piece('plate-2x2', color, 14, 17, z));
  return out;
}

/** Pose un groupe de pièces tourné de `turns` quarts de tour (même sens que l'orientation des pièces), le coin minimal de sa boîte en (x, y, z). */
function placeGroup(specs: readonly PieceSpec[], turns: number, x: number, y: number, z: number): PieceSpec[] {
  const k = ((turns % 4) + 4) % 4;
  const turned = specs.map((p) => {
    const type = requireType(p.typeId);
    let x0 = p.x;
    let z0 = p.z;
    let { fx, fz } = footprintSize(type, normalizeOrient(type, p.orient));
    for (let i = 0; i < k; i++) {
      [x0, z0] = [-(z0 + fz), x0];
      [fx, fz] = [fz, fx];
    }
    return { ...p, x: x0, z: z0, orient: normalizeOrient(type, p.orient + k) };
  });
  const minX = Math.min(...turned.map((p) => p.x));
  const minY = Math.min(...turned.map((p) => p.y));
  const minZ = Math.min(...turned.map((p) => p.z));
  return turned.map((p) => ({ ...p, x: p.x - minX + x, y: p.y - minY + y, z: p.z - minZ + z }));
}

/**
 * Grand camion large de 6 tenons et long de 24 (plaque de 32 × 32) : quatre essieux 2×4, un châssis de trois rangées de briques, un capot
 * à calandre grise et phares jaunes intégrés, une cabine à pare-brise, deux portières articulées à l'avant (une version miroir pour
 * l'autre côté), un siège double, deux pots d'échappement, une benne à ridelles jaunes avec ses caisses, et un hayon entre deux feux arrière
 * orange intégrés. Un interrupteur sur le tableau de bord allume et éteint phares et feux arrière.
 */
function truck(): PieceSpec[] {
  const out: PieceSpec[] = [];
  const Z = 12; // le camion occupe z de 12 à 17
  for (const x of [3, 14, 19, 23]) out.push(piece('wheels-2x4', 'anthracite', x, 0, Z));
  // Châssis : trois rangées de trois briques 2×8, chacune posée sur un support à roues.
  for (const z of [Z, Z + 2, Z + 4]) out.push(piece('brick-2x8', 'bleu', 2, 5, z, 1), piece('brick-2x8', 'bleu', 10, 5, z, 1), piece('brick-2x8', 'bleu', 18, 5, z, 1));
  // Capot (x de 2 à 5) : phares jaunes et calandre grise dans la face avant, deux rangs.
  out.push(piece('brick-1x1', 'jaune-lumi', 2, 8, Z), piece('brick-1x4', 'gris', 2, 8, Z + 1, 0), piece('brick-1x1', 'jaune-lumi', 2, 8, Z + 5));
  out.push(piece('brick-1x6', 'bleu', 3, 8, Z, 0), piece('brick-2x6', 'bleu', 4, 8, Z, 0));
  out.push(piece('brick-1x6', 'gris', 2, 11, Z, 0), piece('brick-1x6', 'bleu', 3, 11, Z, 0), piece('brick-2x6', 'bleu', 4, 11, Z, 0));
  // Cabine (x de 6 à 11) : tableau de bord et pare-brise, portières, sièges, interrupteur, paroi arrière, toit.
  out.push(piece('brick-1x6', 'bleu', 6, 8, Z, 0), piece('brick-1x6', 'ciel-verre', 6, 11, Z, 0), piece('brick-1x6', 'ciel-verre', 6, 14, Z, 0));
  out.push(piece('brick-2x2', 'noir', 8, 8, Z + 1), piece('brick-2x2', 'noir', 8, 8, Z + 3), piece(SWITCH_ID, 'blanc', 7, 8, Z + 2, 0));
  for (const [y, color] of [[8, 'bleu'], [11, 'ciel-verre'], [14, 'bleu']] as const) out.push(piece('brick-1x6', color, 11, y, Z, 0));
  out.push(piece('cardoor-1x4-h3', 'bleu', 7, 8, Z, 3), piece('cardoor-1x4-h3-m', 'bleu', 7, 8, Z + 5, 1));
  for (const z of [Z, Z + 2, Z + 4]) out.push(piece('plate-2x6', 'bleu', 6, 17, z, 1));
  // Deux pots d'échappement derrière la cabine.
  out.push(piece('column-4', 'anthracite', 12, 8, Z), piece('column-4', 'anthracite', 12, 8, Z + 5));
  // Benne (x de 13 à 24) : plancher, deux rangs de ridelles, paroi avant, caisses.
  for (const z of [Z, Z + 2, Z + 4]) out.push(piece('plate-2x8', 'gris', 13, 8, z, 1), piece('plate-2x4', 'gris', 21, 8, z, 1));
  for (const y of [9, 12]) {
    for (const z of [Z, Z + 5]) out.push(piece('brick-1x8', 'jaune', 13, y, z, 1), piece('brick-1x4', 'jaune', 21, y, z, 1));
    out.push(piece('brick-1x4', 'jaune', 13, y, Z + 1, 0));
  }
  out.push(piece('brick-2x2', 'orange', 15, 9, Z + 1), piece('brick-2x2', 'vert', 15, 9, Z + 3), piece('brick-2x2', 'rose', 19, 9, Z + 1), piece('brick-2x2', 'jaune', 15, 12, Z + 1));
  // Arrière : une plaque sous le hayon, un hayon de quatre tenons et un feu orange intégré à chaque coin, sur deux rangs.
  out.push(piece('plate-1x6', 'gris', 25, 8, Z, 0));
  for (const z of [Z, Z + 5]) out.push(piece('brick-1x1', 'orange-lumi', 25, 9, z), piece('brick-1x1', 'orange-lumi', 25, 12, z));
  out.push(piece('tailgate-1x4-h2', 'jaune', 25, 9, Z + 1, 0));
  return out;
}

/** Circuit du camion : l'interrupteur du tableau de bord commande les phares et les feux arrière. */
function truckCircuit(pieces: readonly PieceSpec[]): Array<readonly [number, number[]]> {
  const sw = indicesOf(pieces, (p) => p.typeId === SWITCH_ID)[0]!;
  return [[sw, indicesOf(pieces, (p) => p.color.endsWith('-lumi'))]];
}

/**
 * Outils communs au château et à la grande maison, pour un corps de logis de 24 × 16 tenons (x de 10 à 33, z de 12 à 27) : assises de briques,
 * colonnes de fenêtres, les quatre murs d'un étage, puis le plancher de l'étage avec ses colonnes et son escalier de six marches (z de 14 à 17,
 * de x = 22 au rez-de-chaussée à x = 11 au niveau du plancher). `STONE` et `BAND` sont les deux couleurs alternées des murs.
 */
function shell(out: PieceSpec[], STONE: string, BAND: string, doorColor = 'marron') {
  const tone = (row: number) => (row % 2 === 0 ? STONE : BAND);
  /** Une assise de briques 1×L alignées, de L = 8, 6, 4 ou 2 (longueur paire), dans l'axe `axis` ; `flip` inverse l'ordre pour croiser les joints. */
  const course = (axis: 'x' | 'z', fixed: number, from: number, len: number, y: number, color: string, flip: boolean) => {
    const segs: number[] = [];
    let rest = len;
    for (const l of [8, 6, 4, 2]) while (rest >= l) { segs.push(l); rest -= l; }
    if (flip) segs.reverse();
    let pos = from;
    for (const l of segs) {
      out.push(axis === 'x' ? piece(`brick-1x${l}`, color, pos, y, fixed, 1) : piece(`brick-1x${l}`, color, fixed, y, pos, 0));
      pos += l;
    }
  };
  /** Colonne de fenêtre de `len` = 4 ou 6 tenons : une brique d'appui, la fenêtre (trois briques de haut), puis des briques jusqu'au haut du mur. */
  const windowCol = (axis: 'x' | 'z', fixed: number, from: number, len: number, y0: number, rows: number, turn: number) => {
    const wall = (y: number, color: string) => out.push(axis === 'x' ? piece(`brick-1x${len}`, color, from, y, fixed, 1) : piece(`brick-1x${len}`, color, fixed, y, from, 0));
    wall(y0, STONE);
    const at = axis === 'x' ? [from, y0 + 3, fixed] : [fixed, y0 + 3, from];
    out.push(piece(`casement-1x${len}-h2`, 'blanc', at[0]!, at[1]!, at[2]!, turn));
    for (let k = 0; k < rows - 4; k++) wall(y0 + 12 + 3 * k, k % 2 === 0 ? BAND : STONE);
  };
  /** Les quatre murs d'un étage : façade (z = 27), fond (z = 12), côtés ouest (x = 10) et est (x = 33). `door` : double porte au rez-de-chaussée, grande fenêtre à l'étage. */
  const floor = (y0: number, rows: number, door: boolean) => {
    for (const x of [11, 15, 25, 29]) windowCol('x', 27, x, 4, y0, rows, 1);
    if (door) out.push(piece('door-1x6-h5', doorColor, 19, y0, 27, 1));
    else windowCol('x', 27, 19, 6, y0, rows, 1);
    windowCol('x', 12, 11, 6, y0, rows, 3);
    windowCol('x', 12, 17, 6, y0, rows, 3);
    windowCol('x', 12, 23, 4, y0, rows, 3);
    windowCol('x', 12, 27, 6, y0, rows, 3);
    for (const [x, turn] of [[10, 2], [33, 0]] as const) {
      windowCol('z', x, 12, 6, y0, rows, turn);
      windowCol('z', x, 18, 4, y0, rows, turn);
      windowCol('z', x, 22, 6, y0, rows, turn);
    }
  };
  const pillar = (x: number, z: number) => out.push(piece('column-4', 'blanc', x, 0, z), piece('column-2', 'blanc', x, 12, z));

  /** Colonnes sous le plancher de l'étage, escalier et plancher (y = 18) de la couleur `floorColor`, avec un trou pour l'escalier. */
  const slab = (floorColor: string) => {
    for (const [x, z] of [[14, 18], [20, 18], [23, 16], [25, 16], [14, 23], [30, 23], [30, 16]] as const) pillar(x, z);
    // Escalier : six marches de deux tenons sur quatre de large (z de 14 à 17), de x = 22 à x = 11, de 3 à 18 plaques de haut.
    for (let i = 0; i < 6; i++) for (let k = 0; k <= i; k++) out.push(piece('brick-2x4', k % 2 === 0 ? floorColor : STONE, 21 - 2 * i, 3 * k, 14, 0));
    // Plancher de l'étage (y = 18) : plaques sable sur les murs et les colonnes, avec un trou pour l'escalier.
    for (const [x, z] of [[26, 12], [10, 20], [18, 20], [26, 20]] as const) out.push(piece('plate-8x8', floorColor, x, 18, z));
    out.push(piece('plate-2x8', floorColor, 10, 18, 12, 1), piece('plate-2x8', floorColor, 18, 18, 12, 1));
    out.push(piece('plate-1x6', floorColor, 10, 18, 14, 0), piece('plate-1x6', floorColor, 23, 18, 14, 0), piece('plate-2x6', floorColor, 24, 18, 14, 0));
    out.push(piece('plate-2x8', floorColor, 11, 18, 18, 1), piece('plate-2x4', floorColor, 19, 18, 18, 1));
  };
  return { tone, course, windowCol, floor, slab };
}

/**
 * Château (plaque de 48 × 48) : un grand corps de logis de 24 × 16 tenons à deux étages, quatre hautes tours à fenêtres et à toit pointu,
 * des créneaux sur tout le tour, un portique de quatre colonnes avec auvent devant la double porte, un escalier intérieur qui monte
 * du rez-de-chaussée à l'étage (le toit du corps de logis reste ouvert, pour voir l'étage d'en haut), une allée sable éclairée par
 * quatre torches et un jardin de fleurs. Trois interrupteurs reliés : celui du rez-de-chaussée (six lampes), celui de l'étage (six lampes)
 * et celui de l'allée (les torches). Les lampes des tours et les balises restent allumées.
 */
function castle(): PieceSpec[] {
  const out: PieceSpec[] = [];
  const STONE = 'gris';
  const BAND = 'blanc';
  const { tone, course, floor, slab } = shell(out, STONE, BAND);
  // Rez-de-chaussée : quatre murs de six briques, des colonnes sous le plancher de l'étage, l'escalier.
  floor(0, 6, true);
  slab('sable');
  // Étage : quatre murs de cinq briques (y de 19 à 34), puis le chemin de ronde et les créneaux.
  floor(19, 5, false);
  for (const [axis, fixed, from, len] of [['x', 27, 10, 24], ['x', 12, 10, 24], ['z', 10, 13, 14], ['z', 33, 13, 14]] as const) {
    course(axis, fixed, from, len, 34, STONE, false);
    for (let d = 0; d + 2 <= len; d += 4) {
      for (const y of [37, 40]) out.push(axis === 'x' ? piece('brick-1x2', BAND, from + d, y, fixed, 1) : piece('brick-1x2', BAND, fixed, y, from + d, 0));
    }
  }
  // Tours d'angle (4 × 4 tenons) : deux fenêtres chacune, deux lampes derrière chaque vitre, toit pointu, brique d'or, balise.
  for (const [x0, east] of [[6, false], [34, true]] as const) {
    for (const z0 of [12, 24]) {
      for (let t = 0; t < 15; t++) {
        const y = 3 * t;
        const win = t === 2 || t === 9;
        const inner = (t >= 2 && t <= 4) || (t >= 9 && t <= 11);
        const innerX = east ? x0 : x0 + 2;
        const color = tone(t);
        if (win) {
          out.push(piece('brick-2x4', color, innerX, y, z0, 0), piece('casement-1x4-h2', 'blanc', east ? x0 + 3 : x0, y, z0, east ? 0 : 2));
          const lampX = east ? x0 + 2 : x0 + 1;
          out.push(piece('column-3', 'jaune-lumi', lampX, y, z0 + 1), piece('column-3', 'jaune-lumi', lampX, y, z0 + 2));
        } else if (inner) {
          out.push(piece('brick-2x4', color, innerX, y, z0, 0));
        } else {
          out.push(piece('brick-2x4', color, x0, y, z0, 0), piece('brick-2x4', color, x0 + 2, y, z0, 0));
        }
      }
      out.push(piece('corner-2x2', 'marine', x0, 45, z0, 2), piece('corner-2x2', 'marine', x0 + 2, 45, z0, 3));
      out.push(piece('corner-2x2', 'marine', x0, 45, z0 + 2, 1), piece('corner-2x2', 'marine', x0 + 2, 45, z0 + 2, 0));
      out.push(piece('brick-2x2', 'jaune', x0 + 1, 48, z0 + 1), piece('column-1', 'orange-lumi', x0 + 1, 51, z0 + 1));
    }
  }
  // Portique : quatre colonnes de six briques, deux poutres 2×8 et un auvent de pentes douces au-dessus de la double porte.
  for (const x of [16, 18, 25, 27]) out.push(piece('column-4', 'blanc', x, 0, 29), piece('column-2', 'blanc', x, 12, 29));
  out.push(piece('brick-2x8', 'jaune', 14, 18, 28, 1), piece('brick-2x8', 'jaune', 22, 18, 28, 1));
  for (let x = 14; x < 30; x += 2) out.push(piece('gentle-2x4', 'marine', x, 21, 28, 0));
  // Intérieur : lampes et interrupteurs du rez-de-chaussée (sur le sol) et de l'étage (sur le plancher).
  for (const [x, z] of [[13, 21], [13, 25], [22, 21], [22, 25], [31, 21], [31, 25]] as const) out.push(piece('column-3', 'jaune-lumi', x, 0, z));
  out.push(piece('brick-1x2', 'gris', 32, 0, 14, 0), piece(SWITCH_ID, 'blanc', 32, 3, 14, 0));
  for (const [x, z] of [[13, 22], [13, 25], [20, 25], [27, 25], [31, 25], [27, 22]] as const) out.push(piece('column-3', 'jaune-lumi', x, 19, z));
  out.push(piece('brick-1x2', 'gris', 32, 19, 14, 0), piece(SWITCH_ID, 'blanc', 32, 22, 14, 0));
  // Dehors : allée sable, quatre torches et leur interrupteur, des fleurs.
  for (const x of [19, 21, 23]) out.push(piece('plate-2x8', 'sable', x, 0, 30, 0));
  for (const z of [32, 36]) out.push(piece('column-3', 'orange-lumi', 18, 0, z), piece('column-3', 'orange-lumi', 25, 0, z));
  out.push(piece('brick-1x2', 'gris', 29, 0, 31, 0), piece(SWITCH_ID, 'jaune', 29, 3, 31, 0));
  const flowers: ReadonlyArray<readonly [number, number, string]> = [
    [8, 30, 'rose'], [11, 32, 'jaune'], [13, 30, 'rouge'], [30, 33, 'orange'], [33, 31, 'violet'], [35, 33, 'blanc'], [9, 35, 'jaune'],
    [13, 36, 'rose'], [30, 37, 'rouge'], [34, 36, 'violet'], [15, 34, 'orange'], [28, 35, 'rose'], [5, 28, 'blanc'], [38, 28, 'jaune'],
  ];
  for (const [x, z, color] of flowers) out.push(piece('plate-1x1', 'vert', x, 0, z), piece('roundplate-1x1', color, x, 1, z));
  // Quatre arbres aux coins de la pelouse : deux à houppier rond, deux sapins.
  roundTree(out, 3, 4, 'vert');
  firTree(out, 44, 4);
  firTree(out, 3, 40);
  roundTree(out, 44, 40, 'orange');
  return out;
}

/** Circuits du château : lampes du rez-de-chaussée, lampes de l'étage, torches de l'allée (chacun avec son interrupteur). */
function castleCircuits(pieces: readonly PieceSpec[]): Array<readonly [number, number[]]> {
  const at = (test: (p: PieceSpec) => boolean) => indicesOf(pieces, test);
  const sw = (x: number, y: number) => at((p) => p.typeId === SWITCH_ID && p.x === x && p.y === y)[0]!;
  const lamps = (y: number) => at((p) => p.typeId === 'column-3' && p.color === 'jaune-lumi' && p.y === y && p.x >= 11 && p.x <= 32);
  return [
    [sw(32, 3), lamps(0)],
    [sw(32, 22), lamps(19)],
    [sw(29, 3), at((p) => p.typeId === 'column-3' && p.color === 'orange-lumi' && p.z >= 30)],
  ];
}

/** Arbre à houppier rond : un tronc de six briques, un plateau de feuilles 6 × 6, un bloc de 4 × 4 sur trois briques, un sommet. */
function roundTree(out: PieceSpec[], x: number, z: number, leaves: string, y0 = 0): void {
  out.push(piece('column-4', 'marron', x, y0, z), piece('column-2', 'marron', x, y0 + 12, z));
  out.push(piece('plate-6x6', leaves, x - 2, y0 + 18, z - 2));
  out.push(piece('brick-2x4', leaves, x - 1, y0 + 19, z - 1, 0), piece('brick-2x4', leaves, x + 1, y0 + 19, z - 1, 0));
  out.push(piece('brick-2x2', leaves, x, y0 + 22, z), piece('roundplate-2x2', leaves, x, y0 + 25, z));
}

/** Sapin : un tronc de quatre briques et deux étages en pyramide (quatre pentes d'angle et une brique chacun) sur un plateau 6 × 6. */
function firTree(out: PieceSpec[], x: number, z: number, y0 = 0): void {
  out.push(piece('column-4', 'marron', x, y0, z));
  out.push(piece('plate-6x6', 'vert', x - 2, y0 + 12, z - 2));
  for (const base of [13, 19]) {
    out.push(piece('corner-2x2', 'vert', x - 1, y0 + base, z - 1, 2), piece('corner-2x2', 'vert', x + 1, y0 + base, z - 1, 3));
    out.push(piece('corner-2x2', 'vert', x - 1, y0 + base, z + 1, 1), piece('corner-2x2', 'vert', x + 1, y0 + base, z + 1, 0));
    out.push(piece('brick-2x2', 'vert', x, y0 + base + 3, z));
  }
}

/** Les rangs, dans la liste de pièces d'un modèle, des voitures qu'il contient (chacune avec son interrupteur et ses feux). */
type CarRange = readonly [start: number, end: number];

/**
 * Grande maison sur sept plaques de tailles et de couleurs différentes (48 × 80) : la pelouse (48 × 48, vert herbe), une rangée de trois
 * plaques de 16 devant (herbe, sable, herbe) et la route (trois plaques de 16, gris). Le corps de logis de 24 × 16 tenons a un rez-de-chaussée
 * de six briques (double porte, onze fenêtres, une cloison à porte intérieure), un grenier au plancher de plaques sable relié par un escalier,
 * une fenêtre à chaque pignon, et un vrai toit à deux pans en gradins de pentes douces (pignons triangulaires), avec une cheminée. À droite,
 * un garage de 12 × 16 à grande porte, plancher gris et toit à deux pans abrite une grande voiture. Devant : une allée sable de 36 tenons
 * éclairée par dix torches, une allée gris qui mène au garage, des fleurs, et deux grandes voitures garées dans la rue. Des interrupteurs
 * reliés : rez-de-chaussée, grenier, allée, garage, et un à l'intérieur de chaque voiture (phares et feux arrière).
 */
function manor(): { pieces: PieceSpec[]; cars: CarRange[] } {
  const out: PieceSpec[] = [];
  const { tone, course, windowCol, floor, slab } = shell(out, 'jaune', 'blanc', 'rouge');
  const solid = (axis: 'x' | 'z', fixed: number, from: number, len: number, y0: number, rows: number) => {
    for (let r = 0; r < rows; r++) course(axis, fixed, from, len, y0 + 3 * r, tone(r), r % 2 === 1);
  };
  // Rez-de-chaussée et plancher du grenier ; une cloison (x = 26, z de 13 à 20) avec une porte intérieure.
  floor(0, 6, true);
  out.push(piece('door-1x4-h5', 'rouge', 26, 0, 13, 0));
  for (let r = 0; r < 6; r++) out.push(piece('brick-1x4', tone(r), 26, 3 * r, 17, 0));
  slab('sable');
  // Grenier : murs de trois briques (y de 19 à 28) devant et derrière ; aux pignons (x = 10 et 33) une fenêtre au milieu, puis le triangle.
  for (const z of [27, 12]) solid('x', z, 11, 22, 19, 3);
  for (const [x, turn] of [[10, 2], [33, 0]] as const) {
    for (const [y, r] of [[19, 0], [22, 1], [25, 2]] as const) {
      course('z', x, 12, 6, y, tone(r), r % 2 === 1);
      course('z', x, 22, 6, y, tone(r), r % 2 === 1);
    }
    out.push(piece('brick-1x4', tone(0), x, 19, 18, 0), piece('casement-1x4-h2', 'blanc', x, 22, 18, turn));
    out.push(piece('brick-1x2', tone(3), x, 28, 16, 0), piece('brick-1x2', tone(3), x, 28, 22, 0), piece('brick-1x4', tone(4), x, 31, 18, 0));
  }
  // Toit à deux pans : trois gradins de pentes douces 2×4 de chaque côté, le suivant posé sur les rangs plats du précédent (y = 28, 31, 34) ;
  // les rangs plats des deux côtés se touchent au faîte (z de 18 à 21, y = 37).
  for (let x = 10; x < 34; x += 2) {
    for (let k = 0; k < 3; k++) out.push(piece('gentle-2x4', 'marron', x, 28 + 3 * k, 12 + 2 * k, 2), piece('gentle-2x4', 'marron', x, 28 + 3 * k, 24 - 2 * k, 0));
  }
  out.push(piece('brick-2x2', 'gris', 20, 37, 19), piece('brick-2x2', 'gris', 20, 40, 19));
  // Lampes et interrupteurs : rez-de-chaussée (sur le sol), grenier (sur le plancher).
  for (const [x, z] of [[13, 21], [13, 25], [22, 21], [22, 25], [31, 21], [31, 25]] as const) out.push(piece('column-3', 'jaune-lumi', x, 0, z));
  out.push(piece('brick-1x2', 'gris', 32, 0, 14, 0), piece(SWITCH_ID, 'blanc', 32, 3, 14, 0));
  for (const [x, z] of [[13, 22], [13, 25], [31, 22], [31, 25]] as const) out.push(piece('column-3', 'jaune-lumi', x, 19, z));
  out.push(piece('brick-1x2', 'gris', 32, 19, 14, 0), piece(SWITCH_ID, 'blanc', 32, 22, 14, 0));

  // Garage (x de 34 à 45, z de 12 à 27) : plancher gris, sept rangs de murs avec une fenêtre derrière et une sur le côté, grande porte devant.
  out.push(piece('plate-8x8', 'gris', 35, 0, 13), piece('plate-2x8', 'gris', 43, 0, 13, 0), piece('plate-6x6', 'gris', 35, 0, 21));
  out.push(piece('plate-2x6', 'gris', 41, 0, 21, 0), piece('plate-2x6', 'gris', 43, 0, 21, 0));
  solid('z', 34, 12, 16, 0, 7);
  solid('z', 45, 12, 6, 0, 7);
  windowCol('z', 45, 18, 4, 0, 7, 0);
  solid('z', 45, 22, 6, 0, 7);
  solid('x', 12, 35, 2, 0, 7);
  windowCol('x', 12, 37, 4, 0, 7, 3);
  solid('x', 12, 41, 4, 0, 7);
  // Façade du garage : un pilier d'une brique de large à chaque bout et une porte de garage de 8 × 7 briques (une voiture y passe).
  for (let r = 0; r < 7; r++) out.push(piece('brick-1x1', tone(r), 35, 3 * r, 27), piece('brick-1x1', tone(r), 44, 3 * r, 27));
  out.push(piece('garage-1x8-h7', 'rouge', 36, 0, 27, 1));
  // Toit du garage : deux gradins de pentes douces de chaque côté (y = 21 et 24), faîte le long de z ; le triangle des deux pignons.
  for (let z = 12; z < 28; z += 2) {
    out.push(piece('gentle-2x4', 'marron', 34, 21, z, 1), piece('gentle-2x4', 'marron', 36, 24, z, 1));
    out.push(piece('gentle-2x4', 'marron', 42, 21, z, 3), piece('gentle-2x4', 'marron', 40, 24, z, 3));
  }
  out.push(piece('brick-1x4', 'jaune', 38, 21, 12, 1), piece('brick-1x4', 'jaune', 38, 21, 27, 1));
  // Lampes du garage, sur le plancher (y = 1), et leur interrupteur près de la porte.
  out.push(piece('column-3', 'jaune-lumi', 36, 1, 14), piece('column-3', 'jaune-lumi', 43, 1, 14));
  out.push(piece('brick-1x2', 'gris', 44, 1, 25, 0), piece(SWITCH_ID, 'blanc', 44, 4, 25, 0));

  // Devant la porte : un paillasson, une allée sable de 36 tenons (plaques sur la pelouse, puis la plaque sable) et dix torches.
  out.push(piece('tile-2x6', 'anthracite', 19, 0, 28, 1));
  for (const x of [19, 21, 23]) out.push(piece('plate-2x8', 'sable', x, 0, 30, 0), piece('plate-2x8', 'sable', x, 0, 38, 0), piece('plate-2x2', 'sable', x, 0, 46));
  for (const z of [32, 38, 44, 52, 58]) out.push(piece('column-3', 'orange-lumi', 18, 0, z), piece('column-3', 'orange-lumi', 25, 0, z));
  out.push(piece('brick-1x2', 'gris', 27, 0, 29, 0), piece(SWITCH_ID, 'jaune', 27, 3, 29, 0));
  // Allée du garage, en plaques grises, de la porte à la route.
  for (const x of [37, 39, 41]) out.push(piece('plate-2x8', 'gris', x, 0, 28, 0), piece('plate-2x8', 'gris', x, 0, 36, 0), piece('plate-2x8', 'gris', x, 0, 44, 0), piece('plate-2x8', 'gris', x, 0, 52, 0), piece('plate-2x4', 'gris', x, 0, 60, 0));
  // Des fleurs dans l'herbe : une tige verte et une corolle ronde.
  const flowers: ReadonlyArray<readonly [number, number, string]> = [
    [4, 30, 'rose'], [7, 32, 'jaune'], [10, 30, 'rouge'], [13, 33, 'orange'], [5, 36, 'violet'], [9, 38, 'blanc'], [13, 40, 'rose'], [3, 42, 'jaune'],
    [8, 44, 'rouge'], [12, 45, 'orange'], [28, 31, 'rose'], [30, 34, 'jaune'], [32, 38, 'rouge'], [29, 41, 'violet'], [31, 45, 'orange'],
    [33, 31, 'blanc'], [5, 52, 'rose'], [10, 55, 'jaune'], [3, 60, 'rouge'], [12, 58, 'violet'], [33, 52, 'orange'], [45, 56, 'rose'], [35, 60, 'jaune'], [44, 51, 'blanc'],
  ];
  for (const [x, z, color] of flowers) out.push(piece('plate-1x1', 'vert', x, 0, z), piece('roundplate-1x1', color, x, 1, z));
  // La route : une ligne blanche discontinue au milieu.
  for (let x = 2; x < 46; x += 8) out.push(piece('plate-1x4', 'blanc', x, 0, 72, 1));

  // Des arbres : trois à houppier rond (dont un roux d'automne) et deux sapins.
  roundTree(out, 4, 10, 'vert');
  roundTree(out, 40, 6, 'orange');
  roundTree(out, 6, 23, 'vert');
  firTree(out, 14, 44);
  firTree(out, 31, 44);

  // Trois grandes voitures : deux garées dans la rue (l'une tournée vers -x, l'autre vers +x), une dans le garage, le nez vers la porte.
  const cars: CarRange[] = [];
  for (const [color, turns, x, y, z] of [['rouge', 0, 6, 0, 66], ['bleu', 2, 30, 0, 73], ['turquoise', 3, 37, 1, 13]] as const) {
    const start = out.length;
    out.push(...placeGroup(carPieces(color), turns, x, y, z));
    cars.push([start, out.length]);
  }
  return { pieces: out, cars };
}

/** Circuits de la grande maison : lampes du rez-de-chaussée, lampes du grenier, torches de l'allée, lampes du garage, puis chaque voiture. */
function manorCircuits(pieces: readonly PieceSpec[], cars: readonly CarRange[]): Array<readonly [number, number[]]> {
  const at = (test: (p: PieceSpec) => boolean) => indicesOf(pieces, test);
  const sw = (x: number, y: number) => at((p) => p.typeId === SWITCH_ID && p.x === x && p.y === y)[0]!;
  const lamps = (y: number, x0: number, x1: number) => at((p) => p.typeId === 'column-3' && p.color === 'jaune-lumi' && p.y === y && p.x >= x0 && p.x <= x1);
  const circuits: Array<readonly [number, number[]]> = [
    [sw(32, 3), lamps(0, 11, 32)],
    [sw(32, 22), lamps(19, 11, 32)],
    // Les torches : les colonnes orange hors des voitures (dont les feux arrière sont des colonnes orange aussi).
    [sw(27, 3), indicesOf(pieces, (p) => p.typeId === 'column-3' && p.color === 'orange-lumi').filter((i) => !cars.some(([start, end]) => i >= start && i < end))],
    [sw(44, 4), lamps(1, 35, 44)],
  ];
  for (const [start, end] of cars) {
    const inCar = (i: number) => i >= start && i < end;
    const own = indicesOf(pieces, () => true).filter(inCar);
    circuits.push([own.find((i) => pieces[i]!.typeId === SWITCH_ID)!, own.filter((i) => pieces[i]!.color.endsWith('-lumi'))]);
  }
  return circuits;
}

/**
 * Grand pont sur trois plaques (96 × 32 : berge, rivière bleue, berge) : les berges sont surélevées d'une brique pour que l'eau paraisse plus
 * basse. Une route grise large de 10 tenons part du bord de la plaque, monte par deux rampes de cinq paliers de pentes douces à un tablier de
 * 40 tenons situé à 18 plaques au-dessus de l'eau, posé sur quatre piles de six briques qui plongent dans l'eau, avec des garde-corps fins et
 * douze lampadaires. Deux hautes tours à passage de huit briques et à petites fenêtres sont reliées par une passerelle en verre ; la voiture
 * passe sous leur arche. Un bateau, tourné en travers de la route, passe en partie sous le pont. Une petite voiture (4 tenons de large de
 * carrosserie) traverse. Trois interrupteurs, sur la berge hors de la route : lampadaires de l'ouest, lampadaires de l'est, balises des tours ;
 * la voiture a le sien.
 */
function bridge(): { pieces: PieceSpec[]; cars: CarRange[] } {
  const out: PieceSpec[] = [];
  const lanes = [11, 13, 15, 17, 19]; // la route occupe z de 11 à 20
  const DECK = 18; // niveau du dessous du tablier, en plaques
  // Berges : une couche de briques 2×8 vertes d'une brique de haut, sur toute la largeur des deux plaques d'herbe.
  for (const x0 of [0, 64]) for (let x = x0; x < x0 + 32; x += 8) for (let z = 0; z < 32; z += 2) out.push(piece('brick-2x8', 'vert', x, 0, z, 1));
  // La route continue en gris sur les berges, jusqu'au bord des plaques.
  for (const z of lanes) out.push(piece('plate-2x8', 'gris', 0, 3, z, 1), piece('plate-2x2', 'gris', 8, 3, z), piece('plate-2x8', 'gris', 88, 3, z, 1), piece('plate-2x2', 'gris', 86, 3, z));
  // Rampes : cinq paliers de pentes douces 2×4 (la route monte de 15 plaques, de la berge au tablier), chacun sur autant de rangées de briques
  // que de paliers déjà montés. À l'ouest ils montent vers +x (x de 10 à 29) ; à l'est ils descendent vers +x (x de 66 à 85).
  for (const z of lanes) {
    for (let k = 0; k < 5; k++) {
      for (let r = 0; r < k; r++) out.push(piece('brick-2x4', 'sable', 10 + 4 * k, 3 + 3 * r, z, 1), piece('brick-2x4', 'sable', 82 - 4 * k, 3 + 3 * r, z, 1));
      out.push(piece('gentle-2x4', 'gris', 10 + 4 * k, 3 + 3 * k, z, 1), piece('gentle-2x4', 'gris', 82 - 4 * k, 3 + 3 * k, z, 3));
    }
  }
  // Piles (x = 34, 42, 50, 58) : deux jambes de six briques depuis l'eau jusqu'au tablier, de part et d'autre de la route.
  for (const x of [34, 42, 50, 58]) for (const z of [11, 19]) for (let y = 0; y < DECK; y += 3) out.push(piece('brick-2x4', 'gris', x, y, z, 1));
  // Tablier : cinq tronçons de 8 tenons (x de 28 à 67), une plaque 8 × 8 et une plaque 2 × 8 chacun.
  for (let x = 28; x < 68; x += 8) out.push(piece('plate-8x8', 'anthracite', x, DECK, 11), piece('plate-2x8', 'anthracite', x, DECK, 19, 1));
  const top = DECK + 1; // dessus du tablier
  // Garde-corps fins : des poteaux d'une brique tous les quatre tenons et une lisse de plaque 1×8 (ou 1×4 près des tours), sauf aux tours.
  const rail = (x: number, len: 8 | 4) => {
    for (const z of [11, 20]) {
      for (let k = 0; k < len; k += 4) out.push(piece('brick-1x1', 'blanc', x + k, top, z));
      out.push(piece(`plate-1x${len}`, 'blanc', x, top + 3, z, 1));
    }
  };
  for (const x of [28, 44, 60]) rail(x, 8);
  rail(36, 4);
  rail(56, 4);
  // Tours (x de 40 à 43 et de 52 à 55, z de 11 à 20) : deux jambes de huit briques (arche de 24 plaques), un linteau, la passerelle de verre,
  // deux petites fenêtres par tour avec deux lampes derrière, un sommet violet et une balise à chaque coin.
  const lintel = top + 24;
  const walk = lintel + 3;
  for (const x of [40, 52]) {
    for (const z of [11, 19]) for (let y = top; y < lintel; y += 3) out.push(piece('brick-2x4', 'blanc', x, y, z, 1));
    for (const dx of [0, 2]) out.push(piece('brick-2x6', 'bleu', x + dx, lintel, 11, 0), piece('brick-2x4', 'bleu', x + dx, lintel, 17, 0));
  }
  // Passerelle de verre, du premier linteau au second, large de six tenons (z de 13 à 18).
  for (const z of [13, 15, 17]) out.push(piece('brick-2x8', 'ciel-verre', 40, walk, z, 1), piece('brick-2x8', 'ciel-verre', 48, walk, z, 1));
  for (const x of [40, 52]) {
    out.push(piece('brick-2x4', 'blanc', x, walk, 11, 1), piece('brick-2x4', 'blanc', x, walk, 19, 1));
    // Au-dessus : un bloc plein de six tenons au milieu, une petite fenêtre sur chaque face (z = 11 et z = 20) avec ses lampes derrière.
    for (const [i, y] of [walk + 3, walk + 6, walk + 9].entries()) for (const dx of [0, 2]) out.push(piece('brick-2x6', i === 1 ? 'blanc' : 'violet', x + dx, y, 13, 0));
    out.push(piece('casement-1x4-h2', 'blanc', x, walk + 3, 11, 3), piece('casement-1x4-h2', 'blanc', x, walk + 3, 20, 1));
    for (const z of [12, 19]) out.push(piece('column-3', 'jaune-lumi', x + 1, walk + 3, z), piece('column-3', 'jaune-lumi', x + 2, walk + 3, z));
    for (const [bx, bz] of [[x, 11], [x + 3, 11], [x, 20], [x + 3, 20]] as const) out.push(piece('column-1', 'orange-lumi', bx, walk + 12, bz));
  }
  // Lampadaires : douze colonnes lumineuses le long des garde-corps, six à l'ouest du milieu du pont et six à l'est.
  for (const x of [30, 35, 46, 49, 60, 65]) for (const z of [12, 19]) out.push(piece('column-3', 'jaune-lumi', x, top, z));
  // Interrupteurs sur la berge, hors de la route : lampadaires de l'ouest (x = 10), lampadaires de l'est (x = 85), balises des tours (x = 87).
  for (const x of [10, 85, 87]) out.push(piece('brick-1x2', 'gris', x, 3, 7, 0), piece(SWITCH_ID, x === 87 ? 'orange' : 'blanc', x, 6, 7, 0));
  // Bateau, en travers de la route et tourné de 90° : il suit la rivière (z de 4 à 19), dépasse du pont de 7 tenons et passe dessous sur
  // 8. Coque rouge et blanche, proue en pente, cabine à vitres et toit rouge, feux de position, feu de poupe sous le tablier.
  for (const x of [46, 48]) {
    out.push(piece('brick-2x8', 'rouge', x, 0, 4, 0), piece('brick-2x8', 'rouge', x, 0, 12, 0));
    out.push(piece('gentle-2x4', 'blanc', x, 3, 4, 2), piece('brick-2x8', 'blanc', x, 3, 8, 0), piece('brick-2x4', 'blanc', x, 3, 16, 0));
    out.push(piece('brick-2x4', 'jaune', x, 6, 6, 0), piece('brick-2x4', 'ciel-verre', x, 9, 6, 0));
  }
  out.push(piece('plate-4x4', 'rouge', 46, 12, 6));
  out.push(piece('brick-1x1', 'rouge-lumi', 46, 13, 6), piece('brick-1x1', 'vert-lumi', 49, 13, 6), piece('brick-1x1', 'jaune-lumi', 47, 6, 18));
  // Petite voiture de 4 tenons de large de carrosserie, sur la route, qui roule vers +x ; elle passe sous l'arche des tours.
  const cars: CarRange[] = [];
  const start = out.length;
  out.push(...placeGroup(carNarrow('rouge'), 2, 28, top, 13));
  cars.push([start, out.length]);
  // Arbres sur les berges (le tronc part du dessus des briques, y = 3).
  roundTree(out, 5, 5, 'vert', 3);
  firTree(out, 22, 26, 3);
  firTree(out, 90, 5, 3);
  roundTree(out, 72, 25, 'orange', 3);
  return { pieces: out, cars };
}

/**
 * Circuits du pont : les lampadaires de l'ouest (x < 48), ceux de l'est, les balises des tours (chacun avec son interrupteur sur la berge),
 * et la voiture (son interrupteur commande ses phares et ses feux).
 */
function bridgeCircuits(pieces: readonly PieceSpec[], cars: readonly CarRange[]): Array<readonly [number, number[]]> {
  const at = (test: (p: PieceSpec) => boolean) => indicesOf(pieces, test);
  const sw = (x: number) => at((p) => p.typeId === SWITCH_ID && p.x === x && p.y === 6)[0]!;
  const posts = (west: boolean) => at((p) => p.typeId === 'column-3' && p.color === 'jaune-lumi' && p.y === 19 && p.z >= 12 && p.z <= 19 && (p.x < 48) === west && p.x >= 28 && p.x <= 67);
  const circuits: Array<readonly [number, number[]]> = [
    [sw(10), posts(true)],
    [sw(85), posts(false)],
    [sw(87), at((p) => p.typeId === 'column-1' && p.color === 'orange-lumi' && p.y === 58)],
  ];
  for (const [start, end] of cars) {
    const own = indicesOf(pieces, () => true).filter((i) => i >= start && i < end);
    circuits.push([own.find((i) => pieces[i]!.typeId === SWITCH_ID)!, own.filter((i) => pieces[i]!.color.endsWith('-lumi'))]);
  }
  return circuits;
}

/** Circuit de la voiture : l'interrupteur du tableau de bord commande les phares et les feux arrière. */
function carCircuit(pieces: readonly PieceSpec[]): Array<readonly [number, number[]]> {
  const sw = indicesOf(pieces, (p) => p.typeId === SWITCH_ID)[0]!;
  return [[sw, indicesOf(pieces, (p) => p.color.endsWith('-lumi'))]];
}

/** Rangs des pièces qui répondent au critère. */
function indicesOf(pieces: readonly PieceSpec[], test: (p: PieceSpec) => boolean): number[] {
  return pieces.flatMap((p, i) => (test(p) ? [i] : []));
}

const MODELS: ExampleModel[] = [
  { id: 'house', base: { size: 16, color: 'vert' }, pieces: house(), opened: indicesOf(house(), (p) => p.typeId.startsWith('door-') || (p.typeId.startsWith('casement-') && p.z === 12 && p.x === 10) || (p.typeId.startsWith('casement-') && p.x === 1)) },
  {
    id: 'castle',
    base: { size: 48, color: 'vert' },
    pieces: castle(),
    opened: indicesOf(
      castle(),
      (p) =>
        p.typeId.startsWith('door-') ||
        (p.typeId.startsWith('casement-') && p.z === 27 && (p.x === 15 || p.x === 25 || (p.x === 19 && p.y === 22))) ||
        (p.typeId.startsWith('casement-') && p.x === 10 && p.z === 18 && p.y === 3),
    ),
    links: castleCircuits(castle()),
  },
  {
    id: 'manor',
    base: { size: 48, color: 'vert' },
    plates: [
      { from: 0, side: 'z+', size: 16, color: 'vert' },
      { from: 1, side: 'x+', size: 16, color: 'sable' },
      { from: 2, side: 'x+', size: 16, color: 'vert' },
      { from: 1, side: 'z+', size: 16, color: 'gris' },
      { from: 4, side: 'x+', size: 16, color: 'gris' },
      { from: 5, side: 'x+', size: 16, color: 'gris' },
    ],
    pieces: manor().pieces,
    opened: indicesOf(
      manor().pieces,
      (p) =>
        p.typeId.startsWith('door-') ||
        p.typeId.startsWith('garage-') ||
        (p.typeId.startsWith('casement-') && p.z === 27 && p.y === 3 && (p.x === 15 || p.x === 25)) ||
        (p.typeId.startsWith('casement-') && p.y === 22 && p.z === 18 && (p.x === 10 || p.x === 33)) ||
        (p.typeId.startsWith('casement-') && p.x === 10 && p.z === 18 && p.y === 3),
    ),
    links: manorCircuits(manor().pieces, manor().cars),
  },
  {
    id: 'bridge',
    base: { size: 32, color: 'vert' },
    plates: [
      { from: 0, side: 'x+', size: 32, color: 'bleu' },
      { from: 1, side: 'x+', size: 32, color: 'vert' },
    ],
    pieces: bridge().pieces,
    links: bridgeCircuits(bridge().pieces, bridge().cars),
  },
  { id: 'car', base: { size: 16, color: 'gris' }, pieces: car(), links: carCircuit(car()), opened: indicesOf(car(), (p) => p.typeId.startsWith('tailgate-') || (p.typeId.startsWith('cardoor-') && p.x === 7 && p.z === 4)) },
  { id: 'truck', base: { size: 32, color: 'gris' }, pieces: truck(), links: truckCircuit(truck()), opened: indicesOf(truck(), (p) => p.typeId.startsWith('tailgate-') || (p.typeId.startsWith('cardoor-') && p.z === 12)) },
];

/** Les modèles, du plus petit au plus grand nombre de pièces. */
export const EXAMPLES: readonly ExampleModel[] = MODELS.sort((a, b) => a.pieces.length - b.pieces.length);

/** Construit la partie d'un modèle en posant ses pièces une à une. Lève une erreur si une pose est refusée (cela ne doit jamais arriver). */
export function buildExampleGame(model: ExampleModel, now: () => number = () => Date.now()): Game {
  const game = new Game(model.base.size, model.base.size, model.base.color, now);
  for (const plate of model.plates ?? []) {
    const out = game.addPlate(plate.from, plate.side, plate.size, plate.color);
    if (!out.ok) throw new Error(`Modèle « ${model.id} » : plaque refusée (${out.reason})`);
  }
  for (const spec of model.pieces) {
    const out = game.place(spec);
    if (!out.ok) throw new Error(`Modèle « ${model.id} » : pose refusée (${out.reason}) pour ${spec.typeId} en (${spec.x}, ${spec.y}, ${spec.z})`);
  }
  // Les pièces reçoivent leurs identifiants dans l'ordre de pose, à partir de 1.
  for (const index of model.opened ?? []) game.toggleOpening(index + 1);
  for (const [sw, lamps] of model.links ?? []) for (const lamp of lamps) game.toggleLink(sw + 1, lamp + 1);
  // L'historique du modèle n'est pas celui du joueur : on repart d'un journal vierge.
  game.journal.clear();
  return game;
}
