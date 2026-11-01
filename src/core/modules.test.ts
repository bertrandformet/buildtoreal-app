// Modules (sous-assemblages) : création, notice avec encadrés, rejeu, enregistrement.

import { describe, expect, it } from 'vitest';
import { Game } from './game';
import { buildNotice, isModuleBuild, noticeFinalPieces, noticePieceCount, parseNotice, replayNotice, sameConstruction, serializeNotice } from './notice';
import { gameFromProject, parseProject, projectFromGame, serializeProject } from './project';

const put = (game: Game, typeId: string, x: number, y: number, z: number, color = 'rouge', orient = 0) => {
  const out = game.place({ typeId, color, x, y, z, orient });
  if (!out.ok) throw new Error(`pose refusée : ${typeId} (${out.reason})`);
  return out.piece;
};

/** Une maison de deux murs, et un toit de trois pièces qui forme un module (posé sur les murs). */
function house() {
  const game = new Game(16, 16, 'vert', () => 0);
  put(game, 'brick-2x4', 2, 0, 2, 'blanc');
  put(game, 'brick-2x4', 2, 0, 6, 'blanc');
  put(game, 'brick-2x4', 2, 3, 2, 'sable');
  // Un petit arbre à côté, sur la plaque : un module de trois pièces.
  const trunk = put(game, 'brick-1x1', 10, 0, 10, 'marron');
  const mid = put(game, 'brick-2x2', 10, 3, 10, 'vert');
  const top = put(game, 'brick-1x1', 10, 6, 10, 'jaune');
  return { game, ids: [trunk.id, mid.id, top.id] };
}

describe('créer un module', () => {
  it('prend au moins deux pièces qui se construisent seules', () => {
    const { game, ids } = house();
    expect(game.createModule([ids[0]!], 'Arbre')).toEqual({ ok: false, reason: 'trop_peu' });
    const out = game.createModule(ids, 'Arbre');
    expect(out.ok && out.module.pieceIds).toEqual([...ids].sort((a, b) => a - b));
    expect(game.modules).toHaveLength(1);
    expect(game.moduleOf(ids[1]!)?.name).toBe('Arbre');
  });

  it('refuse une pièce déjà dans un module, une pièce inconnue, et un module qui ne tient pas seul', () => {
    const { game, ids } = house();
    game.createModule(ids, 'Arbre');
    expect(game.createModule([ids[0]!, ids[1]!], 'Autre')).toEqual({ ok: false, reason: 'deja_module' });
    expect(game.createModule([1, 999], 'Inconnu')).toEqual({ ok: false, reason: 'absente' });
    // Le dessus d'un mur et le sommet de l'arbre : le sommet ne tient pas seul (le milieu de l'arbre n'est pas dans le module).
    const roof = game.model.all().find((p) => p.y === 3 && p.x === 2)!;
    expect(game.createModule([roof.id, ids[2]!], 'Mur')).toEqual({ ok: false, reason: 'deja_module' });
    game.dissolveModule(1);
    expect(game.createModule([roof.id, ids[2]!], 'Mur')).toEqual({ ok: false, reason: 'sans_appui' });
  });

  it('un module qui perd des pièces disparaît quand il en reste moins de deux, et revient avec ↶', () => {
    const { game, ids } = house();
    game.createModule(ids, 'Arbre');
    game.remove(ids[2]!);
    expect(game.modules[0]!.pieceIds).toHaveLength(2);
    game.remove(ids[1]!);
    expect(game.modules).toHaveLength(0);
    game.undo();
    game.undo();
    expect(game.modules[0]!.pieceIds).toHaveLength(3);
  });

  it('se défait et se renomme', () => {
    const { game, ids } = house();
    const out = game.createModule(ids, 'Arbre');
    if (!out.ok) throw new Error('création');
    game.renameModule(out.module.id, 'Sapin');
    expect(game.modules[0]!.name).toBe('Sapin');
    game.dissolveModule(out.module.id);
    expect(game.modules).toHaveLength(0);
  });
});

