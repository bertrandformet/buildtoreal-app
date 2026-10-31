import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { accentColor, flatRows, footprintSize, holderRows, normalizeOrient, requireType, studCells, type Orient, type PieceType } from '../core/catalogue';

/** Dimensions du monde 3D : 1 unité = 1 tenon. */
export const PLATE_H = 0.4;
export const STUD_R = 0.29;
export const STUD_H = 0.18;
const GAP = 0.03;

const cache = new Map<string, THREE.BufferGeometry>();

/**
 * Hauteur du bord bas d'une pente. Elle doit dépasser celle des tenons de la pièce du dessous (environ 0,16) :
 * sinon ils percent la pente. Avec 0,2, la pente raide fait 45° et la pente douce environ 27°.
 */
export const SLOPE_LOW = 0.2;

/** Hauteur du dessus d'une pente au nœud local (a, b), en unités du monde. `a` : le long du petit côté, `b` : le long de la longueur (la pente descend vers b croissant). */
function slopeHeight(type: PieceType, a: number, b: number, h: number): number {
  if (type.shape === 'corner') return a <= 1 && b <= 1 ? h : h - (h - SLOPE_LOW) * (Math.max(a, b) - 1);
  const flat = flatRows(type);
  return b <= flat ? h : h - ((h - SLOPE_LOW) * (b - flat)) / (type.l - flat);
}

/** Position dans l'emprise (après orientation) d'un point local (a, b) : mêmes quarts de tour que `cellOf`. */
function rotatePoint(type: PieceType, o: Orient, a: number, b: number): [number, number] {
  if (o === 0) return [a, b];
  if (o === 1) return [type.l - b, a];
  if (o === 2) return [type.w - a, type.l - b];
  return [b, type.w - a];
}

/**
 * Corps plein d'une pente : le dessus suit la hauteur de chaque nœud, le dessous et les côtés sont plats.
 * `gap` retire un filet autour de l'emprise, comme pour les blocs, pour que deux pièces voisines se distinguent.
 * Les faces sont à plat (non indexées) et orientées vers l'extérieur.
 */
export function slopeBodyGeometry(typeId: string, orient: number, gap = GAP): THREE.BufferGeometry {
  const type = requireType(typeId);
  const o = normalizeOrient(type, orient);
  const { fx, fz } = footprintSize(type, o);
  const h = type.h * PLATE_H - 0.005;
  const kx = (fx - gap) / fx;
  const kz = (fz - gap) / fz;
  const point = (a: number, b: number, y: number): THREE.Vector3 => {
    const [x, z] = rotatePoint(type, o, a, b);
    return new THREE.Vector3(fx / 2 + (x - fx / 2) * kx, y, fz / 2 + (z - fz / 2) * kz);
  };
  const top = (a: number, b: number) => point(a, b, slopeHeight(type, a, b, h));
  const foot = (a: number, b: number) => point(a, b, 0);
  const positions: number[] = [];
  const centre = new THREE.Vector3(fx / 2, 0, fz / 2);
  const tri = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3, outward: THREE.Vector3) => {
    const n = new THREE.Vector3().crossVectors(q.clone().sub(p), r.clone().sub(p));
    if (n.lengthSq() < 1e-12) return; // triangle aplati (une arête à hauteur nulle)
    const [u, v] = n.dot(outward) >= 0 ? [q, r] : [r, q];
    positions.push(p.x, p.y, p.z, u.x, u.y, u.z, v.x, v.y, v.z);
  };
  const quad = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3, s: THREE.Vector3, outward: THREE.Vector3) => {
    tri(p, q, r, outward);
    tri(p, r, s, outward);
  };
  const up = new THREE.Vector3(0, 1, 0);
  const down = new THREE.Vector3(0, -1, 0);
  const wide = type.w;
  const long = type.l;
  // Dessus, cellule par cellule ; la diagonale part du coin haut de la cellule.
  for (let a = 0; a < wide; a++) {
    for (let b = 0; b < long; b++) {
      tri(top(a, b), top(a + 1, b), top(a + 1, b + 1), up);
      tri(top(a, b), top(a + 1, b + 1), top(a, b + 1), up);
    }
  }
  // Dessous.
  quad(foot(0, 0), foot(wide, 0), foot(wide, long), foot(0, long), down);
  // Côtés : quatre bords, chacun fait de petits panneaux entre le sol et le dessus.
  const side = (p0: [number, number], p1: [number, number]) => {
    const q = [foot(p0[0], p0[1]), foot(p1[0], p1[1]), top(p1[0], p1[1]), top(p0[0], p0[1])] as const;
    const mid = q[0].clone().add(q[1]).multiplyScalar(0.5).sub(centre);
    mid.y = 0;
    quad(q[0], q[1], q[2], q[3], mid);
  };
  for (let a = 0; a < wide; a++) {
    side([a, 0], [a + 1, 0]);
    side([a, long], [a + 1, long]);
  }
  for (let b = 0; b < long; b++) {
    side([0, b], [0, b + 1]);
    side([wide, b], [wide, b + 1]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((positions.length / 3) * 2).fill(0), 2));
  geometry.computeVertexNormals();
  return geometry;
}

