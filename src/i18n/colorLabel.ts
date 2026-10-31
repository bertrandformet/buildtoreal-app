// Nom lisible d'une couleur de pièce, avec sa finition : « Bleu ciel », « Bleu ciel transparent », « Rose givré », « Jaune lumineux ».

import { baseColorId, finishOf } from '../core/catalogue';
import { t, type Key } from './fr';

const FINISH_WORD = { clear: 'finish.word', frost: 'finish.frostWord', glow: 'finish.glowWord' } as const;

export function colorLabel(id: string): string {
  const base = t(`color.${baseColorId(id)}` as Key);
  const finish = finishOf(id);
  return finish === 'opaque' ? base : `${base} ${t(FINISH_WORD[finish])}`;
}