describe('notice avec module', () => {
  it('construit d’abord le module à part, puis le pose d’un seul bloc ; la notice se rejoue et redonne la construction', () => {
    const { game, ids } = house();
    game.createModule(ids, 'Arbre');
    const notice = buildNotice(game.model, game.baseColor, 6, game.modules);
    const builds = notice.steps.filter(isModuleBuild);
    const place = notice.steps.filter((s) => s.module?.role === 'place');
    expect(builds.length).toBeGreaterThan(0);
    expect(place).toHaveLength(1);
    expect(place[0]!.pieces).toHaveLength(3);
    // Les étapes du module viennent avant son étape de pose.
    expect(notice.steps.indexOf(builds[builds.length - 1]!)).toBeLessThan(notice.steps.indexOf(place[0]!));
    // Les pièces du module, construit à part, sont dans un repère propre : le plus bas est à y = 0, avec un tenon de marge.
    expect(Math.min(...builds.flatMap((s) => s.pieces.map((p) => p.y)))).toBe(0);
    expect(Math.min(...builds.flatMap((s) => s.pieces.map((p) => p.x)))).toBe(1);
    const replay = replayNotice(notice);
    expect(replay.errors).toEqual([]);
    expect(sameConstruction(replay.model, game.model)).toBe(true);
    // L'inventaire compte chaque pièce une fois.
    expect(noticePieceCount(notice)).toBe(game.model.count);
    expect(noticeFinalPieces(notice)).toHaveLength(game.model.count);
  });

  it('sans module, la notice est celle d’avant', () => {
    const { game } = house();
    const a = buildNotice(game.model, game.baseColor);
    const b = buildNotice(game.model, game.baseColor, 6, []);
    expect(serializeNotice(a)).toBe(serializeNotice(b));
    expect(a.steps.some((s) => s.module)).toBe(false);
  });

  it('un module qui ne tient pas seul est ignoré : ses pièces sont posées comme les autres', () => {
    const { game } = house();
    const roof = game.model.all().find((p) => p.y === 3 && p.x === 2)!;
    const tip = game.model.all().find((p) => p.y === 6)!;
    const bad = { id: 1, name: 'Mur', pieceIds: [roof.id, tip.id] };
    const notice = buildNotice(game.model, game.baseColor, 6, [bad]);
    expect(notice.steps.some((s) => s.module)).toBe(false);
    expect(sameConstruction(replayNotice(notice).model, game.model)).toBe(true);
  });

  it('la notice s’enregistre et se relit avec ses modules ; une étape de module truquée est refusée', () => {
    const { game, ids } = house();
    game.createModule(ids, 'Arbre');
    const notice = buildNotice(game.model, game.baseColor, 6, game.modules);
    const parsed = parseNotice(JSON.parse(serializeNotice(notice)));
    expect(parsed.ok).toBe(true);
    const tampered = JSON.parse(serializeNotice(notice));
    const build = tampered.steps.find((s: { module?: { role: string } }) => s.module?.role === 'build');
    build.module.plate = { w: 1, l: 1 };
    expect(parseNotice(tampered).ok).toBe(false);
    // Un module posé qui n'est pas celui qui a été construit est signalé par le rejeu.
    const swapped = JSON.parse(serializeNotice(notice));
    const place = swapped.steps.find((s: { module?: { role: string } }) => s.module?.role === 'place');
    place.pieces[0].color = 'noir';
    const parsedSwap = parseNotice(swapped);
    if (!parsedSwap.ok) throw new Error('lecture');
    expect(replayNotice(parsedSwap.notice).ok).toBe(false);
  });

  it('plusieurs plaques : les étapes d’un module construit à part ne déclenchent pas l’ajout d’une plaque', () => {
    const { game, ids } = house();
    game.addPlate(0, 'x+', 16, 'gris');
    game.createModule(ids, 'Arbre');
    const notice = buildNotice(game.model, game.baseColor, 6, game.modules);
    const plateStep = notice.steps.findIndex((s) => s.plate !== undefined);
    // La plaque n'est utilisée par rien : elle vient à la fin, et non au milieu du module.
    expect(plateStep).toBe(notice.steps.length - 1);
    expect(sameConstruction(replayNotice(notice).model, game.model)).toBe(true);
  });
});