/** Ramène des géométries à un format commun (non indexé) et les fusionne ; `groups` : un groupe de matériau par géométrie. */
function mergeAll(parts: THREE.BufferGeometry[], groups = false): THREE.BufferGeometry | null {
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  const merged = mergeGeometries(flat, groups);
  for (const p of parts) p.dispose();
  for (const p of flat) if (!parts.includes(p)) p.dispose();
  return merged;
}

/** Cylindre couché dans l'axe de la longueur (b local), centré en (a, y, b). */
function axleCylinder(r: number, length: number, a: number, y: number, b: number, segments = 28): THREE.BufferGeometry {
  const c = new THREE.CylinderGeometry(r, r, length, segments);
  c.rotateX(Math.PI / 2);
  c.translate(a, y, b);
  return c;
}

/**
 * Support à roues, dans le repère local (x = a le long du petit côté, z = b le long de la longueur), puis tourné dans l'emprise.
 * Deux groupes de matériau : 0 = support, fourche, axe et jantes (couleur de la pièce), 1 = pneus (noirs).
 */
function wheelGeometry(type: PieceType, o: Orient): THREE.BufferGeometry {
  const spec = type.wheel!;
  const top = type.h * PLATE_H - 0.005;
  const holderBottom = top - spec.holderH * PLATE_H;
  const r = (spec.d * PLATE_H) / 2 - 0.02;
  const axleY = (spec.d * PLATE_H) / 2;
  const { from, to } = holderRows(type);
  const mid = type.w / 2;
  const body: THREE.BufferGeometry[] = [];
  const tires: THREE.BufferGeometry[] = [];

  const holder = new RoundedBoxGeometry(type.w - GAP, spec.holderH * PLATE_H - 0.005, to - from - GAP, 2, 0.05);
  holder.translate(mid, (top + holderBottom) / 2, (from + to) / 2);
  body.push(holder);
  for (let a = 0; a < type.w; a++) {
    for (let b = from; b < to; b++) {
      const stud = new THREE.CylinderGeometry(STUD_R, STUD_R, STUD_H, 20);
      stud.translate(a + 0.5, top + STUD_H / 2 - 0.02, b + 0.5);
      body.push(stud);
    }
  }
  // Fourche : sous un support plus haut que l'axe, un bloc étroit descend jusqu'à lui.
  if (holderBottom > axleY - 0.15) {
    const forkBottom = axleY - 0.18;
    const fork = new THREE.BoxGeometry(type.w * 0.5, holderBottom - forkBottom + 0.01, to - from - 0.3);
    fork.translate(mid, (holderBottom + forkBottom) / 2, (from + to) / 2);
    body.push(fork);
  }
  // Axe et roues : chaque roue occupe un rang au bout du support.
  const wheelRows = spec.sides === 2 ? [0, type.l - 1] : [type.l - 1];
  body.push(axleCylinder(0.11, (wheelRows.length === 2 ? type.l : type.l - from) - 0.3, mid, axleY, wheelRows.length === 2 ? type.l / 2 : (from + type.l) / 2, 12));
  for (const row of wheelRows) {
    const b = row + 0.5;
    tires.push(axleCylinder(r, 0.78, mid, axleY, b, 32));
    // Jante : un peu plus large que le pneu, pour qu'elle se voie des deux côtés.
    body.push(axleCylinder(r * 0.56, 0.84, mid, axleY, b, 24));
  }

  const bodyGeo = mergeAll(body);
  const tireGeo = mergeAll(tires);
  if (!bodyGeo || !tireGeo) throw new Error(`Géométrie impossible pour ${type.id}`);
  const merged = mergeAll([bodyGeo, tireGeo], true);
  if (!merged) throw new Error(`Géométrie impossible pour ${type.id}`);
  merged.applyMatrix4(turnMatrix(type, o));
  return merged;
}

