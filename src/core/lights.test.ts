// Finitions givrée et lumineuse, interrupteurs : quelles pièces s'allument, et l'état gardé dans les fichiers.

import { describe, expect, it } from 'vitest';
import { colorLabel } from '../i18n/colorLabel';
import { typeName } from '../i18n/typeLabel';
import { SWITCH_ID, baseColorId, canRotate, finishOf, isGlow, isKnownColor, isTranslucent, requireType, studCells, typesOfKind, withFinish } from './catalogue';
import { Game } from './game';
import { litPieces } from './lights';
import { buildNotice, replayNotice, sameConstruction } from './notice';
import { parseProject, projectFromGame, serializeProject, gameFromProject } from './project';

const spec = (typeId: string, x: number, y: number, z: number, color = 'rouge', orient = 0) => ({ typeId, color, x, y, z, orient });

function put(game: Game, typeId: string, x: number, y: number, z: number, color = 'rouge', orient = 0) {
  const out = game.place(spec(typeId, x, y, z, color, orient));
  if (!out.ok) throw new Error(`pose refusée : ${typeId} (${out.reason})`);
  return out.piece;
}

describe('finitions', () => {
  it('quatre finitions par couleur, notées par un suffixe', () => {
    expect(['jaune', 'jaune-verre', 'jaune-givre', 'jaune-lumi'].map(finishOf)).toEqual(['opaque', 'clear', 'frost', 'glow']);
    expect(baseColorId('rose-givre')).toBe('rose');
    expect(withFinish('rose-givre', 'glow')).toBe('rose-lumi');
    expect(withFinish('rose-lumi', 'opaque')).toBe('rose');
    expect(isKnownColor('bleu-lumi')).toBe(true);
    expect(isKnownColor('bleu-paillettes')).toBe(false);
    expect(isTranslucent('vert-givre')).toBe(true);
    expect(isTranslucent('vert-lumi')).toBe(false);
    expect(isGlow('vert-lumi')).toBe(true);
  });

  it('les noms de couleur disent la finition', () => {
    expect(['rouge-verre', 'rouge-givre', 'rouge-lumi'].map(colorLabel)).toEqual(['Rouge transparent', 'Rouge givré', 'Rouge lumineux']);
  });
});

describe('interrupteur', () => {
  it('une tuile 1×2 lisse, de deux plaques de haut (la manette), quatre orientations', () => {
    const type = requireType(SWITCH_ID);
    expect([type.kind, type.w, type.l, type.h]).toEqual(['tile', 1, 2, 2]);
    expect(studCells(type, 0)).toEqual([]);
    expect(canRotate(type)).toBe(true);
    expect(typeName(type)).toBe('Interrupteur 1×2');
  });

  it('n’est dans aucun onglet du tiroir (il se prend sous la finition Lumineux)', () => {
    for (const kind of ['brick', 'plate', 'tile', 'slope', 'wheel'] as const) {
      expect(typesOfKind(kind).map((t) => t.id)).not.toContain(SWITCH_ID);
    }
  });

  it('ne s’allume et ne s’éteint que s’il s’agit d’un interrupteur', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    const sw = put(game, SWITCH_ID, 2, 0, 2);
    const brick = put(game, 'brick-2x2', 6, 0, 6);
    expect(game.toggleSwitch(sw.id)).toBe(false);
    expect(game.toggleSwitch(sw.id)).toBe(true);
    expect(game.toggleSwitch(brick.id)).toBeNull();
  });
});

