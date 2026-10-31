// Garde-fou de la palette : les teintes doivent rester distinguables, y compris pour trois types de daltonisme.
// Écart mesuré en CIEDE2000 (au-dessus de ~10, deux teintes se distinguent nettement).

import { describe, expect, it } from 'vitest';
import { BASE_COLORS, COLORS } from './catalogue';

type Vec3 = [number, number, number];

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const delin = (c: number) => {
  const v = Math.max(0, Math.min(1, c));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
};
const toRgb = (hex: string): Vec3 => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as Vec3;

// Machado, Oliveira et Fernandes (2009), sévérité maximale, appliqué en RGB linéaire.
const SIMULATIONS: Record<string, number[][] | null> = {
  normale: null,
  deutéranopie: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  protanopie: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  tritanopie: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};

function simulate(rgb: Vec3, m: number[][] | null): Vec3 {
  if (!m) return rgb;
  const l = rgb.map(lin);
  return m.map((row) => delin(row[0]! * l[0]! + row[1]! * l[1]! + row[2]! * l[2]!)) as Vec3;
}

function lab(rgb: Vec3): Vec3 {
  const [r, g, b] = rgb.map(lin) as Vec3;
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

function deltaE2000(a: Vec3, b: Vec3): number {
  const [L1, a1, b1] = a;
  const [L2, a2, b2] = b;
  const Cm = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1 = Math.hypot(a1p, b1);
  const C2 = Math.hypot(a2p, b2);
  const h1 = (deg(Math.atan2(b1, a1p)) + 360) % 360;
  const h2 = (deg(Math.atan2(b2, a2p)) + 360) % 360;
  const dL = L2 - L1;
  const dC = C2 - C1;
  let dh = 0;
  if (C1 * C2 !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin(rad(dh / 2));
  const Lp = (L1 + L2) / 2;
  const Cp = (C1 + C2) / 2;
  let hp = h1 + h2;
  if (C1 * C2 !== 0) hp = Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
  const T = 1 - 0.17 * Math.cos(rad(hp - 30)) + 0.24 * Math.cos(rad(2 * hp)) + 0.32 * Math.cos(rad(3 * hp + 6)) - 0.2 * Math.cos(rad(4 * hp - 63));
  const dTheta = 30 * Math.exp(-(((hp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cp ** 7 / (Cp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lp - 50) ** 2) / Math.sqrt(20 + (Lp - 50) ** 2);
  const Sc = 1 + 0.045 * Cp;
  const Sh = 1 + 0.015 * Cp * T;
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}

function closestPair(vision: number[][] | null): { d: number; a: string; b: string } {
  const labs = COLORS.map((c) => ({ id: c.id, lab: lab(simulate(toRgb(c.hex), vision)) }));
  let best = { d: Infinity, a: '', b: '' };
  for (let i = 0; i < labs.length; i++) {
    for (let j = i + 1; j < labs.length; j++) {
      const d = deltaE2000(labs[i]!.lab, labs[j]!.lab);
      if (d < best.d) best = { d, a: labs[i]!.id, b: labs[j]!.id };
    }
  }
  return best;
}

// Seuils choisis d'après la palette retenue ; ils empêchent qu'une retouche rapproche deux teintes sans qu'on s'en aperçoive.
const MIN_DELTA: Record<string, number> = { normale: 11, deutéranopie: 5.5, protanopie: 7, tritanopie: 5.4 };

describe('palette de 16 couleurs', () => {
  it('compte 16 teintes aux identifiants et aux couleurs uniques', () => {
    expect(COLORS.length).toBe(16);
    expect(new Set(COLORS.map((c) => c.id)).size).toBe(16);
    expect(new Set(COLORS.map((c) => c.hex.toLowerCase())).size).toBe(16);
    for (const c of COLORS) expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('conserve les identifiants des 8 premières teintes (fichiers déjà enregistrés)', () => {
    expect(COLORS.slice(0, 8).map((c) => c.id)).toEqual(['rouge', 'orange', 'jaune', 'vert', 'bleu', 'blanc', 'gris', 'noir']);
  });

  it.each(Object.entries(SIMULATIONS))('teintes distinguables en vision %s', (name, matrix) => {
    const pair = closestPair(matrix);
    expect(pair.d, `${pair.a} / ${pair.b} : ${pair.d.toFixed(1)}`).toBeGreaterThanOrEqual(MIN_DELTA[name]!);
  });

  it('couleurs de plaque de base distinctes', () => {
    expect(new Set(BASE_COLORS.map((c) => c.hex)).size).toBe(BASE_COLORS.length);
  });
});