/** Quart de tour du repère local (a, b) vers l'emprise : mêmes correspondances que `rotatePoint`. */
function turnMatrix(type: PieceType, o: Orient): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  if (o === 1) m.set(0, 0, -1, type.l, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);
  else if (o === 2) m.set(-1, 0, 0, type.w, 0, 1, 0, 0, 0, 0, -1, type.l, 0, 0, 0, 1);
  else if (o === 3) m.set(0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, type.w, 0, 0, 0, 1);
  return m;
}

/**
 * Interrupteur : tuile lisse d'une plaque de haut, et sa manette (groupe de matériau 1, noir) penchée vers le bout b = l.
 * Éteint, la scène le dessine avec un demi-tour : la manette penche de l'autre côté.
 */
function switchGeometry(type: PieceType, o: Orient): THREE.BufferGeometry {
  const tileH = PLATE_H - 0.005;
  const body = new RoundedBoxGeometry(type.w - GAP, tileH, type.l - GAP, 2, 0.05);
  body.translate(type.w / 2, tileH / 2, type.l / 2);
  const pivot = new THREE.CylinderGeometry(0.22, 0.26, 0.12, 20);
  pivot.translate(type.w / 2, tileH + 0.06, type.l / 2);
  // Manette inclinée : son bout (boule comprise) reste sous le haut de la pièce (deux plaques).
  const handle = new THREE.BoxGeometry(0.14, 0.26, 0.14);
  handle.translate(0, 0.13, 0);
  handle.rotateX(0.55);
  handle.translate(type.w / 2, tileH + 0.08, type.l / 2);
  const knob = new THREE.SphereGeometry(0.1, 16, 12);
  knob.translate(0, 0.26, 0);
  knob.rotateX(0.55);
  knob.translate(type.w / 2, tileH + 0.08, type.l / 2);
  const bodyGeo = mergeAll([body]);
  const leverGeo = mergeAll([pivot, handle, knob]);
  if (!bodyGeo || !leverGeo) throw new Error(`Géométrie impossible pour ${type.id}`);
  const merged = mergeAll([bodyGeo, leverGeo], true);
  if (!merged) throw new Error(`Géométrie impossible pour ${type.id}`);
  merged.applyMatrix4(turnMatrix(type, o));
  return merged;
}

/**
 * Porte ou fenêtre : un cadre 1×4 dont le milieu est vide, et son battant articulé au bout b = 1. Fermé, le battant occupe le vide ;
 * ouvert, il pivote d'un peu plus d'un quart de tour vers le côté a = 1 (hors de l'emprise : l'ouverture est seulement visuelle).
 * Matériau 0 : cadre (et battant d'une porte) ; matériau 1 : poignée noire d'une porte, ou vitre d'une fenêtre.
 */
