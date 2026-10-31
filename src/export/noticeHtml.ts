// Page HTML autonome de la notice : une page par étape, imprimable (le PDF passe par l'impression du navigateur).
// Style « ludique » : contours noirs, pastille jaune pour le numéro d'étape, cartes de pièces. Police Baloo 2 (la même que le logo) intégrée au fichier.
// Générée uniquement depuis des données validées (`Notice`) et des textes de l'application : rien n'est injecté tel quel.
// Les données de la notice sont embarquées, pour pouvoir reconstruire la construction depuis le seul fichier.

import { colorHex, finishOf, requireType } from '../core/catalogue';
import { noticePieceCount, noticePlates, partsOf, serializeNotice, type Notice, type PartLine } from '../core/notice';
import type { BasePlate } from '../core/model';
import balooFont from '../assets/baloo2-latin.woff2?inline';
import logoPng from '../assets/logo.png?inline';
import { colorLabel } from '../i18n/colorLabel';
import { typeName } from '../i18n/typeLabel';
import { t, type Key } from '../i18n/fr';
import { bookScript, bookStyle } from './bookScript';
import { partIconSvg } from './partIcon';

export interface NoticeImages {
  /** Image de couverture (construction terminée), en URL de données JPEG. */
  readonly cover: string;
  /** Une image par étape, dans l'ordre. */
  readonly steps: readonly string[];
  /**
   * Petites images pour la frise des étapes : la couverture, puis une par étape (donc une de plus que `steps`).
   * Sans elles, la notice n'a pas de frise.
   */
  readonly thumbs?: readonly string[];
}

const DATA_URL = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/;
const FONT_URL = /^data:[a-z0-9/+.-]*;base64,[A-Za-z0-9+/=]+$/;
const LOGO_URL = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

function kindName(line: PartLine): string {
  const type = requireType(line.typeId);
  return typeName(type);
}

/** Cartes de pièces : quantité, vignette vue de dessus, type, puis la couleur en toutes lettres (lisible en noir et blanc). */
function partsList(lines: readonly PartLine[], extraClass = ''): string {
  const items = lines.map(
    (l) =>
      `<li class="part"><span class="qty">${l.count} ×</span>${partIconSvg(l.typeId, colorHex(l.color), finishOf(l.color))}<span class="name">${esc(kindName(l))}<br><b>${esc(colorLabel(l.color))}</b></span></li>`,
  );
  return `<ul class="parts${extraClass ? ` ${extraClass}` : ''}">${items.join('')}</ul>`;
}

const PLATE_HEX: Readonly<Record<string, string>> = { vert: '#4c9a5f', gris: '#9aa0a6', bleu: '#5b86c7', sable: '#d9c7a0' };

/** Vignette d'une plaque de base : un carré à tenons, de la même taille quelle que soit la plaque (la taille est écrite). */
function plateIcon(plate: BasePlate): string {
  const hex = PLATE_HEX[plate.color] ?? '#4c9a5f';
  const dots: string[] = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) dots.push(`<circle cx="${8 + i * 9}" cy="${8 + j * 9}" r="2.6" fill="rgba(0,0,0,.18)"/>`);
  return `<svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true"><rect x=".5" y=".5" width="43" height="43" rx="4" fill="${hex}" stroke="rgba(0,0,0,.3)"/>${dots.join('')}</svg>`;
}

/** Cartes des plaques de base, regroupées par taille et couleur. */
function platesList(plates: readonly BasePlate[], extraClass = ''): string {
  const counts = new Map<string, { plate: BasePlate; count: number }>();
  for (const p of plates) {
    const key = `${p.w}x${p.l}|${p.color}`;
    counts.set(key, { plate: p, count: (counts.get(key)?.count ?? 0) + 1 });
  }
  const items = [...counts.values()].map(
    ({ plate, count }) =>
      `<li class="part"><span class="qty">${count} ×</span>${plateIcon(plate)}<span class="name">${esc(t('notice.basePlate', { w: plate.w, l: plate.l }))}<br><b>${esc(t(`color.${plate.color}` as Key))}</b></span></li>`,
  );
  return `<ul class="parts${extraClass ? ` ${extraClass}` : ''}">${items.join('')}</ul>`;
}

function thumbSrc(src: string): string {
  if (!DATA_URL.test(src)) throw new Error('Vignette de notice invalide : seule une URL de données JPEG ou PNG est admise');
  return src;
}

