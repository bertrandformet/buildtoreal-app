// Noms lisibles des types de pièces : « Brique », « Pente douce », avec leur taille.

import { openingBricks, type PieceType } from '../core/catalogue';
import { t, type Key } from './fr';

/** Nom de la famille de la pièce, au singulier : « Brique », « Plaque », « Tuile », « Pente », « Pente douce », « Pente d'angle » ; « Roues », « Petite roue »… */
export function typeLabel(type: PieceType): string {
  if (type.wheel) return t(`piece.${type.id}` as Key);
  if (type.shape === 'round') return t(type.kind === 'plate' ? 'piece.roundplate' : 'piece.column');
  if (type.shape === 'switch') return t('piece.switch');
  if (type.shape === 'door') return t(type.l >= 6 ? 'piece.door.double' : 'piece.door');
  if (type.shape === 'casement') return t(type.l >= 6 ? 'piece.window.double' : 'piece.window');
  if (type.shape === 'cardoor') return t(type.mirror ? 'piece.cardoor.left' : 'piece.cardoor');
  if (type.shape === 'tailgate') return t('piece.tailgate');
  if (type.shape === 'garage') return t('piece.garage');
  const key = type.shape === 'box' ? type.kind : type.shape === 'steep' ? 'slope' : type.shape;
  return t(`piece.${key}` as Key);
}

function isColumn(type: PieceType): boolean {
  return type.shape === 'round' && type.kind === 'brick';
}

/** Hauteur d'un cylindre, en briques. */
function columnBricks(type: PieceType): number {
  return type.h / 3;
}

/**
 * « Brique 2×4 », « Pente douce 2×3 ». Une pièce à roues donne la taille de son support : « Roues 2×4 » ;
 * un cylindre, sa hauteur en briques : « Cylindre 1×3 » (trois briques de haut) ; une plaque ronde, sa taille : « Plaque ronde 2×2 ».
 */
export function typeName(type: PieceType): string {
  const l = type.wheel ? type.wheel.holderL : isColumn(type) ? columnBricks(type) : type.l;
  if (type.kind === 'opening') return `${typeLabel(type)} ${type.w}×${type.l}, ${t('opening.height', { n: openingBricks(type) })}`;
  return `${typeLabel(type)} ${type.w}×${l}`;
}

/** Légende d'une vignette de taille : « 2×4 » ; une pente douce ou d'angle le précise, car elle partage sa taille avec une pente raide. */
export function sizeText(type: PieceType): string {
  if (type.wheel) return t(`piece.${type.id}.short` as Key);
  if (type.shape === 'switch') return t('piece.switch.short');
  if (type.kind === 'opening') return `${t(`piece.${type.shape === 'casement' ? 'window' : type.shape}${type.l >= 6 && (type.shape === 'door' || type.shape === 'casement') ? '.double' : ''}.short` as Key)} ${type.w}×${type.l} h${openingBricks(type)}`;
  if (isColumn(type)) return t('piece.column.short', { n: columnBricks(type) });
  if (type.shape === 'round') return t('piece.roundplate.short', { size: `${type.w}×${type.l}` });
  const size = `${type.w}×${type.l}`;
  if (type.shape === 'gentle') return `${size} ${t('piece.gentle.short')}`;
  if (type.shape === 'corner') return `${size} ${t('piece.corner.short')}`;
  return size;
}
