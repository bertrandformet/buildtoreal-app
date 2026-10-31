// Petite vignette SVG d'une pièce vue de dessus, à plat (2D) : emprise et tenons centrés. Chaîne de caractères : utilisable sans DOM.

import { TIRE_COLOR, colorHex, flatRows, holderRows, requireType, studCells, type Finish, type PieceType } from '../core/catalogue';

const PITCH = 9;
const MARGIN = 3;

/** Luminance approximative d'une couleur #rrggbb (0 = noir, 1 = blanc). */
function luminance(hex: string): number {
  const v = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255;
  return 0.2126 * v(1) + 0.7152 * v(3) + 0.0722 * v(5);
}

/**
 * Finition, reconnaissable aussi en noir et blanc : transparente = pâle et rayée en diagonale, givrée = pâle et piquetée,
 * lumineuse = entourée d'une auréole de sa couleur.
 */
export function partIconSvg(typeId: string, hex: string, finish: Finish = 'opaque'): string {
  const type = requireType(typeId);
  const clear = finish === 'clear';
  const pale = clear || finish === 'frost';
  if (type.shape === 'round' && type.kind === 'brick') return columnIconSvg(type.h / 3, hex, pale, finish === 'glow');
  if (type.kind === 'opening') return openingIconSvg(type, hex, pale, finish === 'glow');
  // Une pièce lumineuse a une marge de plus, pour son auréole.
  const glow = finish === 'glow' ? 3 : 0;
  const pw = type.l * PITCH + 2 * MARGIN;
  const ph = type.w * PITCH + 2 * MARGIN;
  // Tenons : plus sombres que la pièce, ou plus clairs si la pièce est elle-même sombre.
  const studFill = luminance(hex) < 0.2 ? 'rgba(255,255,255,.42)' : 'rgba(0,0,0,.2)';
  const studs: string[] = [];
  // La pièce est dessinée dans son orientation de base : le grand côté à l'horizontale, la pente descendant vers la droite.
  // Une case locale (a, b) devient la colonne b et la ligne a ; les cases de la pièce sont données avec les mêmes axes.
  for (const { dx, dz } of studCells(type, 0)) {
    studs.push(`<circle cx="${MARGIN + PITCH / 2 + dz * PITCH}" cy="${MARGIN + PITCH / 2 + dx * PITCH}" r="2.9" fill="${studFill}"/>`);
  }
  // Partie en pente : un voile clair et des chevrons dans le sens de la descente.
  const slope: string[] = [];
  const chevron = (col: number, row: number, angle: number) =>
    `<path d="M-1.8 -2.4L1.8 0L-1.8 2.4" fill="none" stroke="rgba(0,0,0,.38)" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" transform="translate(${MARGIN + PITCH / 2 + col * PITCH} ${MARGIN + PITCH / 2 + row * PITCH}) rotate(${angle})"/>`;
  const veil = (col: number, row: number, cols: number, rows: number) =>
    `<rect x="${MARGIN + col * PITCH}" y="${MARGIN + row * PITCH}" width="${cols * PITCH}" height="${rows * PITCH}" fill="rgba(255,255,255,.3)"/>`;
  if (type.shape === 'steep' || type.shape === 'gentle') {
    const flat = flatRows(type);
    slope.push(veil(flat, 0, type.l - flat, type.w));
    for (let col = flat; col < type.l; col++) for (let row = 0; row < type.w; row++) slope.push(chevron(col, row, 0));
  } else if (type.shape === 'corner') {
    slope.push(veil(1, 0, 1, 2), veil(0, 1, 1, 1));
    slope.push(chevron(1, 0, 0), chevron(0, 1, 90), chevron(1, 1, 45));
  }
  // Une tuile est lisse : un simple liseré intérieur la distingue d'une plaque à tenons.
  const smooth = type.studs ? '' : `<rect x="3" y="3" width="${pw - 6}" height="${ph - 6}" rx="2" fill="none" stroke="rgba(0,0,0,.2)" stroke-width="1"/>`;
  const hatch: string[] = [];
  if (clear) {
    for (let x = -ph; x < pw; x += 6) hatch.push(`<line x1="${x}" y1="${ph}" x2="${x + ph}" y2="0" stroke="rgba(255,255,255,.85)" stroke-width="1.5"/>`);
  } else if (finish === 'frost') {
    for (let y = 3; y < ph - 2; y += 4) {
      for (let x = 3 + ((y / 4) % 2) * 2; x < pw - 2; x += 4) hatch.push(`<circle cx="${x}" cy="${y}" r=".8" fill="rgba(255,255,255,.9)"/>`);
    }
  }
  // Interrupteur : sa manette noire, penchée.
  const lever =
    type.shape === 'switch'
      ? `<rect x="${pw / 2 - 1.5}" y="${MARGIN}" width="3" height="${ph - 2 * MARGIN}" rx="1.5" fill="${colorHex(TIRE_COLOR)}" transform="rotate(35 ${pw / 2} ${ph / 2})"/><circle cx="${pw / 2}" cy="${ph / 2}" r="2.6" fill="${colorHex(TIRE_COLOR)}"/>`
      : '';
  // Porte ou fenêtre : le vide du cadre au milieu, avec une poignée noire (porte) ou une vitre bleutée (fenêtre).
  const opening =
    type.shape === 'door' || type.shape === 'casement'
      ? `<rect x="${MARGIN + PITCH}" y="${MARGIN + 1}" width="${(type.l - 2) * PITCH}" height="${ph - 2 * MARGIN - 2}" rx="1.5" fill="${type.shape === 'door' ? 'rgba(255,255,255,.55)' : 'rgba(150,200,240,.8)'}" stroke="rgba(0,0,0,.35)"/>` +
        (type.shape === 'door' ? `<circle cx="${MARGIN + (type.l - 1) * PITCH - 5}" cy="${ph / 2}" r="2.2" fill="${colorHex(TIRE_COLOR)}"/>` : '')
      : '';
  // Pièce à roues : le support seul est de la couleur choisie ; un pneu noir occupe chaque rang de roue.
  let x0 = 0.5;
  let bw = pw - 1;
  const tires: string[] = [];
  if (type.wheel) {
    const { from, to } = holderRows(type);
    x0 = MARGIN + from * PITCH + 0.5;
    bw = (to - from) * PITCH - 1;
    const wheelCols = type.wheel.sides === 2 ? [0, type.l - 1] : [type.l - 1];
    const tw = PITCH - 1;
    const th = (type.wheel.d / 5) * type.w * PITCH;
    for (const col of wheelCols) {
      const x = MARGIN + col * PITCH + (PITCH - tw) / 2;
      tires.push(`<rect x="${x}" y="${(ph - th) / 2}" width="${tw}" height="${th}" rx="2.5" fill="${colorHex(TIRE_COLOR)}"/>`);
    }
  }
  // Plaque ronde : un disque (rayon d'angle à la moitié du côté).
  const rx = type.shape === 'round' ? (ph - 1) / 2 : 3;
  const body = pale
    ? `<rect x="${x0}" y=".5" width="${bw}" height="${ph - 1}" rx="${rx}" fill="#fff"/><rect x="${x0}" y=".5" width="${bw}" height="${ph - 1}" rx="${rx}" fill="${hex}" fill-opacity=".55" stroke="rgba(0,0,0,.3)"/>`
    : `<rect x="${x0}" y=".5" width="${bw}" height="${ph - 1}" rx="${rx}" fill="${hex}" stroke="rgba(0,0,0,.3)"/>`;
  const halo = glow
    ? `<rect x="${x0 - glow + 1}" y="${-glow + 1}" width="${bw + 2 * glow - 2}" height="${ph + 2 * glow - 2}" rx="${rx + glow}" fill="none" stroke="${hex}" stroke-opacity=".45" stroke-width="${glow}"/>`
    : '';
  const view = `${-glow} ${-glow} ${pw + 2 * glow} ${ph + 2 * glow}`;
  return `<svg width="${pw + 2 * glow}" height="${ph + 2 * glow}" viewBox="${view}" aria-hidden="true">${halo}${tires.join('')}${body}${hatch.join('')}${smooth}${slope.join('')}${studs.join('')}${opening}${lever}</svg>`;
}