function openingGeometry(type: PieceType, o: Orient, open: boolean): THREE.BufferGeometry {
  const door = type.shape === 'door';
  const h = type.h * PLATE_H - 0.005;
  const sill = door ? 0 : 0.4;
  const lintel = door ? 1.2 : 0.8;
  const box = (sx: number, sy: number, sz: number, cx: number, cy: number, cz: number) => {
    const g = new RoundedBoxGeometry(sx, sy, sz, 2, 0.05);
    g.translate(cx, cy, cz);
    return g;
  };
  const frame: THREE.BufferGeometry[] = [
    box(type.w - GAP, h, 1 - GAP, type.w / 2, h / 2, 0.5),
    box(type.w - GAP, h, 1 - GAP, type.w / 2, h / 2, type.l - 0.5),
    box(type.w - GAP, lintel, type.l - 2 + GAP, type.w / 2, h - lintel / 2, type.l / 2),
  ];
  if (!door) frame.push(box(type.w - GAP, sill, type.l - 2 + GAP, type.w / 2, sill / 2, type.l / 2));
  const bottom = door ? 0.02 : sill;
  const leafH = h - lintel - bottom - 0.02;
  // Un vide de 4 tenons ou plus se ferme par deux battants, articulés sur chaque montant ; sinon un seul.
  const gap = type.l - 2;
  const leaves = gap >= 4 ? 2 : 1;
  const leafLen = gap / leaves - 0.06;
  const accent: THREE.BufferGeometry[] = [];
  for (let k = 0; k < leaves; k++) {
    // Le battant se construit à l'origine, bord de la charnière sur l'axe vertical (il s'étend vers +b, ou -b pour le second),
    // puis pivote vers le côté a = 1 et se place sur son montant.
    const dir = k === 0 ? 1 : -1;
    const place = (g: THREE.BufferGeometry) => {
      if (open) g.rotateY(dir * Math.PI * 0.56);
      g.translate(type.w / 2, bottom, k === 0 ? 1.03 : type.l - 1.03);
      return g;
    };
    if (door) {
      const leaf = new THREE.BoxGeometry(0.12, leafH, leafLen);
      leaf.translate(0, leafH / 2, (dir * leafLen) / 2);
      frame.push(place(leaf));
      for (const side of [-1, 1]) {
        const knob = new THREE.SphereGeometry(0.09, 14, 10);
        knob.translate(side * 0.11, leafH * 0.45, dir * (leafLen - 0.22));
        accent.push(place(knob));
      }
    } else {
      const pane = new THREE.BoxGeometry(0.05, leafH, leafLen);
      pane.translate(0, leafH / 2, (dir * leafLen) / 2);
      accent.push(place(pane));
    }
  }
  for (let b = 0; b < type.l; b++) {
    const stud = new THREE.CylinderGeometry(STUD_R, STUD_R, STUD_H, 20);
    stud.translate(type.w / 2, h + STUD_H / 2 - 0.02 + 0.005, b + 0.5);
    frame.push(stud);
  }
  const bodyGeo = mergeAll(frame);
  const accentGeo = mergeAll(accent);
  if (!bodyGeo || !accentGeo) throw new Error(`Géométrie impossible pour ${type.id}`);
  const merged = mergeAll([bodyGeo, accentGeo], true);
  if (!merged) throw new Error(`Géométrie impossible pour ${type.id}`);
  merged.applyMatrix4(turnMatrix(type, o));
  return merged;
}

/** Tenons du dessus d'une portière ou d'un hayon, tous dans le repère local (a, b). */
function topStuds(type: PieceType, h: number): THREE.BufferGeometry[] {
  const studs: THREE.BufferGeometry[] = [];
  for (let a = 0; a < type.w; a++) {
    for (let b = 0; b < type.l; b++) {
      const stud = new THREE.CylinderGeometry(STUD_R, STUD_R, STUD_H, 20);
      stud.translate(a + 0.5, h + STUD_H / 2 - 0.02 + 0.005, b + 0.5);
      studs.push(stud);
    }
  }
  return studs;
}

/** Symétrique d'une géométrie non indexée par rapport au milieu de la longueur (b local) : le sens des faces est rétabli. */
function mirrorAlongLength(g: THREE.BufferGeometry, length: number): void {
  g.scale(1, 1, -1);
  g.translate(0, 0, length);
  for (const attr of Object.values(g.attributes)) {
    const a = attr as THREE.BufferAttribute;
    const n = a.itemSize;
    for (let tri = 0; tri < a.count; tri += 3) {
      for (let k = 0; k < n; k++) {
        const v1 = a.array[(tri + 1) * n + k]!;
        a.array[(tri + 1) * n + k] = a.array[(tri + 2) * n + k]!;
        a.array[(tri + 2) * n + k] = v1;
      }
    }
    a.needsUpdate = true;
  }
}

