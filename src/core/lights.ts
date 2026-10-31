// Pièces lumineuses et interrupteurs. Fonction pure sur le modèle, sans rendu ni interface.
//
// Une pièce lumineuse est allumée en permanence, sauf si son ensemble (tout ce qui y est clipsé, dessus comme dessous)
// contient un interrupteur : elle suit alors les interrupteurs de l'ensemble (allumée si au moins l'un d'eux est allumé).

import { isGlow, isSwitch } from './catalogue';
import type { Model } from './model';
import { supportsOf } from './rules';

/** Ensembles attachés : pour chaque pièce, l'identifiant d'un représentant de son ensemble. */
export function components(model: Model): Map<number, number> {
  const parent = new Map<number, number>();
  const find = (id: number): number => {
    let r = id;
    while (parent.get(r) !== r) r = parent.get(r)!;
    // Compression du chemin.
    let c = id;
    while (parent.get(c) !== r) {
      const next = parent.get(c)!;
      parent.set(c, r);
      c = next;
    }
    return r;
  };
  const pieces = model.all();
  for (const p of pieces) parent.set(p.id, p.id);
  for (const p of pieces) {
    for (const sid of supportsOf(model, p).ids) {
      const a = find(p.id);
      const b = find(sid);
      if (a !== b) parent.set(a, b);
    }
  }
  const out = new Map<number, number>();
  for (const p of pieces) out.set(p.id, find(p.id));
  return out;
}

/** Pièces lumineuses commandées par chaque interrupteur (identifiant d'interrupteur → identifiants de pièces lumineuses). */
export type SwitchLinks = ReadonlyMap<number, ReadonlySet<number>>;

/**
 * Identifiants des pièces lumineuses allumées. Une pièce reliée à des interrupteurs est allumée si l'un d'eux l'est ;
 * une pièce qu'aucun interrupteur ne commande reste allumée.
 */
export function litPieces(model: Model, off: ReadonlySet<number>, links: SwitchLinks): Set<number> {
  const lit = new Set<number>();
  const controlled = new Set<number>();
  const driven = new Set<number>();
  for (const [sid, targets] of links) {
    const sw = model.get(sid);
    if (!sw || !isSwitch(sw.typeId)) continue;
    for (const id of targets) {
      controlled.add(id);
      if (!off.has(sid)) driven.add(id);
    }
  }
  for (const p of model.all()) {
    if (isGlow(p.color) && (!controlled.has(p.id) || driven.has(p.id))) lit.add(p.id);
  }
  return lit;
}

/**
 * Liens des fichiers d'avant les liens explicites : chaque pièce lumineuse d'un ensemble qui a des interrupteurs
 * est reliée à l'interrupteur le plus proche de cet ensemble.
 */
export function legacyLinks(model: Model): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  const pieces = model.all();
  const comp = components(model);
  const switches = pieces.filter((p) => isSwitch(p.typeId));
  if (switches.length === 0) return out;
  const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
    Math.abs(a.x - b.x) + Math.abs(a.z - b.z) + Math.abs(a.y - b.y) / 3;
  for (const p of pieces) {
    if (!isGlow(p.color)) continue;
    let best: (typeof switches)[number] | null = null;
    for (const sw of switches) {
      if (comp.get(sw.id) !== comp.get(p.id)) continue;
      if (!best || dist(p, sw) < dist(p, best)) best = sw;
    }
    if (!best) continue;
    const set = out.get(best.id) ?? new Set<number>();
    set.add(p.id);
    out.set(best.id, set);
  }
  return out;
}
