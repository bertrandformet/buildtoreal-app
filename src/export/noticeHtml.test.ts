import { describe, expect, it } from 'vitest';
import { Game } from '../core/game';
import { buildNotice, constructionKey, parseNoticeJson, replayNotice } from '../core/notice';
import { buildDenseReference, buildReferenceMultiLevel, buildReferenceSimple } from '../core/reference';
import { buildNoticeHtml, extractNoticeJson } from './noticeHtml';

// Pixel JPEG minimal valide en base64 (le contenu de l'image n'importe pas pour ces tests).
const PIXEL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

function refs(): Array<[string, Game]> {
  const a = new Game(16, 16, 'vert');
  buildReferenceSimple(a);
  const b = new Game(32, 32, 'gris');
  buildDenseReference(b, 200, 11);
  const c = new Game(24, 24, 'sable');
  buildReferenceMultiLevel(c);
  return [['simple', a], ['dense', b], ['multi-niveaux', c]];
}

describe.each(refs())('notice exportée « %s »', (_name, game) => {
  const notice = buildNotice(game.model, game.baseColor);
  const html = buildNoticeHtml(notice, { cover: PIXEL, steps: notice.steps.map(() => PIXEL) }, true);

  it('contient une page par étape plus la couverture', () => {
    expect((html.match(/class="page step"/g) ?? []).length).toBe(notice.steps.length);
    expect((html.match(/class="page cover"/g) ?? []).length).toBe(1);
  });

  it('se reconstruit exactement depuis le seul fichier HTML (zéro différence)', () => {
    const json = extractNoticeJson(html);
    expect(json).not.toBeNull();
    const parsed = parseNoticeJson(json!);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const replay = replayNotice(parsed.notice);
    expect(replay.errors).toEqual([]);
    expect(constructionKey(replay.model)).toBe(constructionKey(game.model));
  });

  it('nomme les couleurs en toutes lettres (lisible en noir et blanc)', () => {
    expect(html).toMatch(/<b>(Rouge|Orange|Jaune|Vert|Bleu|Blanc|Gris|Noir|Rose|Violet|Turquoise|Bleu marine|Marron|Sable|Bleu ciel|Anthracite)<\/b>/);
  });

  it('numérote les pages, couverture comprise', () => {
    expect(html).toContain(`Page 1 sur ${notice.steps.length + 1}`);
    expect(html).toContain(`Page ${notice.steps.length + 1} sur ${notice.steps.length + 1}`);
  });

  it("propose l'impression à deux pages par feuille, cochée par défaut", () => {
    expect(html).toMatch(/<input type="checkbox" id="duo"[^>]* checked>/);
    expect(html).toContain('size:A4 portrait');
    expect(html).toContain('#duo:checked ~ main .step');
  });

  it('embarque la police et le logo (une URL de données non vide, sinon la notice retombe sur la police du système)', () => {
    expect(html).toMatch(/@font-face\{font-family:'Baloo 2';src:url\(data:font\/woff2;base64,[A-Za-z0-9+/=]{1000,}\)/);
    expect(html).toMatch(/\.brand,\.logo-big\{background:url\(data:image\/png;base64,[A-Za-z0-9+/=]{1000,}\)/);
  });

  it("n'embarque aucune balise de script autre que les données", () => {
    // Les données (JSON) et le script fixe du livre, écrit par l'application : jamais de contenu injecté.
    expect((html.match(/<script/g) ?? []).length).toBe(2);
    expect(html).toContain('id="play"');
  });

  it('se lit comme un livre : cadre du livre, page de fin avec l’inventaire, plus de diaporama', () => {
    expect(html).toContain('id="book"');
    expect(html).toContain('window.startBook=start');
    expect((html.match(/class="page end"/g) ?? []).length).toBe(1);
    expect(html).toContain('Bravo, c’est terminé !');
    expect(html).toContain('class="parts cover-parts"');
    expect(html).not.toContain('slidebar');
    // La page de fin et le livre ne s'impriment pas : l'impression reste la notice page par page.
    expect(html).toContain('@media print{#book,.book-btn{display:none!important}');
  });
});

describe('sécurité du HTML exporté', () => {
  const game = new Game(16, 16, 'vert');
  buildReferenceSimple(game);
  const notice = buildNotice(game.model, game.baseColor);

  it('refuse une image qui ne serait pas une URL de données', () => {
    const steps = notice.steps.map(() => PIXEL);
    expect(() => buildNoticeHtml(notice, { cover: 'https://exemple.test/x.jpg', steps }, true)).toThrow();
    expect(() => buildNoticeHtml(notice, { cover: PIXEL, steps: ['"><script>alert(1)</script>', ...steps.slice(1)] }, true)).toThrow();
  });

  it("exige une image par étape", () => {
    expect(() => buildNoticeHtml(notice, { cover: PIXEL, steps: [PIXEL] }, true)).toThrow();
  });
});

describe('frise des étapes', () => {
  const game = new Game(16, 16, 'vert');
  buildReferenceSimple(game);
  const notice = buildNotice(game.model, game.baseColor);
  const steps = notice.steps.map(() => PIXEL);

  it('sans vignettes, pas de frise', () => {
    const html = buildNoticeHtml(notice, { cover: PIXEL, steps }, true);
    expect(html).not.toContain('<nav class="frise"');
    expect(html).not.toContain('<body class="has-frise">');
  });

  it('avec vignettes : un bouton par page, couverture comprise, et la frise ne s’imprime pas', () => {
    const thumbs = [PIXEL, ...steps];
    const html = buildNoticeHtml(notice, { cover: PIXEL, steps, thumbs }, true);
    expect((html.match(/class="th"/g) ?? []).length).toBe(notice.steps.length + 1);
    expect(html).toContain('<nav class="frise"');
    expect(html).toContain('<body class="has-frise">');
    expect(html).toMatch(/\.frise\)?[^{]*\{display:none!important\}|\.frise\{display:none!important\}/);
    expect((html.match(/<script/g) ?? []).length).toBe(2);
  });

  it('refuse un nombre de vignettes qui ne colle pas, et toute vignette qui n’est pas une image en données', () => {
    expect(() => buildNoticeHtml(notice, { cover: PIXEL, steps, thumbs: steps }, true)).toThrow();
    const thumbs = [PIXEL, ...steps];
    thumbs[1] = '"><script>alert(1)</script>';
    expect(() => buildNoticeHtml(notice, { cover: PIXEL, steps, thumbs }, true)).toThrow();
  });
});


describe('notice sur plusieurs plaques', () => {
  const game = new Game(16, 16, 'vert');
  game.addPlate(0, 'x+', 24, 'gris');
  game.place({ typeId: 'brick-2x2', color: 'rouge', x: 20, y: 0, z: 4, orient: 0 });
  const notice = buildNotice(game.model, game.baseColor);
  const html = buildNoticeHtml(notice, { cover: PIXEL, steps: notice.steps.map(() => PIXEL) }, true);

  it('l’ajout d’une plaque est une étape, avec sa carte', () => {
    expect((html.match(/class="page step plate-step"/g) ?? []).length).toBe(1);
    expect(html).toContain('Ajoute une plaque');
    expect(html).toContain('Plaque de base 24×24');
  });

  it('l’inventaire liste les plaques de base', () => {
    expect(html).toContain('Plaques de base');
  });
});