describe('pièces lumineuses allumées', () => {
  /** Deux maisons : l'une avec un interrupteur, l'autre sans ; une lampe lumineuse sur chacune. */
  function town() {
    const game = new Game(24, 24, 'vert', () => 0);
    const base1 = put(game, 'plate-4x4', 2, 0, 2, 'gris');
    const lamp1 = put(game, 'brick-1x1', 2, 1, 2, 'jaune-lumi');
    const sw = put(game, SWITCH_ID, 4, 1, 2, 'blanc');
    put(game, 'plate-4x4', 12, 0, 12, 'gris');
    const lamp2 = put(game, 'brick-1x1', 12, 1, 12, 'orange-lumi');
    const loose = put(game, 'brick-1x1', 20, 0, 20, 'bleu-lumi');
    return { game, base1, lamp1, sw, lamp2, loose };
  }
  const lit = (game: Game) => litPieces(game.model, game.switchesOff, game.switchLinks);

  it('sans lien : toujours allumée, même si l’on touche l’interrupteur', () => {
    const { game, sw, lamp1, lamp2, loose } = town();
    game.toggleSwitch(sw.id);
    expect(lit(game)).toEqual(new Set([lamp1.id, lamp2.id, loose.id]));
  });

  it('l’interrupteur n’éteint que les lumières qu’on lui a reliées', () => {
    const { game, lamp1, sw, lamp2, loose } = town();
    expect(game.toggleLink(sw.id, lamp1.id)).toBe(true);
    game.toggleSwitch(sw.id);
    expect(lit(game).has(lamp1.id)).toBe(false);
    expect(lit(game).has(lamp2.id)).toBe(true);
    expect(lit(game).has(loose.id)).toBe(true);
    game.toggleSwitch(sw.id);
    expect(lit(game).has(lamp1.id)).toBe(true);
  });

  it('un interrupteur peut commander une lumière loin de lui, et en détacher une', () => {
    const { game, sw, lamp1, lamp2 } = town();
    game.toggleLink(sw.id, lamp2.id);
    game.toggleLink(sw.id, lamp1.id);
    game.toggleSwitch(sw.id);
    expect(lit(game).has(lamp2.id)).toBe(false);
    expect(game.toggleLink(sw.id, lamp1.id)).toBe(false);
    expect(lit(game).has(lamp1.id)).toBe(true);
  });

  it('refuse de relier autre chose qu’une pièce lumineuse à un interrupteur', () => {
    const { game, sw, base1, lamp1 } = town();
    expect(game.toggleLink(sw.id, base1.id)).toBeNull();
    expect(game.toggleLink(base1.id, lamp1.id)).toBeNull();
  });

  it('une lumière reliée à deux interrupteurs : allumée tant que l’un d’eux l’est', () => {
    const { game, lamp1, sw } = town();
    const sw2 = put(game, SWITCH_ID, 2, 1, 4, 'blanc');
    game.toggleLink(sw.id, lamp1.id);
    game.toggleLink(sw2.id, lamp1.id);
    game.toggleSwitch(sw.id);
    expect(lit(game).has(lamp1.id)).toBe(true);
    game.toggleSwitch(sw2.id);
    expect(lit(game).has(lamp1.id)).toBe(false);
  });

  it('deux circuits dans une même construction s’éteignent séparément', () => {
    const { game, lamp1, sw } = town();
    const lampB = put(game, 'brick-1x1', 3, 1, 3, 'jaune-lumi');
    const swB = put(game, SWITCH_ID, 2, 1, 4, 'blanc');
    game.toggleLink(sw.id, lamp1.id);
    game.toggleLink(swB.id, lampB.id);
    game.toggleSwitch(sw.id);
    expect(lit(game).has(lamp1.id)).toBe(false);
    expect(lit(game).has(lampB.id)).toBe(true);
  });
});

describe('toutes les lumières', () => {
  it('le bouton éteint puis rallume tout, même un interrupteur qu’on ne peut pas toucher', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    put(game, 'plate-4x4', 2, 0, 2, 'gris');
    const sw = put(game, SWITCH_ID, 2, 1, 2, 'blanc');
    const lamp = put(game, 'brick-1x1', 4, 1, 4, 'jaune-lumi');
    put(game, 'brick-1x4', 2, 1, 4, 'rouge'); // un mur à côté de l'interrupteur
    game.toggleLink(sw.id, lamp.id);
    expect(game.anySwitchOn).toBe(true);
    game.setAllSwitches(false);
    expect(game.anySwitchOn).toBe(false);
    expect(litPieces(game.model, game.switchesOff, game.switchLinks).has(lamp.id)).toBe(false);
    game.setAllSwitches(true);
    expect(game.switchesOff.has(sw.id)).toBe(false);
    expect(litPieces(game.model, game.switchesOff, game.switchLinks).has(lamp.id)).toBe(true);
  });
});