/**
 * Porte ou fenêtre, vue de face (et non de dessus) : on reconnaît d'un coup d'œil une porte, avec son battant et sa poignée,
 * d'une fenêtre, avec sa vitre bleue, et leur hauteur. Une brique fait 6 de haut, un tenon 8 de large.
 */
function openingIconSvg(type: PieceType, hex: string, pale: boolean, glow: boolean): string {
  if (type.shape === 'cardoor' || type.shape === 'tailgate' || type.shape === 'garage') return carIconSvg(type, hex, pale, glow);
  const door = type.shape === 'door';
  const unitW = 8;
  const unitH = 2;
  const w = type.l * unitW;
  const h = type.h * unitH;
  const pw = w + 2 * MARGIN;
  const ph = h + 2 * MARGIN + 3;
  const x = MARGIN;
  const y = MARGIN + 3;
  const op = pale ? ' fill-opacity=".55"' : '';
  const sill = door ? 0 : unitH;
  const lintel = door ? 3 * unitH : 2 * unitH;
  const ox = x + unitW;
  const ow = w - 2 * unitW;
  const oy = y + lintel;
  const oh = h - lintel - sill;
  const studs = Array.from({ length: type.l }, (_, i) => `<rect x="${x + i * unitW + 2}" y="${MARGIN}" width="${unitW - 4}" height="3.5" rx="1" fill="${hex}"${op} stroke="rgba(0,0,0,.3)"/>`).join('');
  const frame = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${hex}"${op} stroke="rgba(0,0,0,.3)"/>`;
  // Un vide de quatre tenons ou plus a deux battants : on les dessine, avec leur ligne de jonction.
  const double = type.l >= 6;
  const half = ow / (double ? 2 : 1);
  const leaves = Array.from({ length: double ? 2 : 1 }, (_, k) => {
    const lx = ox + k * half;
    return door
      ? `<rect x="${lx}" y="${oy}" width="${half}" height="${oh}" fill="#fff" fill-opacity=".5" stroke="rgba(0,0,0,.35)"/><circle cx="${double ? (k === 0 ? lx + half - 3 : lx + 3) : lx + half - 3}" cy="${oy + oh * 0.5}" r="1.8" fill="${colorHex(TIRE_COLOR)}"/>`
      : `<rect x="${lx}" y="${oy}" width="${half}" height="${oh}" fill="#a9d6f5" stroke="rgba(0,0,0,.35)"/><line x1="${lx}" y1="${oy + oh}" x2="${lx + half}" y2="${oy}" stroke="#fff" stroke-opacity=".8" stroke-width="1.5"/>`;
  });
  const pane = leaves.join('');
  const aura = glow ? `<rect x="${x - 2}" y="${y - 2}" width="${w + 4}" height="${h + 4}" rx="4" fill="none" stroke="${hex}" stroke-opacity=".45" stroke-width="2.5"/>` : '';
  return `<svg width="${pw}" height="${ph}" viewBox="0 0 ${pw} ${ph}" aria-hidden="true">${aura}${studs}${frame}${pane}</svg>`;
}

