// Générateur pseudo-aléatoire (graine fixe) et construction de référence dense, produite par script.

import { COLORS, footprintSize, normalizeOrient, requireType } from './catalogue';
import { Game } from './game';
import { landingLevel } from './rules';

/** mulberry32 : petit générateur déterministe. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: () => number, n: number): number {
  return Math.floor(rng() * n);
}

/**
 * Pose jusqu'à `count` pièces valides, déposées « de haut » sur des emplacements aléatoires.
 * Retourne le nombre de pièces effectivement posées.
 */
/**
 * Pièces de la construction de référence, figées : ajouter des pièces au catalogue ne doit pas changer la référence
 * (elle sert aussi aux mesures de performance, qu'on compare d'une version à l'autre).
 */
const REFERENCE_TYPES: readonly string[] = [
  'brick-1x1', 'brick-1x2', 'brick-1x4', 'brick-2x2', 'brick-2x3', 'brick-2x4', 'brick-2x6',
  'column-1', 'column-2', 'column-3', 'column-4',
  'plate-1x1', 'plate-1x2', 'plate-1x4', 'plate-1x6', 'plate-2x2', 'plate-2x4', 'plate-2x6', 'plate-4x4', 'plate-6x6',
  'wheels-2x4', 'wheels-2x2', 'wheel-2x2', 'bigwheel-2x2',
  'tile-1x2', 'tile-2x2',
  'slope-1x2', 'slope-2x2', 'slope-2x3', 'slope-2x4', 'gentle-2x3', 'gentle-2x4', 'corner-2x2',
];

export function buildDenseReference(game: Game, count: number, seed = 1): number {
  const rng = makeRng(seed);
  const bricks = REFERENCE_TYPES.filter((id) => id.startsWith('brick'));
  let placed = 0;
  let attempts = 0;
  while (placed < count && attempts < count * 60) {
    attempts++;
    // Les briques dominent pour obtenir une construction dense et haute.
    const typeId = rng() < 0.75 ? bricks[randInt(rng, bricks.length)]! : REFERENCE_TYPES[randInt(rng, REFERENCE_TYPES.length)]!;
    const type = requireType(typeId);
    const orient = normalizeOrient(type, randInt(rng, 2));
    const { fx, fz } = footprintSize(type, orient);
    // Concentre les poses au centre de la plaque pour obtenir des chevauchements et des étages.
    const spanX = Math.max(1, Math.min(game.model.baseW - fx + 1, 12));
    const spanZ = Math.max(1, Math.min(game.model.baseL - fz + 1, 12));
    const x = Math.floor((game.model.baseW - fx - spanX + 1) / 2) + randInt(rng, spanX);
    const z = Math.floor((game.model.baseL - fz - spanZ + 1) / 2) + randInt(rng, spanZ);
    const y = landingLevel(game.model, typeId, orient, x, z);
    const color = COLORS[randInt(rng, COLORS.length)]!.id;
    const outcome = game.place({ typeId, color, x, y, z, orient });
    if (outcome.ok) placed++;
  }
  // Les essais refusés ne doivent pas fausser le journal d'une construction de référence.
  game.journal.clear();
  return placed;
}

/** Dépose une pièce sur la colonne visée (au niveau de chute) ou à un niveau donné ; lève une erreur si la pose est refusée. */
function drop(game: Game, typeId: string, color: string, x: number, z: number, orient = 0, y?: number): void {
  const level = y ?? landingLevel(game.model, typeId, orient, x, z);
  const out = game.place({ typeId, color, x, y: level, z, orient });
  if (!out.ok) throw new Error(`Construction de référence invalide : ${typeId} en ${x},${level},${z} (${out.reason})`);
}

/** Construction de référence 1 : simple, deux ou trois couches (une quinzaine de pièces). Plaque 16×16 conseillée. */
export function buildReferenceSimple(game: Game): void {
  drop(game, 'brick-2x4', 'rouge', 4, 4);
  drop(game, 'brick-2x4', 'bleu', 6, 4);
  drop(game, 'brick-2x4', 'jaune', 4, 8);
  drop(game, 'brick-2x2', 'blanc', 4, 4);
  drop(game, 'brick-1x2', 'vert', 6, 5);
  drop(game, 'brick-2x2', 'orange', 6, 7);
  drop(game, 'brick-1x4', 'noir', 4, 8, 1);
  drop(game, 'plate-2x4', 'gris', 4, 4, 1);
  drop(game, 'plate-2x2', 'rouge', 4, 6);
  drop(game, 'tile-2x2', 'jaune', 4, 4);
  drop(game, 'brick-1x1', 'bleu', 7, 4);
  drop(game, 'brick-1x1', 'bleu', 7, 5);
  drop(game, 'plate-1x2', 'vert', 6, 8);
}

/** Construction de référence 3 : plusieurs niveaux, appuis partagés, porte-à-faux et pièces glissées sous un surplomb. Plaque 24×24 conseillée. */
export function buildReferenceMultiLevel(game: Game): void {
  for (const [x, z] of [[4, 4], [9, 4], [4, 9], [9, 9]] as const) {
    drop(game, 'brick-1x1', 'gris', x, z);
    drop(game, 'brick-1x1', 'gris', x, z);
  }
  // Deux tabliers parallèles, chacun posé sur deux piliers.
  drop(game, 'plate-1x6', 'rouge', 4, 4, 1);
  drop(game, 'plate-1x6', 'rouge', 4, 9, 1);
  // Tablier transversal : appuyé sur les deux tabliers, avec porte-à-faux entre eux.
  drop(game, 'plate-1x6', 'bleu', 4, 4);
  drop(game, 'plate-1x6', 'bleu', 9, 4);
  // Étage au-dessus, qui s'appuie sur plusieurs pièces à la fois.
  drop(game, 'brick-2x4', 'jaune', 4, 4);
  drop(game, 'brick-2x2', 'vert', 8, 4);
  drop(game, 'plate-2x4', 'blanc', 4, 4);
  drop(game, 'tile-2x2', 'orange', 4, 4);
  // Pièces glissées sous le tablier, après coup : elles doivent précéder le tablier dans la notice.
  drop(game, 'brick-1x2', 'noir', 6, 4, 0, 0);
  drop(game, 'brick-1x2', 'vert', 6, 9, 0, 0);
  drop(game, 'brick-1x2', 'vert', 6, 9, 0, 3);
}
