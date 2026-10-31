// Ensembles déplacés d'un bloc, et roues qui roulent sous une construction.

import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { evaluateGroupPlacement, groupAbove, groupBounds, groupConnected, groupFootprint, groupLanding, transformGroup } from './group';
import { Model, type Piece } from './model';
import { checkInvariants, landingLevel } from './rules';

const spec = (typeId: string, x: number, y: number, z: number, orient = 0, color = 'rouge') => ({ typeId, color, x, y, z, orient });

function put(game: Game, typeId: string, x: number, y: number, z: number, orient = 0): Piece {
  const out = game.place(spec(typeId, x, y, z, orient));
  if (!out.ok) throw new Error(`pose refusée : ${typeId} (${out.reason})`);
  return out.piece;
}

/** Une petite voiture (deux essieux, châssis, cabine) et une tour à côté. */
function scene() {
  const game = new Game(24, 24, 'vert', () => 0);
  const front = put(game, 'wheels-2x4', 4, 0, 4, 1); // emprise x 4..9, z 4..5 ; support x 5..8
  const back = put(game, 'wheels-2x4', 4, 0, 8, 1);
  const chassis = put(game, 'plate-6x6', 4, 5, 4);
  const cabin = put(game, 'brick-2x2', 6, 6, 6);
  const roof = put(game, 'plate-2x2', 6, 9, 6);
  const tower = put(game, 'brick-2x2', 14, 0, 14);
  return { game, front, back, chassis, cabin, roof, tower };
}

describe('prendre un ensemble', () => {
  it('la pièce et tout ce qui est posé dessus', () => {
    const { game, chassis, cabin, roof } = scene();
    expect(groupAbove(game.model, chassis.id)).toEqual([chassis.id, cabin.id, roof.id]);
    expect(groupAbove(game.model, roof.id)).toEqual([roof.id]);
  });

  it('tout l’ensemble attaché, même en touchant le toit ; la tour voisine n’en fait pas partie', () => {
    const { game, front, back, chassis, cabin, roof, tower } = scene();
    expect(groupConnected(game.model, roof.id)).toEqual([front.id, back.id, chassis.id, cabin.id, roof.id]);
    expect(groupConnected(game.model, tower.id)).toEqual([tower.id]);
  });
});

describe('tourner un ensemble', () => {
  it('quatre quarts de tour redonnent l’ensemble ; la boîte pivote', () => {
    const { game, front, back, chassis, cabin, roof } = scene();
    const group = [front, back, chassis, cabin, roof].map((p) => game.model.get(p.id)!);
    const b = groupBounds(group);
    expect(transformGroup(group, 4, b.x, b.y, b.z)).toEqual(group);
    expect(groupFootprint(group, 1)).toEqual({ fx: b.fz, fz: b.fx });
  });

  it('un ensemble tourné reste clipsé : posé seul sur une plaque vide, toutes ses pièces tiennent', () => {
    const { game, front, back, chassis, cabin, roof } = scene();
    const group = [front, back, chassis, cabin, roof].map((p) => game.model.get(p.id)!);
    for (const turns of [1, 2, 3]) {
      const model = new Model(24, 24);
      for (const p of transformGroup(group, turns, 2, 0, 2)) model.insert(p);
      expect(checkInvariants(model), `quarts de tour : ${turns}`).toEqual([]);
    }
  });
});

describe('déplacer un ensemble', () => {
  it('soulever la voiture entière, la poser ailleurs tournée, puis annuler et rétablir', () => {
    const { game, roof } = scene();
    const before = JSON.stringify(game.snapshot());
    const ids = groupConnected(game.model, roof.id);
    expect(game.liftGroup([roof.id, ...ids.filter((id) => id !== roof.id)]).ok).toBe(true);
    expect(game.model.count).toBe(1); // seule la tour reste
    expect(game.lifted?.id).toBe(roof.id);
    const y = groupLanding(game.model, game.liftedGroup, 1, 2, 14);
    expect(y).toBe(0);
    const out = game.dropGroup({ x: 2, y, z: 14, turns: 1 });
    expect(out.ok).toBe(true);
    expect(game.model.count).toBe(6);
    expect(checkInvariants(game.model)).toEqual([]);
    const after = JSON.stringify(game.snapshot());
    expect(game.historyDepth).toBe(7); // six poses + un déplacement
    game.undo();
    expect(JSON.stringify(game.snapshot())).toBe(before);
    game.redo();
    expect(JSON.stringify(game.snapshot())).toBe(after);
  });

  it('refuse de poser l’ensemble à travers une autre pièce, et le laisse soulevé', () => {
    const { game, chassis } = scene();
    expect(game.liftGroup(groupAbove(game.model, chassis.id)).ok).toBe(true);
    const out = game.dropGroup({ x: 13, y: 0, z: 13, turns: 0 }); // sur la tour
    expect(out.ok).toBe(false);
    expect(game.liftedGroup).toHaveLength(3);
    game.cancelLift();
    expect(game.model.count).toBe(6);
    expect(checkInvariants(game.model)).toEqual([]);
  });

  it('un ensemble posé sur la tour s’arrête dessus et tient par ses tenons', () => {
    const { game, cabin } = scene();
    expect(game.liftGroup(groupAbove(game.model, cabin.id)).ok).toBe(true); // cabine + toit
    const y = groupLanding(game.model, game.liftedGroup, 0, 14, 14);
    expect(y).toBe(3);
    expect(evaluateGroupPlacement(game.model, transformGroup(game.liftedGroup, 0, 14, y, 14)).ok).toBe(true);
    expect(game.dropGroup({ x: 14, y, z: 14, turns: 0 }).ok).toBe(true);
  });

  it('refuse de soulever un ensemble qui laisserait une pièce sans appui', () => {
    const { game, chassis, cabin } = scene();
    const out = game.liftGroup([chassis.id]); // la cabine ne tient que sur le châssis
    expect(out.ok).toBe(false);
    expect(!out.ok && out.stranded.map((p) => p.id)).toEqual([cabin.id]);
  });

  it('un déplacement interrompu ne perd aucune pièce à l’enregistrement', () => {
    const { game, chassis } = scene();
    game.liftGroup(groupAbove(game.model, chassis.id));
    expect(game.exportState().pieces).toHaveLength(6);
  });
});

describe('roues sous une construction', () => {
  it('une roue roule au sol, sous un pont, quand il y a la place', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    put(game, 'brick-2x2', 2, 0, 2);
    put(game, 'brick-2x2', 2, 3, 2);
    put(game, 'brick-2x2', 2, 0, 8);
    put(game, 'brick-2x2', 2, 3, 8);
    put(game, 'plate-2x8', 2, 6, 2, 0); // tablier à 6 plaques de haut, de z = 2 à 9
    expect(landingLevel(game.model, 'wheels-2x2', 0, 2, 4)).toBe(0); // 3 plaques de haut : passe dessous
    expect(landingLevel(game.model, 'brick-2x2', 0, 2, 4)).toBe(7); // une brique, elle, se pose sur le tablier
    expect(game.place(spec('wheels-2x2', 2, 0, 4)).ok).toBe(true);
  });

  it('pas la place dessous : la roue se pose sur le dessus', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    put(game, 'brick-2x2', 2, 0, 2);
    put(game, 'plate-2x4', 2, 3, 2); // dessous libre en z = 4..5, mais seulement 3 plaques de haut
    expect(landingLevel(game.model, 'bigwheel-2x2', 0, 2, 4)).toBe(4);
  });
});
