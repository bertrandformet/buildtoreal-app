import { describe, expect, it } from 'vitest';
import { getType, isKnownColor, requireType } from './catalogue';
import { litPieces } from './lights';
import { EXAMPLES, buildExampleGame } from './exampleModels';
import { buildNotice, noticePieceCount, replayNotice, sameConstruction } from './notice';
import { parseProject, projectFromGame, serializeProject } from './project';
import { checkInvariants } from './rules';

describe('modèles d’exemple', () => {
  it('propose six modèles, du plus petit au plus grand nombre de pièces', () => {
    expect(EXAMPLES.map((m) => m.id)).toEqual(['car', 'truck', 'house', 'castle', 'bridge', 'manor']);
  });

  it.each(EXAMPLES.map((m) => [m.id, m] as const))('« %s » : toutes les poses respectent les règles, les types et couleurs existent', (_id, model) => {
    const game = buildExampleGame(model);
    expect(game.model.count).toBe(model.pieces.length);
    expect(checkInvariants(game.model)).toEqual([]);
    for (const p of model.pieces) {
      expect(getType(p.typeId), p.typeId).toBeDefined();
      expect(isKnownColor(p.color), p.color).toBe(true);
    }
  });

  it.each(EXAMPLES.map((m) => [m.id, m] as const))('« %s » : la notice rejouée redonne exactement la construction', (_id, model) => {
    const game = buildExampleGame(model);
    const notice = buildNotice(game.model, game.baseColor);
    expect(noticePieceCount(notice)).toBe(model.pieces.length);
    const replay = replayNotice(notice);
    expect(replay.errors).toEqual([]);
    expect(sameConstruction(replay.model, game.model)).toBe(true);
  });

  it.each(EXAMPLES.map((m) => [m.id, m] as const))('« %s » : s’enregistre et se relit sans perte', (_id, model) => {
    const game = buildExampleGame(model);
    const data = projectFromGame(game, { id: 'essai', name: 'Essai', createdAt: 1, updatedAt: 1 });
    const parsed = parseProject(JSON.parse(serializeProject(data)));
    expect(parsed.ok).toBe(true);
  });

  it('les modèles ont de dix à sept cents pièces et ne partagent pas leur journal', () => {
    for (const model of EXAMPLES) {
      expect(model.pieces.length).toBeGreaterThanOrEqual(10);
      expect(model.pieces.length).toBeLessThanOrEqual(700);
      expect(buildExampleGame(model).journal.list()).toHaveLength(0);
    }
  });

  it('la maison a une porte d’entrée, une porte intérieure et six fenêtres, ouvertes ou non selon le cas', () => {
    const house = EXAMPLES.find((m) => m.id === 'house')!;
    expect(house.pieces.filter((p) => p.typeId.startsWith('door-'))).toHaveLength(2);
    expect(house.pieces.filter((p) => p.typeId.startsWith('casement-'))).toHaveLength(6);
    const game = buildExampleGame(house);
    const open = [...game.openings].map((id) => game.model.get(id)!);
    expect(open.map((p) => p.typeId.split('-')[0]).sort()).toEqual(['casement', 'casement', 'door', 'door']);
  });

  it('la maison a un paillasson, quinze fleurs dans l’herbe et des cloisons à l’intérieur', () => {
    const house = EXAMPLES.find((m) => m.id === 'house')!;
    expect(house.pieces.filter((p) => p.typeId === 'tile-2x4')).toHaveLength(1);
    expect(house.pieces.filter((p) => p.typeId === 'roundplate-1x1')).toHaveLength(15);
    expect(house.pieces.filter((p) => p.typeId === 'brick-1x6' && p.x === 8)).toHaveLength(6);
  });

  it('la maison a un toit à deux pans : quatorze pentes douces, sept dans chaque sens, un faîte en plaques et une cheminée', () => {
    const house = EXAMPLES.find((m) => m.id === 'house')!;
    const roof = house.pieces.filter((p) => p.typeId === 'gentle-2x4');
    expect(roof).toHaveLength(14);
    expect(roof.filter((p) => p.orient === 2)).toHaveLength(7);
    expect(roof.filter((p) => p.orient === 0)).toHaveLength(7);
    expect(house.pieces.filter((p) => p.typeId === 'plate-2x6')).toHaveLength(7);
    // Deux briques de pignon et deux de cheminée.
    expect(house.pieces.filter((p) => p.typeId === 'brick-2x2')).toHaveLength(4);
  });

  it('le château a trois circuits indépendants : lampes du rez-de-chaussée, lampes de l’étage, torches de l’allée', () => {
    const game = buildExampleGame(EXAMPLES.find((m) => m.id === 'castle')!);
    const switches = game.model.all().filter((p) => p.typeId === 'switch-1x2');
    expect(switches).toHaveLength(3);
    const glow = game.model.all().filter((p) => p.color.endsWith('-lumi'));
    const lit = () => litPieces(game.model, game.switchesOff, game.switchLinks);
    const off = () => glow.length - lit().size;
    const counts = switches.map((sw) => {
      game.toggleSwitch(sw.id);
      const n = off();
      game.toggleSwitch(sw.id);
      return n;
    });
    expect(counts.sort()).toEqual([4, 6, 6]);
    // Les lampes des tours et les balises n'ont pas d'interrupteur.
    expect(glow.filter((p) => p.x < 10 || p.x > 33).every((p) => lit().has(p.id))).toBe(true);
  });

  it('le château a deux étages (un plancher à 18 plaques), un escalier de six marches, des créneaux, un portique de quatre colonnes et quatre tours', () => {
    const castle = EXAMPLES.find((m) => m.id === 'castle')!;
    expect(castle.pieces.filter((p) => p.typeId === 'brick-2x4' && p.z === 14 && p.x >= 11 && p.x <= 21)).toHaveLength(21);
    expect(castle.pieces.filter((p) => p.typeId === 'brick-1x2' && p.y === 40)).toHaveLength(20);
    expect(castle.pieces.filter((p) => p.typeId === 'column-4' && p.z === 29)).toHaveLength(4);
    expect(castle.pieces.filter((p) => p.typeId === 'corner-2x2' && p.y === 45)).toHaveLength(16);
    expect(castle.pieces.some((p) => p.typeId.startsWith('plate-') && p.y === 18)).toBe(true);
  });

  it('la grande maison est sur sept plaques de tailles et couleurs différentes (48 × 80) : herbe, sable, route', () => {
    const game = buildExampleGame(EXAMPLES.find((m) => m.id === 'manor')!);
    const plates = game.model.plates;
    expect(plates).toHaveLength(7);
    expect([game.model.baseW, game.model.baseL]).toEqual([48, 80]);
    expect(plates.map((p) => `${p.w}${p.color}`)).toEqual(['48vert', '16vert', '16sable', '16vert', '16gris', '16gris', '16gris']);
  });

  it('la grande maison a un grenier (plancher à 18 plaques, escalier, une fenêtre à chaque pignon) et un vrai toit en triangle', () => {
    const manor = EXAMPLES.find((m) => m.id === 'manor')!;
    expect(manor.pieces.some((p) => p.typeId === 'plate-8x8' && p.y === 18)).toBe(true);
    expect(manor.pieces.filter((p) => p.typeId === 'brick-2x4' && p.z === 14 && p.x >= 11 && p.x <= 21)).toHaveLength(21);
    const gable = manor.pieces.filter((p) => p.typeId.startsWith('casement-') && p.y === 22 && p.z === 18);
    expect(gable.map((p) => p.x).sort((a, b) => a - b)).toEqual([10, 33]);
    // Trois gradins de chaque côté, sur douze colonnes : le faîte est à y = 37, au-dessus de la maison de six briques (y = 18).
    const roof = manor.pieces.filter((p) => p.typeId === 'gentle-2x4' && p.x >= 10 && p.x <= 32 && p.z >= 12 && p.z <= 24 && p.y >= 28);
    expect(roof).toHaveLength(72);
    expect(Math.max(...roof.map((p) => p.y))).toBe(34);
  });

  it('la grande maison a un garage avec sa voiture, et deux grandes voitures dans la rue', () => {
    const manor = EXAMPLES.find((m) => m.id === 'manor')!;
    const doors = manor.pieces.filter((p) => p.typeId === 'door-1x6-h5');
    expect(doors.map((p) => p.x)).toEqual([19]);
    expect(manor.pieces.filter((p) => p.typeId === 'garage-1x8-h7')).toHaveLength(1);
    const wheels = manor.pieces.filter((p) => p.typeId === 'wheels-2x4');
    expect(wheels).toHaveLength(6);
    expect(wheels.filter((p) => p.x >= 34 && p.x <= 45 && p.z <= 27)).toHaveLength(2);
    expect(wheels.filter((p) => p.z >= 64)).toHaveLength(4);
  });

  it('la grande maison : sept interrupteurs reliés (rez-de-chaussée, grenier, allée, garage, trois voitures)', () => {
    const game = buildExampleGame(EXAMPLES.find((m) => m.id === 'manor')!);
    const switches = game.model.all().filter((p) => p.typeId === 'switch-1x2');
    expect(switches).toHaveLength(7);
    const glow = game.model.all().filter((p) => p.color.endsWith('-lumi'));
    const lit = () => litPieces(game.model, game.switchesOff, game.switchLinks);
    const off = () => glow.length - lit().size;
    const counts = switches.map((sw) => {
      game.toggleSwitch(sw.id);
      const n = off();
      game.toggleSwitch(sw.id);
      return n;
    });
    // Rez-de-chaussée 6, grenier 4, allée 10, garage 2, et 4 pour chacune des trois voitures (deux phares, deux feux).
    expect(counts.sort((a, b) => a - b)).toEqual([2, 4, 4, 4, 4, 6, 10]);
    for (const sw of switches) game.toggleSwitch(sw.id);
    expect(off()).toBe(glow.length);
  });

  it('le grand pont est sur trois plaques (96 × 32) aux berges surélevées, avec des interrupteurs qui marchent chacun pour leurs lumières, hors de la route', () => {
    const game = buildExampleGame(EXAMPLES.find((m) => m.id === 'bridge')!);
    expect(game.model.plates).toHaveLength(3);
    expect([game.model.baseW, game.model.baseL]).toEqual([96, 32]);
    const switches = game.model.all().filter((p) => p.typeId === 'switch-1x2');
    expect(switches).toHaveLength(4);
    // Trois sont sur les berges, hors de la route (z de 11 à 20) ; le quatrième est dans la voiture, qui est sur la route.
    expect(switches.filter((p) => p.z < 11 || p.z > 20)).toHaveLength(3);
    const glow = game.model.all().filter((p) => p.color.endsWith('-lumi'));
    const lit = () => litPieces(game.model, game.switchesOff, game.switchLinks);
    const off = () => glow.length - lit().size;
    const counts = switches.map((sw) => {
      game.toggleSwitch(sw.id);
      const n = off();
      game.toggleSwitch(sw.id);
      return n;
    });
    // Lampadaires de l'ouest 6, de l'est 6, balises 8, voiture 4 : chaque interrupteur éteint exactement ses lumières.
    expect(counts.sort((a, b) => a - b)).toEqual([4, 6, 6, 8]);
    // Les lampes derrière les fenêtres des tours et les feux du bateau n'ont pas d'interrupteur.
    expect(glow.filter((p) => p.y === 49 || p.x >= 46 && p.x <= 49 && p.z <= 19 && p.y <= 13).every((p) => lit().has(p.id))).toBe(true);
  });

  it('le pont : un bateau en travers (z de 4 à 19) passe sous le tablier (z de 11 à 20) sans dépasser 9 plaques sous lui, et la voiture a 4 tenons de large', () => {
    const bridge = EXAMPLES.find((m) => m.id === 'bridge')!;
    const hull = bridge.pieces.filter((p) => p.x >= 46 && p.x <= 49 && p.y < 9 && p.z >= 4 && p.z <= 19);
    const underDeck = hull.filter((p) => p.z + requireType(p.typeId).l > 11 && p.z + 1 > 11 - 1);
    expect(underDeck.length).toBeGreaterThan(0);
    expect(Math.max(...hull.filter((p) => p.z >= 12).map((p) => p.y + requireType(p.typeId).h))).toBeLessThanOrEqual(9);
    const seats = bridge.pieces.filter((p) => p.typeId === 'brick-2x2' && p.color === 'noir');
    expect(seats).toHaveLength(2);
    expect(bridge.pieces.filter((p) => p.typeId === 'tailgate-1x2-h3')).toHaveLength(1);
  });

  it('la voiture a un interrupteur à l’intérieur qui éteint ses deux phares jaunes et ses deux feux arrière orange', () => {
    const game = buildExampleGame(EXAMPLES.find((m) => m.id === 'car')!);
    const sw = game.model.all().filter((p) => p.typeId === 'switch-1x2');
    expect(sw).toHaveLength(1);
    const glow = game.model.all().filter((p) => p.color.endsWith('-lumi'));
    expect(glow.map((p) => p.color).sort()).toEqual(['jaune-lumi', 'jaune-lumi', 'orange-lumi', 'orange-lumi']);
    const lit = () => litPieces(game.model, game.switchesOff, game.switchLinks);
    expect(lit().size).toBe(4);
    game.toggleSwitch(sw[0]!.id);
    expect(lit().size).toBe(0);
  });

  it('le camion a un interrupteur dans la cabine qui éteint ses deux phares et ses quatre feux arrière', () => {
    const game = buildExampleGame(EXAMPLES.find((m) => m.id === 'truck')!);
    const sw = game.model.all().filter((p) => p.typeId === 'switch-1x2');
    expect(sw).toHaveLength(1);
    const lit = () => litPieces(game.model, game.switchesOff, game.switchLinks);
    expect(lit().size).toBe(6);
    game.toggleSwitch(sw[0]!.id);
    expect(lit().size).toBe(0);
  });

  it('les cinq arbres de la grande maison et les quatre du château ont un tronc marron et un feuillage', () => {
    for (const [id, trees] of [['manor', 5], ['castle', 4]] as const) {
      const model = EXAMPLES.find((m) => m.id === id)!;
      const trunks = model.pieces.filter((p) => p.typeId === 'column-4' && p.color === 'marron');
      expect(trunks, id).toHaveLength(trees);
      expect(model.pieces.filter((p) => p.typeId === 'plate-6x6' && p.color === 'orange' || p.typeId === 'plate-6x6' && p.color === 'vert'), id).toHaveLength(trees);
    }
  });

  it('une voiture passe sous la porte de garage : 21 plaques de haut pour une voiture de 19 (plancher compris), 8 tenons de large pour 6', () => {
    const manor = EXAMPLES.find((m) => m.id === 'manor')!;
    const door = manor.pieces.find((p) => p.typeId === 'garage-1x8-h7')!;
    const turquoise = manor.pieces.filter((p) => p.x >= 35 && p.x <= 44 && p.z >= 13 && p.z <= 26 && p.y >= 1 && p.y < 21);
    const top = Math.max(...turquoise.map((p) => p.y + requireType(p.typeId).h));
    expect(top).toBeLessThanOrEqual(door.y + requireType(door.typeId).h);
    expect(requireType(door.typeId).l).toBeGreaterThanOrEqual(6);
  });

  it('le pont : la voiture passe sous l’arche des tours (24 plaques de dégagement) et le bateau sous le tablier (18 plaques au-dessus de l’eau)', () => {
    const game = buildExampleGame(EXAMPLES.find((m) => m.id === 'bridge')!);
    const all = game.model.all();
    const top = (p: { y: number; typeId: string }) => p.y + requireType(p.typeId).h;
    // La voiture : tout ce qui est posé sur le tablier (y de 19) entre les deux tours, sur la route.
    const car = all.filter((p) => p.y >= 19 && p.y < 38 && p.x >= 28 && p.x <= 42 && p.z >= 13 && p.z <= 18);
    const carTop = Math.max(...car.map(top));
    const lintel = all.find((p) => p.typeId === 'brick-2x6' && p.color === 'bleu' && p.x === 40)!;
    expect(lintel.y - 19).toBe(24);
    expect(carTop).toBeLessThanOrEqual(lintel.y);
    // Le bateau (x de 46 à 49, z de 11 à 19, sous le tablier) tient sous le dessous du tablier.
    const boatUnder = all.filter((p) => p.x >= 46 && p.x <= 49 && p.y < 18 && p.z + requireType(p.typeId).l > 11 && p.z <= 19);
    expect(Math.max(...boatUnder.map(top))).toBeLessThanOrEqual(18);
    // Les piles font six briques de haut, de l'eau au tablier.
    const pier = all.filter((p) => p.typeId === 'brick-2x4' && p.color === 'gris' && p.x === 42 && p.z === 11);
    expect(pier.map((p) => p.y)).toEqual([0, 3, 6, 9, 12, 15]);
  });
});