/**
 * Portière ou hayon de voiture : un panneau 1×l, plein ou vitré (trois briques), qui occupe toute l'emprise quand il est fermé.
 * Portière : articulée au bout b = 0 sur un axe vertical, elle pivote de 70° vers le côté a = 1. Hayon : articulé en haut, sur un axe
 * horizontal le long de b, son bas se relève vers le côté a = 1 (un peu plus d'un quart de tour). L'ouverture sort de l'emprise :
 * elle est visuelle seulement. Matériau 1 : la vitre d'un panneau vitré.
 */
function carPanelGeometry(type: PieceType, o: Orient, open: boolean): THREE.BufferGeometry {
  const tailgate = type.shape === 'tailgate';
  const h = type.h * PLATE_H - 0.005;
  const glazed = type.h >= 9;
  const box = (sx: number, sy: number, sz: number, cx: number, cy: number, cz: number) => {
    const g = new RoundedBoxGeometry(sx, sy, sz, 2, 0.05);
    g.translate(cx, cy, cz);
    return g;
  };
  const body: THREE.BufferGeometry[] = [];
  const accent: THREE.BufferGeometry[] = [];
  if (!glazed) {
    body.push(box(type.w - GAP, h, type.l - GAP, type.w / 2, h / 2, type.l / 2));
  } else {
    const low = 5 * PLATE_H;
    const pillar = 0.35;
    const bar = 0.3;
    body.push(box(type.w - GAP, low, type.l - GAP, type.w / 2, low / 2, type.l / 2));
    body.push(box(type.w - GAP, h - low, pillar, type.w / 2, low + (h - low) / 2, pillar / 2 + GAP / 2));
    body.push(box(type.w - GAP, h - low, pillar, type.w / 2, low + (h - low) / 2, type.l - pillar / 2 - GAP / 2));
    body.push(box(type.w - GAP, bar, type.l - GAP, type.w / 2, h - bar / 2, type.l / 2));
    const pane = new THREE.BoxGeometry(0.05, h - low - bar, type.l - 2 * pillar);
    pane.translate(type.w / 2, low + (h - low - bar) / 2, type.l / 2);
    accent.push(pane);
  }
  body.push(...topStuds(type, h));
  // La portière pivote autour de l'axe vertical du bout b = 0, le hayon autour de l'axe du haut, au milieu de l'épaisseur.
  const hinge = (g: THREE.BufferGeometry) => {
    if (!open) return g;
    if (tailgate) {
      g.translate(-type.w / 2, -h, 0);
      g.rotateZ(Math.PI * 0.65);
      g.translate(type.w / 2, h, 0);
    } else {
      g.translate(-type.w / 2, 0, 0);
      g.rotateY(Math.PI * 0.39);
      g.translate(type.w / 2, 0, 0);
    }
    return g;
  };
  const bodyGeo = mergeAll(body.map(hinge));
  const accentGeo = accent.length > 0 ? mergeAll(accent.map(hinge)) : null;
  if (!bodyGeo) throw new Error(`Géométrie impossible pour ${type.id}`);
  const merged = accentGeo ? mergeAll([bodyGeo, accentGeo], true) : bodyGeo;
  if (!merged) throw new Error(`Géométrie impossible pour ${type.id}`);
  if (type.mirror) mirrorAlongLength(merged, type.l);
  merged.applyMatrix4(turnMatrix(type, o));
  return merged;
}

/**
 * Porte de garage : un panneau plein à nervures horizontales, une par brique. Ouverte, il s'enroule en haut de la baie (un rouleau le long
 * de la porte) et libère tout le passage ; les tenons du dessus restent en place.
 */
function garageGeometry(type: PieceType, o: Orient, open: boolean): THREE.BufferGeometry {
  const h = type.h * PLATE_H - 0.005;
  const parts: THREE.BufferGeometry[] = [];
  if (open) {
    const r = 0.38;
    const roll = new THREE.CylinderGeometry(r, r, type.l - GAP, 28);
    roll.rotateX(Math.PI / 2);
    roll.translate(type.w / 2, h - r, type.l / 2);
    parts.push(roll);
  } else {
    const body = new RoundedBoxGeometry(type.w - GAP, h, type.l - GAP, 2, 0.05);
    body.translate(type.w / 2, h / 2, type.l / 2);
    parts.push(body);
    for (let k = 1; k < type.h / 3; k++) {
      const rib = new THREE.BoxGeometry(type.w + 0.05, 0.05, type.l - GAP - 0.2);
      rib.translate(type.w / 2, k * 3 * PLATE_H, type.l / 2);
      parts.push(rib);
    }
  }
  parts.push(...topStuds(type, h));
  const merged = mergeAll(parts);
  if (!merged) throw new Error(`Géométrie impossible pour ${type.id}`);
  merged.applyMatrix4(turnMatrix(type, o));
  return merged;
}