describe('fichiers', () => {
  it('le projet garde les modules ; un ancien fichier sans modules s’ouvre sans module', () => {
    const { game, ids } = house();
    game.createModule(ids, 'Arbre');
    const data = projectFromGame(game, { id: 'essai', name: 'Essai', createdAt: 1, updatedAt: 1 });
    expect(data.modules).toEqual([{ id: 1, name: 'Arbre', pieces: [...ids].sort((a, b) => a - b) }]);
    const parsed = parseProject(JSON.parse(serializeProject(data)));
    if (!parsed.ok) throw new Error('lecture');
    expect(gameFromProject(parsed.data).modules).toHaveLength(1);
    const { modules: _drop, ...old } = data;
    void _drop;
    const legacy = parseProject(JSON.parse(JSON.stringify(old)));
    expect(legacy.ok && gameFromProject(legacy.data).modules.length).toBe(0);
  });

  it('refuse un module avec une pièce inconnue, ou une pièce dans deux modules', () => {
    const { game, ids } = house();
    const base = projectFromGame(game, { id: 'essai', name: 'Essai', createdAt: 1, updatedAt: 1 });
    const unknown = { ...base, modules: [{ id: 1, name: 'A', pieces: [ids[0]!, 9999] }] };
    expect(parseProject(JSON.parse(JSON.stringify(unknown))).ok).toBe(false);
    const twice = { ...base, modules: [{ id: 1, name: 'A', pieces: [ids[0]!, ids[1]!] }, { id: 2, name: 'B', pieces: [ids[1]!, ids[2]!] }] };
    expect(parseProject(JSON.parse(JSON.stringify(twice))).ok).toBe(false);
  });
});

describe('module commencé sans pièce', () => {
  it('les pièces posées ensuite en font partie, jusqu’à ce qu’on le termine', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    put(game, 'brick-2x4', 2, 0, 2, 'blanc');
    const begin = game.beginModule('Arbre');
    expect(begin.ok).toBe(true);
    expect(game.beginModule('Autre')).toEqual({ ok: false, reason: 'en_cours' });
    expect(game.finishModule()).toEqual({ ok: false, reason: 'trop_peu' });
    const a = put(game, 'brick-1x1', 10, 0, 10, 'marron');
    const b = put(game, 'brick-2x2', 10, 3, 10, 'vert');
    expect(game.buildingModule?.pieceIds).toEqual([a.id, b.id]);
    const done = game.finishModule();
    expect(done.ok).toBe(true);
    expect(game.modules).toHaveLength(1);
    // Terminé : une pièce posée ensuite n'en fait plus partie.
    const c = put(game, 'brick-1x1', 12, 0, 12, 'rouge');
    expect(game.moduleOf(c.id)).toBeUndefined();
    // Le module neuf se met dans la notice comme les autres.
    const notice = buildNotice(game.model, game.baseColor, 6, game.modules);
    expect(notice.steps.filter(isModuleBuild).length).toBeGreaterThan(0);
    expect(sameConstruction(replayNotice(notice).model, game.model)).toBe(true);
  });

  it('refuse de le terminer si une pièce repose sur une pièce qui n’en fait pas partie, et le laisse en cours', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    put(game, 'brick-2x4', 2, 0, 2, 'blanc');
    put(game, 'brick-2x4', 2, 3, 2, 'sable');
    game.beginModule('Toit');
    put(game, 'brick-2x2', 2, 6, 2, 'rouge'); // posée sur le mur, qui n'est pas dans le module, alors que le module a aussi une pièce au sol
    put(game, 'brick-1x1', 10, 0, 10, 'jaune');
    expect(game.finishModule()).toEqual({ ok: false, reason: 'sans_appui' });
    expect(game.buildingModule).toBeDefined();
  });

  it('défaire le module en cours rend la main ; un module en cours à zéro ou une pièce n’est pas enregistré', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    const begin = game.beginModule('Vide');
    if (!begin.ok) throw new Error('début');
    put(game, 'brick-1x1', 4, 0, 4, 'rouge');
    expect(game.modules).toHaveLength(0);
    const data = projectFromGame(game, { id: 'essai', name: 'Essai', createdAt: 1, updatedAt: 1 });
    expect(data.modules).toEqual([]);
    game.dissolveModule(begin.module.id);
    expect(game.beginModule('Autre').ok).toBe(true);
  });
});