/**
 * Portière (vue de côté : battant, vitre éventuelle, charnière à l'avant) ou hayon (couvercle dont un coin se relève).
 * Même échelle que les portes de maison.
 */
function carIconSvg(type: PieceType, hex: string, pale: boolean, glow: boolean): string {
  const unitW = 8;
  const unitH = 3;
  const w = type.l * unitW;
  const h = type.h * unitH;
  const pw = w + 2 * MARGIN + 10;
  const ph = h + 2 * MARGIN + 12;
  const x = MARGIN + 5;
  const y = MARGIN + 10;
  const op = pale ? ' fill-opacity=".55"' : '';
  const aura = glow ? `<rect x="${x - 2}" y="${y - 2}" width="${w + 4}" height="${h + 4}" rx="4" fill="none" stroke="${hex}" stroke-opacity=".45" stroke-width="2.5"/>` : '';
  const body = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2.5" fill="${hex}"${op} stroke="rgba(0,0,0,.3)"/>`;
  let extra: string;
  const glazed = type.h >= 9 && type.shape !== 'garage';
  if (type.shape === 'garage') {
    // Porte de garage : une nervure par brique et une flèche vers le haut.
    const ribs = Array.from({ length: type.h / 3 - 1 }, (_, k) => `<line x1="${x + 2}" y1="${y + (k + 1) * 3 * unitH}" x2="${x + w - 2}" y2="${y + (k + 1) * 3 * unitH}" stroke="rgba(0,0,0,.3)" stroke-width="1"/>`).join('');
    extra =
      ribs +
      `<path d="M${x + w / 2} ${y + h - 4} V${y + h - 12} M${x + w / 2 - 4} ${y + h - 8} L${x + w / 2} ${y + h - 13} L${x + w / 2 + 4} ${y + h - 8}" fill="none" stroke="rgba(0,0,0,.5)" stroke-width="1.5" stroke-linecap="round"/>`;
  } else if (type.shape === 'cardoor') {
    extra =
      (glazed ? `<rect x="${x + 4}" y="${y + 3}" width="${w - 8}" height="${h * 0.38}" rx="1.5" fill="#a9d6f5" stroke="rgba(0,0,0,.35)"/>` : '') +
      `<rect x="${x + w - 9}" y="${y + h - 7}" width="6" height="2.2" rx="1" fill="${colorHex(TIRE_COLOR)}"/>` +
      `<rect x="${type.mirror ? x + w : x - 2.5}" y="${y + 3}" width="2.5" height="${h - 6}" rx="1" fill="rgba(0,0,0,.45)"/>`;
  } else {
    // Hayon : une vitre éventuelle, la charnière en haut et une flèche vers le haut.
    extra =
      (glazed ? `<rect x="${x + 3}" y="${y + 5}" width="${w - 6}" height="${h * 0.4}" rx="1.5" fill="#a9d6f5" stroke="rgba(0,0,0,.35)"/>` : '') +
      `<rect x="${x + 3}" y="${y - 2.5}" width="${w - 6}" height="2.5" rx="1" fill="rgba(0,0,0,.45)"/>` +
      `<path d="M${x + w / 2} ${y + h - 3} V${y + h - 10} M${x + w / 2 - 3.5} ${y + h - 7} L${x + w / 2} ${y + h - 11} L${x + w / 2 + 3.5} ${y + h - 7}" fill="none" stroke="rgba(0,0,0,.5)" stroke-width="1.5" stroke-linecap="round"/>`;
  }
  return `<svg width="${pw}" height="${ph}" viewBox="0 0 ${pw} ${ph}" aria-hidden="true">${aura}${body}${extra}</svg>`;
}