/** La pièce a-t-elle deux matériaux (corps coloré, et pneus, manette, poignée ou vitre) ? Voir `accentColor`. */
export function hasTires(typeId: string): boolean {
  return accentColor(typeId) !== null;
}

/**
 * Géométrie d'une pièce (corps arrondi + tenons), origine au coin minimal de son emprise.
 * Les emprises tiennent déjà compte de l'orientation : aucune rotation d'instance n'est nécessaire.
 */
export function pieceGeometry(typeId: string, orient: number, open = false): THREE.BufferGeometry {
  const type = requireType(typeId);
  const o = normalizeOrient(type, orient);
  const key = `${typeId}|${o}${open ? '|open' : ''}`;
  const known = cache.get(key);
  if (known) return known;

  if (type.shape === 'garage') {
    const door = garageGeometry(type, o, open);
    door.computeBoundingBox();
    cache.set(key, door);
    return door;
  }
  if (type.shape === 'cardoor' || type.shape === 'tailgate') {
    const car = carPanelGeometry(type, o, open);
    car.computeBoundingBox();
    cache.set(key, car);
    return car;
  }
  if (type.shape === 'door' || type.shape === 'casement') {
    const frame = openingGeometry(type, o, open);
    frame.computeBoundingBox();
    cache.set(key, frame);
    return frame;
  }

  if (type.shape === 'switch') {
    const sw = switchGeometry(type, o);
    sw.computeBoundingBox();
    cache.set(key, sw);
    return sw;
  }
  if (type.shape === 'wheels') {
    const wheels = wheelGeometry(type, o);
    wheels.computeBoundingBox();
    cache.set(key, wheels);
    return wheels;
  }

  const { fx, fz } = footprintSize(type, o);
  const bodyH = type.h * PLATE_H;
  const parts: THREE.BufferGeometry[] = [];

  if (type.shape === 'box') {
    const body = new RoundedBoxGeometry(fx - GAP, bodyH - 0.005, fz - GAP, 2, 0.05);
    body.translate(fx / 2, (bodyH - 0.005) / 2, fz / 2);
    parts.push(body);
  } else if (type.shape === 'round') {
    const r = (Math.min(fx, fz) - GAP) / 2;
    const body = new THREE.CylinderGeometry(r, r, bodyH - 0.005, 32);
    body.translate(fx / 2, (bodyH - 0.005) / 2, fz / 2);
    parts.push(body);
  } else {
    parts.push(slopeBodyGeometry(typeId, o));
  }

  // Un tenon par case qui en porte un : toutes celles d'un bloc, seulement le rang du haut d'une pente.
  for (const { dx, dz } of studCells(type, o)) {
    const stud = new THREE.CylinderGeometry(STUD_R, STUD_R, STUD_H, 20);
    stud.translate(dx + 0.5, bodyH + STUD_H / 2 - 0.02, dz + 0.5);
    parts.push(stud);
  }

  // Le corps arrondi et les cylindres n'ont pas le même format d'indexation : on les ramène tous à un format commun.
  const merged = mergeAll(parts);
  if (!merged) throw new Error(`Géométrie impossible pour ${key}`);
  merged.computeBoundingBox();
  cache.set(key, merged);
  return merged;
}

/** Boîte englobante (corps + tenons) d'une pièce, en unités du monde. */
export function pieceSize(typeId: string, orient: number): THREE.Vector3 {
  const type = requireType(typeId);
  const { fx, fz } = footprintSize(type, normalizeOrient(type, orient));
  return new THREE.Vector3(fx, type.h * PLATE_H + (type.studs ? STUD_H : 0), fz);
}