function image(src: string, alt: string): string {
  if (!DATA_URL.test(src)) throw new Error("Image de notice invalide : seule une URL de données JPEG ou PNG est admise");
  return `<img class="shot" src="${src}" alt="${esc(alt)}">`;
}

function style(): string {
  const font = FONT_URL.test(balooFont) ? balooFont : '';
  const logo = LOGO_URL.test(logoPng) ? logoPng : '';
  return `
@font-face{font-family:'Baloo 2';src:url(${font}) format('woff2');font-weight:500 800;font-style:normal}
:root{color-scheme:light;--ink:#1f2430;--cream:#fff4dc;--sun:#ffd23f;--muted:#4a4f5c}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:var(--cream);color:var(--ink);font-family:'Baloo 2',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-weight:500;line-height:1.3}
main{max-width:1060px;margin:0 auto;padding:14px}
.page{background:var(--cream);margin:0 0 22px;padding:6px 4px 10px;break-inside:avoid}
.head{display:flex;align-items:center;gap:18px;margin:0 0 14px}
.badge{flex:none;width:64px;height:64px;border-radius:50%;background:var(--sun);border:3.5px solid var(--ink);box-shadow:0 5px 0 var(--ink);display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:600}
.titles{flex:1;min-width:0}
.num{font-size:34px;font-weight:600;line-height:1.05}
.of{font-size:17px;color:var(--muted);margin-top:2px}
.brand,.logo-big{background:url(${logo}) center/contain no-repeat}
.brand{flex:none;width:170px;height:43px}
.logo-big{width:360px;height:92px;margin:0 0 10px}
.body{display:grid;grid-template-columns:minmax(0,1fr) 290px;gap:20px;align-items:start}
.card{background:#fff;border:3.5px solid var(--ink);border-radius:26px;box-shadow:0 6px 0 var(--ink);overflow:hidden;margin:0;display:flex;align-items:center;justify-content:center}
.shot{display:block;width:100%;height:auto}
.side h3{margin:0 0 10px;font-size:19px;font-weight:600}
.parts{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px}
.part{display:flex;align-items:center;gap:12px;background:#fff;border:3px solid var(--ink);border-radius:20px;box-shadow:0 4px 0 var(--ink);padding:10px 14px;font-size:17px}
.part .qty{font-size:26px;font-weight:600;min-width:2.1em}
.part svg{flex:none}
.part .name b{font-weight:600}
.tip{margin:14px 0 0;border:3px dashed var(--ink);border-radius:18px;padding:11px 14px;font-size:15px;background:#ffe9a3}
.foot{display:flex;justify-content:space-between;margin-top:16px;font-size:15px;color:var(--muted)}
.title{margin:0 0 4px;font-size:40px;font-weight:600;line-height:1.05}
.meta{margin:0 0 14px;font-size:19px;color:var(--muted)}
.ok{margin:14px 0 0;padding:10px 14px;border:3px solid var(--ink);border-radius:18px;background:#d9f5df;font-size:16px}
.bad{background:#ffd9d6}
.cover h2{margin:20px 0 10px;font-size:22px;font-weight:600}
.cover .parts{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}
@media (max-width:760px){.body{grid-template-columns:minmax(0,1fr)}.badge{width:52px;height:52px;font-size:28px}.num{font-size:28px}.brand{display:none}}
.duo-box{width:22px;height:22px;margin:12px 0 0 16px;vertical-align:middle;accent-color:#2f6fd1}
.duo-label{font-size:15px;font-weight:600;margin-left:8px;vertical-align:middle}
.frise{display:flex;gap:8px;overflow-x:auto;padding:8px 12px;background:var(--cream);border-bottom:3px solid var(--ink);position:sticky;top:0;z-index:5}
.th{flex:none;width:86px;padding:0;border:3px solid var(--ink);border-radius:12px;background:#fff;color:var(--ink);font:inherit;cursor:pointer;overflow:hidden}
.th img{display:block;width:100%;height:56px;object-fit:cover}
.th span{display:block;font-size:13px;font-weight:600;padding:1px 0 3px}
.th.cur{background:var(--sun);box-shadow:0 3px 0 var(--ink)}
@page{size:A4 portrait;margin:8mm}
@media print{
  .duo-box,.duo-label,.frise{display:none!important}
  body{background:var(--cream)}
  main{max-width:none;padding:0}
  .page{margin:0;padding:0}
  .cover{break-after:page;page-break-after:always}
  .cover .logo-big{width:70mm;height:17.8mm;margin-bottom:3mm}
  .cover .title{font-size:26pt}
  .cover .meta{font-size:11pt;margin-bottom:3mm}
  .cover h2{font-size:13pt;margin:4mm 0 2mm}
  .cover .ok{font-size:10pt;padding:6px 10px;margin-top:3mm;border-width:2px}
  .cover .parts{grid-template-columns:repeat(3,1fr);gap:6px}
  .cover .part{font-size:9pt;padding:5px 8px;border-width:2px;border-radius:12px;box-shadow:0 2px 0 var(--ink);gap:7px}
  .cover .part .qty{font-size:13pt}
  .cover .card{border-width:2.5px;border-radius:16px;box-shadow:0 3px 0 var(--ink)}
  .cover .shot{max-height:100mm;width:auto;max-width:100%;margin:0 auto}
  .cover .foot{font-size:8.5pt}
  /* Deux pages par feuille A4 (par défaut) : chaque étape occupe une demi-feuille */
  #duo:checked ~ main .step{height:136mm;overflow:hidden;break-inside:avoid;margin:0 0 5mm}
  #duo:checked ~ main .step:nth-of-type(odd){break-after:page;page-break-after:always;margin-bottom:0}
  #duo:checked ~ main .step .head{margin-bottom:3mm;gap:4mm}
  #duo:checked ~ main .step .body{grid-template-columns:minmax(0,1fr) 62mm;gap:5mm}
  #duo:checked ~ main .step .badge{width:13mm;height:13mm;font-size:20pt;border-width:2.5px;box-shadow:0 3px 0 var(--ink)}
  #duo:checked ~ main .step .num{font-size:20pt}
  #duo:checked ~ main .step .of{font-size:9pt}
  #duo:checked ~ main .step .brand{width:31mm;height:8mm}
  #duo:checked ~ main .step .card{border-width:2.5px;border-radius:16px;box-shadow:0 3px 0 var(--ink)}
  #duo:checked ~ main .step .shot{max-height:84mm;width:auto;max-width:100%;margin:0 auto}
  #duo:checked ~ main .step .side h3{font-size:11pt;margin-bottom:5px}
  #duo:checked ~ main .step .parts{gap:6px}
  #duo:checked ~ main .step .part{font-size:9pt;padding:5px 8px;border-width:2px;border-radius:12px;box-shadow:0 2px 0 var(--ink);gap:7px}
  #duo:checked ~ main .step .part .qty{font-size:13pt}
  #duo:checked ~ main .step .tip{font-size:8.5pt;padding:6px 8px;border-width:2px;margin-top:8px}
  #duo:checked ~ main .step .foot{font-size:8.5pt;margin-top:3mm}
  /* Une page par feuille */
  #duo:not(:checked) ~ main .step{break-after:page;page-break-after:always}
  #duo:not(:checked) ~ main .step .body{grid-template-columns:minmax(0,1fr)}
  #duo:not(:checked) ~ main .step .shot{max-height:150mm;width:auto;max-width:100%;margin:0 auto}
}
`;
}