/** Cylindre debout, vu de côté : sa hauteur (en briques) est ce qui le distingue d'une brique 1×1 vue de dessus. */
function columnIconSvg(bricks: number, hex: string, clear: boolean, glow = false): string {
  const w = PITCH + 2;
  const studH = 3;
  const bodyH = 4 + bricks * 7;
  const pw = w + 2 * MARGIN;
  const ph = studH + bodyH + 2 * MARGIN;
  const x = MARGIN;
  const y = MARGIN + studH;
  const opacity = clear ? ' fill-opacity=".55"' : '';
  // Reflet vertical clair : la pièce est ronde.
  return (
    `<svg width="${pw}" height="${ph}" viewBox="0 0 ${pw} ${ph}" aria-hidden="true">` +
    `<rect x="${x + 2}" y="${MARGIN}" width="${w - 4}" height="${studH + 1}" rx="1" fill="${hex}"${opacity} stroke="rgba(0,0,0,.3)"/>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${bodyH}" rx="3" fill="${hex}"${opacity} stroke="rgba(0,0,0,.3)"/>` +
    `<rect x="${x + 2.5}" y="${y + 1.5}" width="2" height="${bodyH - 3}" rx="1" fill="rgba(255,255,255,.45)"/>` +
    (glow ? `<rect x="${x - 2}" y="${y - 2}" width="${w + 4}" height="${bodyH + 4}" rx="5" fill="none" stroke="${hex}" stroke-opacity=".45" stroke-width="2.5"/>` : '') +
    `</svg>`
  );
}