describe('fichiers et notice', () => {
  it('le projet garde les interrupteurs éteints ; un ancien fichier sans ce champ s’ouvre tout allumé', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    put(game, 'plate-2x4', 2, 0, 2, 'gris');
    const sw = put(game, SWITCH_ID, 2, 1, 2, 'blanc');
    const lamp = put(game, 'brick-1x1', 3, 1, 4, 'rose-lumi');
    put(game, 'brick-2x2', 8, 0, 8, 'ciel-givre');
    game.toggleSwitch(sw.id);
    game.toggleLink(sw.id, lamp.id);
    const data = projectFromGame(game, { id: 'essai', name: 'Essai', createdAt: 1, updatedAt: 1 });
    const parsed = parseProject(JSON.parse(serializeProject(data)));
    expect(parsed.ok && parsed.data.switchesOff).toEqual([sw.id]);
    if (!parsed.ok) return;
    expect(gameFromProject(parsed.data).switchesOff.has(sw.id)).toBe(true);
    const { switchesOff: _drop, ...old } = data;
    void _drop;
    const legacy = parseProject(JSON.parse(JSON.stringify(old)));
    expect(legacy.ok && gameFromProject(legacy.data).switchesOff.size).toBe(0);
    expect(parsed.data.switchLinks).toEqual([[sw.id, [lamp.id]]]);
    expect(gameFromProject(parsed.data).switchLinks.get(sw.id)).toEqual(new Set([lamp.id]));
  });

  it('un ancien fichier sans liens : chaque lumière suit l’interrupteur le plus proche de son ensemble', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    put(game, 'plate-4x8', 2, 0, 2, 'gris');
    const swA = put(game, SWITCH_ID, 2, 1, 2, 'blanc');
    const swB = put(game, SWITCH_ID, 2, 1, 8, 'blanc');
    const lampA = put(game, 'brick-1x1', 3, 1, 3, 'rose-lumi');
    const lampB = put(game, 'brick-1x1', 3, 1, 8, 'rose-lumi');
    const data = projectFromGame(game, { id: 'essai', name: 'Essai', createdAt: 1, updatedAt: 1 });
    const { switchLinks: _drop, ...old } = data;
    void _drop;
    const parsed = parseProject(JSON.parse(JSON.stringify(old)));
    if (!parsed.ok) throw new Error('lecture');
    const loaded = gameFromProject(parsed.data);
    expect(loaded.switchLinks.get(swA.id)).toEqual(new Set([lampA.id]));
    expect(loaded.switchLinks.get(swB.id)).toEqual(new Set([lampB.id]));
  });

  it('refuse un lien vers une pièce qui n’est pas lumineuse', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    const sw = put(game, SWITCH_ID, 2, 0, 2, 'blanc');
    const brick = put(game, 'brick-2x2', 6, 0, 6);
    const data = { ...projectFromGame(game, { id: 'essai', name: 'Essai', createdAt: 1, updatedAt: 1 }), switchLinks: [[sw.id, [brick.id]]] };
    expect(parseProject(JSON.parse(JSON.stringify(data))).ok).toBe(false);
  });

  it('refuse un interrupteur éteint qui n’en est pas un', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    const brick = put(game, 'brick-2x2', 2, 0, 2);
    const data = { ...projectFromGame(game, { id: 'essai', name: 'Essai', createdAt: 1, updatedAt: 1 }), switchesOff: [brick.id] };
    expect(parseProject(JSON.parse(JSON.stringify(data))).ok).toBe(false);
  });

  it('la notice rejoue les finitions et l’interrupteur', () => {
    const game = new Game(16, 16, 'vert', () => 0);
    put(game, 'plate-2x4', 2, 0, 2, 'gris');
    put(game, SWITCH_ID, 2, 1, 2, 'blanc', 3);
    put(game, 'brick-1x1', 3, 1, 4, 'rose-lumi');
    put(game, 'brick-2x2', 8, 0, 8, 'ciel-givre');
    const replay = replayNotice(buildNotice(game.model, game.baseColor));
    expect(replay.errors).toEqual([]);
    expect(sameConstruction(replay.model, game.model)).toBe(true);
  });
});