/** Assemble la page de la notice. Lève une erreur si une image n'est pas une URL de données JPEG/PNG. */
export function buildNoticeHtml(notice: Notice, images: NoticeImages, verified: boolean): string {
  if (images.steps.length !== notice.steps.length) throw new Error("Une image par étape est nécessaire");
  if (images.thumbs && images.thumbs.length !== notice.steps.length + 1) throw new Error('Une vignette par étape, plus celle de la couverture, est nécessaire');
  const all = notice.steps.flatMap((s) => s.pieces);
  // Plusieurs plaques : elles sont listées comme des pièces (une seule : elle va de soi, la notice ne change pas).
  const plates = noticePlates(notice);
  const basePlates = plates.length > 1;
  const total = notice.steps.length;
  const pages = total + 1;
  const pieces = noticePieceCount(notice);
  const brand = esc(t('app.title'));
  const foot = (page: number) =>
    `<footer class="foot"><span>${esc(t('notice.footer', { pieces }))}</span><span>${esc(t('notice.page', { n: page, total: pages }))}</span></footer>`;

  // Frise des étapes : une petite image par page (couverture comprise). Elle ne s'imprime pas.
  const thumbHtml = (src: string, label: string, alt: string, k: number) =>
    `<button type="button" class="th" data-i="${k}"><img src="${thumbSrc(src)}" alt="${esc(alt)}"><span>${esc(label)}</span></button>`;
  const frise = images.thumbs
    ? `<nav class="frise" aria-label="${esc(t('notice.friseLabel'))}">${images.thumbs
        .map((src, k) => (k === 0 ? thumbHtml(src, t('notice.friseCover'), t('notice.finalAlt'), 0) : thumbHtml(src, String(k), t('notice.stepAlt', { n: k }), k)))
        .join('')}</nav>\n`
    : '';

  const cover = `<section class="page cover">
<div class="logo-big" role="img" aria-label="${brand}"></div>
<h1 class="title">${esc(t('notice.title'))}</h1>
<p class="meta">${esc(t('notice.stats', { pieces, steps: total }))}</p>
<figure class="card">${image(images.cover, t('notice.finalAlt'))}</figure>
<p class="ok${verified ? '' : ' bad'}">${esc(t(verified ? 'notice.verified' : 'notice.notVerified'))}</p>
<h2>${esc(t('notice.allParts'))}</h2>
${partsList(partsOf(all), 'cover-parts')}
${basePlates ? `<h2 class="cover-parts">${esc(t('notice.basePlates'))}</h2>\n${platesList(plates, 'cover-parts')}` : ''}
${foot(1)}
</section>`;

  // Dernière page du livre (pas de l'impression) : la construction finie et l'inventaire complet des pièces.
  const end = `<section class="page end">
<h1>${esc(t('notice.endTitle'))}</h1>
<figure class="card">${image(images.cover, t('notice.finalAlt'))}</figure>
<h2>${esc(t('notice.allParts'))}</h2>
${partsList(partsOf(all))}
${basePlates ? `<h2>${esc(t('notice.basePlates'))}</h2>\n${platesList(plates)}` : ''}
</section>`;

  const steps = notice.steps.map(
    (step, i) => `<section class="page step${step.plate !== undefined ? ' plate-step' : ''}" id="etape-${i + 1}">
<header class="head"><div class="badge" aria-hidden="true">${i + 1}</div><div class="titles"><div class="num">${esc(t('notice.step', { n: i + 1 }))}</div><div class="of">${esc(t('notice.stepOf', { total }))}</div></div><div class="brand" role="img" aria-label="${brand}"></div></header>
<div class="body">
<figure class="card">${image(images.steps[i]!, t('notice.stepAlt', { n: i + 1 }))}</figure>
<aside class="side"><h3>${esc(t(step.plate !== undefined ? 'notice.plateStep' : 'notice.stepParts'))}</h3>
${step.plate !== undefined ? platesList([plates[step.plate]!]) : partsList(partsOf(step.pieces))}
<p class="tip">${esc(t(step.plate !== undefined ? 'notice.plateTip' : 'notice.tip'))}</p></aside>
</div>
${foot(i + 2)}
</section>`,
  );

  // `<` est échappé pour qu'aucune donnée ne puisse refermer la balise <script>.
  const data = serializeNotice(notice).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t('notice.title'))}</title>
