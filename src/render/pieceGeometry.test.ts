// Géométrie des pentes : volumes connus, faces orientées vers l'extérieur, aucune dépendance au rendu.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CATALOGUE, requireType } from '../core/catalogue';
import { PLATE_H, SLOPE_LOW, pieceGeometry, pieceSize, slopeBodyGeometry } from './pieceGeometry';

const H = 3 * PLATE_H - 0.005;

/** Volume signé d'une surface fermée (somme des tétraèdres depuis l'origine) : positif si les faces regardent vers l'extérieur. */
function volume(geometry: THREE.BufferGeometry): number {
  const p = geometry.getAttribute('position');
  let v = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    v += a.dot(b.clone().cross(c)) / 6;
  }
  return v;
}

const L = SLOPE_LOW;
/** Section d'une pente : rangs plats à la hauteur H, puis des rangs en pente de H à L (trapèze) ; volume = section × largeur. */
const section = (flat: number, sloped: number) => flat * H + (sloped * (H + L)) / 2;
const EXPECTED: Record<string, number> = {
  'slope-1x2': 1 * section(1, 1),
  'slope-2x2': 2 * section(1, 1),
  'slope-2x3': 2 * section(2, 1),
  'slope-2x4': 2 * section(3, 1),
  'gentle-2x3': 2 * section(1, 2),
  'gentle-2x4': 2 * section(2, 2),
  // Cellule plate, deux cellules en pente (trapèzes) et un coin en pyramide (deux demi-cellules en triangle).
  'corner-2x2': H + (H + L) / 2 + (H + L) / 2 + (H + 2 * L) / 3,
};

describe('pentes en 3D', () => {
  it.each(Object.entries(EXPECTED))('« %s » : volume exact, quelle que soit l’orientation, et faces vers l’extérieur', (id, expected) => {
    for (const o of [0, 1, 2, 3]) {
      const v = volume(slopeBodyGeometry(id, o, 0));
      expect(v, `${id} orientation ${o}`).toBeGreaterThan(0);
      expect(v).toBeCloseTo(expected, 5);
    }
  });

  it('chaque pente a une géométrie complète avec ses tenons, et sa boîte englobante colle à l’emprise', () => {
    for (const id of CATALOGUE.filter((c) => requireType(c).kind === 'slope')) {
      for (const o of [0, 1, 2, 3]) {
        const g = pieceGeometry(id, o);
        g.computeBoundingBox();
        const size = pieceSize(id, o);
        const box = g.boundingBox!;
        expect(box.min.x).toBeGreaterThanOrEqual(-1e-6);
        expect(box.min.z).toBeGreaterThanOrEqual(-1e-6);
        expect(box.max.x).toBeLessThanOrEqual(size.x + 1e-6);
        expect(box.max.z).toBeLessThanOrEqual(size.z + 1e-6);
        expect(box.max.y).toBeCloseTo(size.y, 1);
      }
    }
  });

  it('le dessus de la pente est à plat sur le rang de tenons et plus bas ailleurs', () => {
    // Pente raide 2×3 vers +Z (orientation 0) : rang plat z de 0 à 2, pente de 2 à 3.
    const g = slopeBodyGeometry('slope-2x3', 0, 0);
    const p = g.getAttribute('position');
    let maxAtFront = -Infinity;
    for (let i = 0; i < p.count; i++) if (Math.abs(p.getZ(i) - 3) < 1e-9) maxAtFront = Math.max(maxAtFront, p.getY(i));
    expect(maxAtFront).toBeCloseTo(SLOPE_LOW, 5);
    let maxAtBack = -Infinity;
    for (let i = 0; i < p.count; i++) if (Math.abs(p.getZ(i)) < 1e-9) maxAtBack = Math.max(maxAtBack, p.getY(i));
    expect(maxAtBack).toBeCloseTo(H, 5);
  });
});