describe('copies d’un module', () => {
  /** Un module de deux pièces (une roue : un support et un dessus), qu'on copie trois fois, dont une tournée. */
  function wheels() {
    const game = new Game(24, 24, 'vert', () => 0);
    const a = put(game, 'brick-2x4', 2, 0, 2, 'noir');
    const b = put(game, 'brick-2x2', 2, 3, 2, 'jaune');
    const created = game.createModule([a.id, b.id], 'Roue');
    if (!created.ok) throw new Error('création');
    return { game, module: created.module };
  }
  const copy = (game: Game, moduleId: number, ids: readonly number[], turns: number, x: number, z: number) => {
    const lift = game.liftModuleCopy(moduleId, ids);
    if (!lift.ok) throw new Error(lift.reason);
    const out = game.dropGroup({ x, y: 0, z, turns });
    if (!out.ok) throw new Error(`pose de la copie refusée : ${out.reason}`);
  };

  it('soulever une copie ne touche pas aux pièces ; la poser ajoute des pièces neuves et un exemplaire, en un pas d’historique', () => {
    const { game, module } = wheels();
    const before = game.model.count;
    expect(game.liftModuleCopy(module.id, module.pieceIds).ok).toBe(true);
    expect(game.model.count).toBe(before);
    game.cancelLift();
    expect(game.model.count).toBe(before);
    expect(game.exportState().pieces).toHaveLength(before);
    copy(game, module.id, module.pieceIds, 0, 10, 2);
    expect(game.model.count).toBe(before + 2);
    expect(game.modules[0]!.copies).toHaveLength(1);
    game.undo();
    expect(game.model.count).toBe(before);
    expect(game.modules[0]!.copies).toBeUndefined();
    game.redo();
    expect(game.modules[0]!.copies).toHaveLength(1);
  });

  it('refuse de poser la copie sur l’original', () => {
    const { game, module } = wheels();
    game.liftModuleCopy(module.id, module.pieceIds);
    expect(game.dropGroup({ x: 2, y: 0, z: 2, turns: 0 }).ok).toBe(false);
  });

  it('la notice construit le module une fois (« 3 exemplaires ») puis le pose trois fois, même tourné ; elle se rejoue', () => {
    const { game, module } = wheels();
    copy(game, module.id, module.pieceIds, 0, 10, 2);
    copy(game, module.id, module.pieceIds, 1, 2, 10);
    const notice = buildNotice(game.model, game.baseColor, 6, game.modules);
    const builds = notice.steps.filter(isModuleBuild);
    const places = notice.steps.filter((s) => s.module?.role === 'place');
    expect(builds.length).toBeGreaterThan(0);
    expect(builds.every((s) => s.module?.instances === 3)).toBe(true);
    expect(places.map((s) => `${s.module?.instance}/${s.module?.instances}`)).toEqual(['1/3', '2/3', '3/3']);
    const replay = replayNotice(notice);
    expect(replay.errors).toEqual([]);
    expect(sameConstruction(replay.model, game.model)).toBe(true);
    expect(noticePieceCount(notice)).toBe(game.model.count);
    // Les copies sont des pièces de plus : 6 pièces posées en tout, 2 construites à part.
    expect(builds.flatMap((s) => s.pieces)).toHaveLength(2);
  });

  it('une copie qui n’a plus la même forme est ignorée : ses pièces sont posées comme les autres', () => {
    const { game, module } = wheels();
    copy(game, module.id, module.pieceIds, 0, 10, 2);
    const extra = game.modules[0]!.copies![0]!;
    const top = game.model.get(extra[1]!)!;
    game.remove(top.id);
    put(game, 'brick-2x2', top.x, top.y, top.z, 'rouge');
    const notice = buildNotice(game.model, game.baseColor, 6, game.modules);
    expect(notice.steps.filter((s) => s.module?.role === 'place')).toHaveLength(1);
    expect(sameConstruction(replayNotice(notice).model, game.model)).toBe(true);
  });

  it('les copies sont enregistrées dans le projet et relues', () => {
    const { game, module } = wheels();
    copy(game, module.id, module.pieceIds, 0, 10, 2);
    const data = projectFromGame(game, { id: 'essai', name: 'Essai', createdAt: 1, updatedAt: 1 });
    expect(data.modules?.[0]?.copies).toHaveLength(1);
    const parsed = parseProject(JSON.parse(serializeProject(data)));
    if (!parsed.ok) throw new Error('lecture');
    expect(gameFromProject(parsed.data).modules[0]!.copies).toHaveLength(1);
    const bad = { ...data, modules: [{ ...data.modules![0]!, copies: [[9999, 9998]] }] };
    expect(parseProject(JSON.parse(JSON.stringify(bad))).ok).toBe(false);
  });

  it('toucher une pièce d’une copie la donne comme exemplaire du module', () => {
    const { game, module } = wheels();
    copy(game, module.id, module.pieceIds, 0, 10, 2);
    const copyIds = game.modules[0]!.copies![0]!;
    const found = game.moduleInstance(copyIds[0]!);
    expect(found?.index).toBe(1);
    expect(found?.ids).toEqual(copyIds);
    expect(game.moduleInstance(module.pieceIds[0]!)?.index).toBe(0);
  });
});