<style>${style()}${bookStyle()}</style>
</head>
<body${images.thumbs ? ' class="has-frise"' : ''}>
<input type="checkbox" id="duo" class="duo-box" checked>
<label for="duo" class="duo-label">${esc(t('notice.duo'))}</label>
<button type="button" id="play" class="book-btn">${esc(t('notice.book'))}</button>
${frise}<div id="book" aria-label="${esc(t('notice.book'))}"><div class="bk-stage"><div class="bk-book"><div class="bk-slot bk-left"></div><div class="bk-slot bk-right"></div></div></div>
<nav class="bk-bar"><button type="button" id="bk-prev">${esc(t('notice.prev'))}</button><span class="count" id="bk-count" data-fmt="${esc(t('notice.slideCount', { n: '{n}', total: '{total}' }))}"></span><button type="button" id="bk-next">${esc(t('notice.next'))}</button><button type="button" id="bk-exit">${esc(t('notice.exitSlides'))}</button></nav></div>
<main>
${cover}
${steps.join('\n')}
${end}
</main>
<script type="application/json" id="notice-data">${data}</script>
<script>${bookScript()}</script>
</body>
</html>
`;
}

/** Retrouve les données embarquées dans un fichier de notice (texte JSON), ou null. */
export function extractNoticeJson(html: string): string | null {
  const m = /<script type="application\/json" id="notice-data">([\s\S]*?)<\/script>/.exec(html);
  return m ? m[1]! : null;
}
