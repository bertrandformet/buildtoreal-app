// Création de la notice depuis une partie : calcul, vérification par rejeu, images, page HTML.

import type { Game } from '../core/game';
import { buildNotice, noticePlates, replayNotice, sameConstruction, type Notice } from '../core/notice';
import { buildNoticeHtml } from '../export/noticeHtml';
import { NoticeRenderer } from '../render/noticeRenderer';

export interface NoticeBundle {
  readonly notice: Notice;
  readonly html: string;
  /** Vrai si la notice, rejouée dans un modèle vide, redonne exactement la construction. */
  readonly verified: boolean;
  readonly errors: readonly string[];
}

const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
/** Largeur des vignettes de la frise, en pixels (assez pour un écran de téléphone à 3×). */
const THUMB_WIDTH = 260;

/** Réduit une image (URL de données) à une vignette JPEG. Sans canvas (tests), on renvoie l'image telle quelle. */
async function shrink(dataUrl: string, width: number): Promise<string> {
  if (typeof document === 'undefined') return dataUrl;
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const scale = Math.min(1, width / img.naturalWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.72);
}

export async function createNotice(game: Game, onProgress: (done: number, total: number) => void): Promise<NoticeBundle> {
  const notice = buildNotice(game.model, game.baseColor);
  const replay = replayNotice(notice);
  const verified = replay.ok && sameConstruction(replay.model, game.model);

  const plates = noticePlates(notice);
  const renderer = new NoticeRenderer();
  try {
    const previous: Array<(typeof notice.steps)[number]['pieces'][number]> = [];
    const steps: string[] = [];
    const total = notice.steps.length;
    // Plaques posées au fil des étapes : la première d'emblée, les autres à leur étape (toutes d'emblée pour une ancienne notice).
    const staged = notice.steps.some((s) => s.plate !== undefined);
    const placed = staged ? plates.slice(0, 1) : [...plates];
    for (let i = 0; i < total; i++) {
      onProgress(i, total);
      await nextTick();
      const step = notice.steps[i]!;
      if (step.plate !== undefined) {
        placed.push(plates[step.plate]!);
        steps.push(renderer.renderStep(placed, previous, [], undefined, placed.length - 1));
        continue;
      }
      steps.push(renderer.renderStep(placed, previous, step.pieces));
      previous.push(...step.pieces);
    }
    onProgress(total, total);
    await nextTick();
    const cover = renderer.renderStep(plates, [], previous, 45);
    const thumbs: string[] = [];
    for (const src of [cover, ...steps]) thumbs.push(await shrink(src, THUMB_WIDTH));
    const html = buildNoticeHtml(notice, { cover, steps, thumbs }, verified);
    return { notice, html, verified, errors: replay.errors };
  } finally {
    renderer.dispose();
  }
}
