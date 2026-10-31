// Surface en plusieurs plaques : appuis au sol, ajout (et décalage), annulation, fichiers et notice.

import { describe, expect, it } from 'vitest';
import { Game, edgeHints, plateBeside } from './game';
import { Model } from './model';
import { buildNotice, noticePlates, parseNotice, replayNotice, sameConstruction, serializeNotice } from './notice';
import { gameFromProject, parseProject, platesOf, projectFromGame, serializeProject } from './project';
import { checkInvariants, evaluatePlacement } from './rules';

const spec = (typeId: string, x: number, y: number, z: number, orient = 0, color = 'rouge') => ({ typeId, color, x, y, z, orient });

describe('ajouter une plaque', () => {
  it('à droite : la surface s’élargit, rien ne bouge', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    game.place(spec('brick-2x4', 2, 0, 2));
    const out = game.addPlate(0, 'x+', 24, 'gris');
    expect(out).toEqual({ ok: true, plate: { x: 16, z: 0, w: 24, l: 24, color: 'gris' }, dx: 0, dz: 0 });
    expect([game.model.baseW, game.model.baseL]).toEqual([40, 24]);
    expect(game.model.all()[0]!.x).toBe(2);
  });

  it('à gauche : tout se décale pour garder le coin en (0, 0), et ↶ remet tout en place', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    game.place(spec('brick-2x4', 2, 0, 2));
    const before = JSON.stringify(game.snapshot());
    const out = game.addPlate(0, 'x-', 16, 'sable');
    expect(out.ok && [out.dx, out.dz]).toEqual([16, 0]);
    expect(game.model.plates.map((p) => [p.x, p.z])).toEqual([[16, 0], [0, 0]]);
    expect(game.model.all()[0]!.x).toBe(18);
    expect(checkInvariants(game.model)).toEqual([]);
    const after = JSON.stringify(game.snapshot());
    game.undo();
    expect(JSON.stringify(game.snapshot())).toBe(before);
    game.redo();
    expect(JSON.stringify(game.snapshot())).toBe(after);
  });

  it('des poses avant et après un décalage s’annulent toutes dans l’ordre', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    game.place(spec('brick-2x2', 4, 0, 4));
    game.addPlate(0, 'z-', 16, 'bleu');
    game.place(spec('brick-2x2', 4, 0, 2)); // sur la nouvelle plaque, au fond
    game.addPlate(1, 'x-', 16, 'gris');
    game.place(spec('plate-2x4', 15, 0, 15, 1)); // à cheval sur trois plaques
    expect(checkInvariants(game.model)).toEqual([]);
    while (game.canUndo) game.undo();
    expect(game.model.count).toBe(0);
    expect(game.model.plates).toHaveLength(1);
    while (game.canRedo) game.redo();
    expect(game.model.count).toBe(3);
    expect(game.model.plates).toHaveLength(3);
    expect(checkInvariants(game.model)).toEqual([]);
  });

  it('refuse une plaque qui en chevauche une autre, ou une surface de plus de 128 tenons', () => {
    const game = new Game(32, 32, 'vert', () => 0);
    expect(game.addPlate(0, 'x+', 32, 'gris').ok).toBe(true);
    expect(game.addPlate(0, 'x+', 16, 'gris')).toEqual({ ok: false, reason: 'occupe' });
    expect(game.addPlate(1, 'x+', 32, 'bleu').ok).toBe(true);
    expect(game.addPlate(2, 'x+', 32, 'sable').ok).toBe(true); // 128 de large : la limite
    expect(game.model.baseW).toBe(128);
    expect(game.addPlate(3, 'x+', 16, 'gris')).toEqual({ ok: false, reason: 'trop_grand' });
    expect(plateBeside(game.model.plates, game.model.plates[0]!, 'z+', 32, 'bleu').ok).toBe(true);
  });
});

describe('appuis sur plusieurs plaques', () => {
  /** Deux plaques 16 × 16 séparées d'un vide : la seconde est ajoutée au bout d'une 16 × 16 plus courte en Z. */
  function gap(): Game {
    const game = new Game(16, 16, 'vert', () => 0);
    game.addPlate(0, 'x+', 24, 'gris'); // x 16..39, z 0..23 : sous la première (z 0..15) il reste un vide en x 0..15, z 16..23
    return game;
  }

  it('une pièce enjambe la jonction de deux plaques', () => {
    const game = gap();
    expect(game.place(spec('brick-2x4', 14, 0, 4, 1)).ok).toBe(true);
  });

  it('au sol, rien ne tient au-dessus du vide ; en porte-à-faux, si', () => {
    const game = gap();
    expect(evaluatePlacement(game.model, spec('brick-2x2', 4, 0, 18)).reason).toBe('sans_appui');
    game.place(spec('brick-2x2', 4, 0, 12));
    expect(evaluatePlacement(game.model, spec('plate-2x8', 4, 3, 12)).ok).toBe(true); // déborde au-dessus du vide
    // Au sol, à moitié sur la plaque : elle tient par ses cases au-dessus de la plaque.
    expect(evaluatePlacement(game.model, spec('brick-2x4', 8, 0, 14)).ok).toBe(true);
  });
});

describe('fichiers et notice', () => {
  function town(): Game {
    const game = new Game(16, 16, 'vert', () => 0);
    game.addPlate(0, 'x-', 24, 'gris');
    game.place(spec('brick-2x4', 22, 0, 2, 1, 'jaune'));
    game.place(spec('brick-2x2', 3, 0, 3, 0, 'bleu'));
    return game;
  }

  it('le projet garde les plaques ; un ancien fichier (une seule plaque) s’ouvre comme avant', () => {
    const game = town();
    const data = projectFromGame(game, { id: 'essai', name: 'Essai', createdAt: 1, updatedAt: 1 });
    expect(data.base).toEqual({ w: 40, l: 24, color: 'vert' });
    const parsed = parseProject(JSON.parse(serializeProject(data)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const back = gameFromProject(parsed.data);
    expect(JSON.stringify(back.snapshot())).toBe(JSON.stringify(game.snapshot()));
    const legacy = new Game(24, 24, 'sable', () => 0);
    const { plates: _drop, ...old } = projectFromGame(legacy, { id: 'vieux', name: 'Vieux', createdAt: 1, updatedAt: 1 });
    void _drop;
    const oldParsed = parseProject(JSON.parse(JSON.stringify(old)));
    expect(oldParsed.ok && platesOf(oldParsed.data)).toEqual([{ x: 0, z: 0, w: 24, l: 24, color: 'sable' }]);
  });

  it('refuse des plaques qui se chevauchent ou ne collent pas à la boîte de la surface', () => {
    const data = projectFromGame(town(), { id: 'essai', name: 'Essai', createdAt: 1, updatedAt: 1 });
    const overlap = { ...data, plates: [...data.plates!, { x: 0, z: 0, w: 16, l: 16, color: 'vert' }] };
    expect(parseProject(JSON.parse(JSON.stringify(overlap))).ok).toBe(false);
    const wrongBox = { ...data, base: { ...data.base, w: 64 } };
    expect(parseProject(JSON.parse(JSON.stringify(wrongBox))).ok).toBe(false);
  });

  it('la notice garde les plaques et se rejoue à l’identique', () => {
    const game = town();
    const notice = buildNotice(game.model, game.baseColor);
    expect(noticePlates(notice)).toHaveLength(2);
    const parsed = parseNotice(JSON.parse(serializeNotice(notice)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const replay = replayNotice(parsed.notice);
    expect(replay.errors).toEqual([]);
    expect(sameConstruction(replay.model, game.model)).toBe(true);
  });

  it('une notice d’une seule plaque ne change pas de format', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    game.place(spec('brick-2x2', 2, 0, 2));
    expect('plates' in buildNotice(game.model, game.baseColor)).toBe(false);
  });
});

describe('modèle', () => {
  it('la clé d’une case ne dépend pas de la taille de la surface', () => {
    const model = new Model(16, 16);
    expect(model.onPlate(15, 15)).toBe(true);
    expect(model.onPlate(16, 0)).toBe(false);
  });
});

describe('cases « + » près des bords', () => {
  it('apparaissent du côté du bord où l’on construit, pas ailleurs', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    const plates = game.model.plates;
    expect(edgeHints(plates, 6, 6, 2, 4, [16, 24, 32])).toEqual([]);
    expect(edgeHints(plates, 14, 6, 2, 4, [16, 24, 32]).map((h) => h.side)).toEqual(['x+']);
    expect(edgeHints(plates, 0, 0, 2, 2, [16, 24, 32]).map((h) => h.side)).toEqual(['x-', 'z-']);
  });

  it('l’aperçu prend la taille de la plaque d’origine ; rien du côté où une plaque est déjà collée', () => {
    const game = new Game(32, 32, 'vert', () => 0);
    expect(edgeHints(game.model.plates, 30, 4, 2, 2, [16, 24, 32])[0]!.preview).toEqual({ x: 32, z: 0, w: 32, l: 32, color: 'vert' });
    game.addPlate(0, 'x+', 32, 'gris');
    expect(edgeHints(game.model.plates, 30, 4, 2, 2, [16, 24, 32]).map((h) => `${h.from}${h.side}`)).toEqual([]);
  });

  it('si la taille d’origine ne tient plus, propose la plus grande qui tient', () => {
    const game = new Game(32, 32, 'vert', () => 0);
    game.addPlate(0, 'x+', 16, 'gris'); // surface de 48 de large : à droite de la grise, il reste 16
    const hints = edgeHints(game.model.plates, 46, 4, 2, 2, [16, 24, 32]);
    expect(hints.map((h) => [h.from, h.side, h.preview.w])).toEqual([[1, 'x+', 16]]);
  });
});

describe('plaques dans la notice', () => {
  /** Quatre plaques : des pièces sur deux seulement (la première et celle de droite). */
  function four(): Game {
    const game = new Game(16, 16, 'vert', () => 0);
    game.addPlate(0, 'x+', 16, 'gris'); // 1 : x 16..31
    game.addPlate(0, 'z+', 16, 'sable'); // 2 : z 16..31
    game.addPlate(1, 'z+', 16, 'bleu'); // 3 : x 16..31, z 16..31
    game.place(spec('brick-2x2', 2, 0, 2, 0, 'rouge'));
    game.place(spec('brick-2x2', 20, 0, 4, 0, 'jaune'));
    return game;
  }

  it('une étape par plaque ajoutée : juste avant de s’en servir, les plaques vides à la fin', () => {
    const notice = buildNotice(four().model, 'vert');
    const kinds = notice.steps.map((s) => (s.plate !== undefined ? `plaque ${s.plate}` : `${s.pieces.length} pièce(s)`));
    // Les deux briques sont trop éloignées pour une même étape : la plaque 1 (grise) vient juste avant la jaune, posée dessus.
    expect(kinds).toEqual(['1 pièce(s)', 'plaque 1', '1 pièce(s)', 'plaque 2', 'plaque 3']);
  });

  it('le rejeu ajoute les plaques à leur étape et redonne la construction', () => {
    const game = four();
    const notice = buildNotice(game.model, game.baseColor);
    const replay = replayNotice(notice);
    expect(replay.errors).toEqual([]);
    expect(replay.model.plates).toHaveLength(4);
    expect(sameConstruction(replay.model, game.model)).toBe(true);
    expect(parseNotice(JSON.parse(serializeNotice(notice))).ok).toBe(true);
  });

  it('refuse une notice où une plaque a deux étapes ; accepte l’ancienne forme sans étape de plaque', () => {
    const notice = buildNotice(four().model, 'vert');
    const twice = { ...notice, steps: [...notice.steps, { pieces: [], plate: 1 }] };
    expect(parseNotice(JSON.parse(JSON.stringify(twice))).ok).toBe(false);
    const legacy = { ...notice, steps: notice.steps.filter((s) => s.plate === undefined) };
    const parsed = parseNotice(JSON.parse(JSON.stringify(legacy)));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(replayNotice(parsed.notice).errors).toEqual([]);
  });
});

describe('grande surface', () => {
  it('une construction sur 128 × 128 tenons s’enregistre, se relit et se rejoue', () => {
    const game = new Game(32, 32, 'vert', () => 0);
    for (let i = 0; i < 3; i++) game.addPlate(i, 'x+', 32, 'gris');
    for (let i = 0; i < 4; i++) game.addPlate(i, 'z+', 32, 'sable');
    for (let i = 4; i < 7; i++) game.addPlate(i, 'z+', 32, 'bleu');
    expect([game.model.baseW, game.model.baseL]).toEqual([128, 96]);
    game.addPlate(8, 'z+', 32, 'vert');
    expect(game.model.baseL).toBe(128);
    expect(game.place(spec('brick-2x4', 4, 0, 124)).ok).toBe(true); // tout au bout, sur la dernière plaque
    const data = projectFromGame(game, { id: 'grand', name: 'Grand', createdAt: 1, updatedAt: 1 });
    const parsed = parseProject(JSON.parse(serializeProject(data)));
    expect(parsed.ok).toBe(true);
    const notice = buildNotice(game.model, game.baseColor);
    expect(parseNotice(JSON.parse(serializeNotice(notice))).ok).toBe(true);
    expect(replayNotice(notice).errors).toEqual([]);
  });
});
