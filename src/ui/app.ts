// Interface : barre d'outils, panneau de choix, gestes tactiles et clavier. Aucune règle ici : tout passe par le cœur.

import {
  BASE_COLORS,
  BASE_SIZES,
  COLORS,
  baseColorId,
  canRotate,
  FINISHES,
  SWITCH_ID,
  colorHex,
  finishOf,
  footprintSize,
  isGlow,
  isOpening,
  isSwitch,
  withFinish,
  nextOrient,
  normalizeOrient,
  requireType,
  typesOfKind,
  type Finish,
  type Orient,
  type PieceKind,
} from '../core/catalogue';
import { Game, edgeHints, plateBeside, type PlateHint } from '../core/game';
import { MAX_EXTENT } from '../core/model';
import { evaluateGroupPlacement, groupAbove, groupBounds, groupConnected, groupFootprint, groupLanding, transformGroup } from '../core/group';
import { buildDenseReference } from '../core/reference';
import { evaluatePlacement, landingLevel, type PlacementReason } from '../core/rules';
import { colorLabel } from '../i18n/colorLabel';
import { sizeText, typeName } from '../i18n/typeLabel';
import { t, type Key } from '../i18n/fr';
import { BuildScene, type GhostInfo, type Graphics, type InteractionMode, type Quality } from '../render/scene';
import { partIconSvg } from '../export/partIcon';
import { icon, type IconName } from './icons';
import { Sound } from './sound';
import { Gallery } from './gallery';
import { Examples } from './examples';
import { Install } from './install';
import { Welcome } from './welcome';
import { Guide } from './guide';
import logoUrl from '../assets/logo.png';
import type { Facts } from './guideMissions';
import { createNotice } from './noticeFlow';
import { ProjectManager } from './projectManager';

type Tool = 'place' | 'remove' | 'pick' | 'move' | 'link';

interface Recent {
  typeId: string;
  color: string;
  orient: Orient;
}

interface State {
  tool: Tool;
  mode: InteractionMode;
  kind: PieceKind;
  typeId: string;
  color: string;
  orient: Orient;
  gx: number;
  gz: number;
  /** Décalage de niveau par rapport au point de chute (négatif : se glisser sous un surplomb). */
  dy: number;
  selected: number | null;
  recents: Recent[];
}

const KINDS: PieceKind[] = ['brick', 'plate', 'tile', 'slope', 'wheel', 'opening'];
/** Décalage vers le haut de la visée au doigt, pour que le doigt ne masque pas la pièce. */
const TOUCH_AIM_OFFSET_PX = 64;
const TAP_MAX_MOVE_PX = 8;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'html') node.innerHTML = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

/** Texte français d'un refus de pose. */
function reasonText(reason: PlacementReason, maxLevel: number): string {
  return t(`reason.${reason}` as Key, { n: maxLevel / 3 });
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export class App {
  private readonly root: HTMLElement;
  private readonly debug: boolean;
  private scene!: BuildScene;
  private game!: Game;
  private unsubscribeGame: (() => void) | null = null;

  private readonly state: State = {
    tool: 'place',
    mode: 'placement',
    kind: 'brick',
    typeId: 'brick-2x4',
    color: 'rouge',
    orient: 0,
    gx: 0,
    gz: 0,
    dy: 0,
    selected: null,
    recents: [],
  };

  // Éléments
  private canvas!: HTMLCanvasElement;
  private toast!: HTMLElement;
  private status!: HTMLElement;
  private ceilingBtn!: HTMLButtonElement;
  /** Cases « + » affichées, et la fenêtre qui choisit la plaque à ajouter. */
  private plateHints: PlateHint[] = [];
  /** Réglage du menu : proposer des cases « + » au bord des plaques (gardé sur l'appareil). */
  private offerPlates = loadFlag(PLATES_KEY, true);
  private offerBtns = new Map<boolean, HTMLButtonElement>();
  private plateDialog!: HTMLElement;
  private openPlateDialog!: (hint: PlateHint) => void;
  private placeMini!: HTMLButtonElement;
  private moveControls!: HTMLElement;
  private moveInfo!: HTMLElement;
  private moveRow!: HTMLElement;
  private moveDropBtn!: HTMLButtonElement;
  private moveWholeBtn!: HTMLButtonElement;
  /** Ensemble soulevé : quarts de tour appliqués, et tout ce qui est attaché à la pièce touchée (pour « Tout l'ensemble »). */
  private liftTurns = 0;
  private liftConnected: number[] = [];
  /** Choix de pièce de l'outil Construire, mis de côté pendant qu'une pièce est soulevée (la pièce soulevée prend sa place dans l'état). */
  private liftSaved: { typeId: string; color: string; orient: Orient; kind: PieceKind; dy: number } | null = null;
  // Compteurs d'actions du joueur, lus par le guide.
  private counts = { turns: 0, undos: 0, redos: 0, picks: 0, removals: 0, moves: 0, opens: 0, examples: 0, lights: 0 };
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private viewBtn!: HTMLButtonElement;
  private viewPop!: HTMLElement;
  private viewFreeRow!: HTMLButtonElement;
  private viewVisitRow!: HTMLButtonElement;
  private visitExitBtn!: HTMLButtonElement;
  private linkControls!: HTMLElement;
  private linkInfo!: HTMLElement;
  /** Mode visite : on se promène et on touche les interrupteurs, sans poser ni retirer. */
  private visit = false;
  private visitSaved: { mode: InteractionMode; free: boolean } | null = null;
  /** Interrupteur choisi avec l'outil Relier. */
  private linkSwitchId: number | null = null;
  private viewModeRows = new Map<InteractionMode, HTMLButtonElement>();
  private toolBtns = new Map<Tool, HTMLButtonElement>();
  private kindBtns = new Map<PieceKind, HTMLButtonElement>();
  private sizeRow!: HTMLElement;
  private colorBtns = new Map<string, HTMLButtonElement>();
  private finishBtns = new Map<Finish, HTMLButtonElement>();
  private glowHint!: HTMLElement;
  private glowHintText!: HTMLElement;
  private colorName!: HTMLElement;
  private placeControls!: HTMLElement;
  private removeControls!: HTMLElement;
  private placeBtn!: HTMLButtonElement;
  private rotateBtn!: HTMLButtonElement;
  private padBox!: HTMLElement;
  private pieceChip!: HTMLButtonElement;
  private drawer!: HTMLElement;
  private removeInfo!: HTMLElement;
  private readonly sound = new Sound();
  private guide!: Guide;
  private examples!: Examples;
  private install!: Install;
  private welcome!: Welcome;
  private updateBanner: HTMLElement | null = null;
  private soundBtn!: HTMLButtonElement;
  private lightsBtn!: HTMLButtonElement;
  private recentWrap!: HTMLElement;
  private recentRow!: HTMLElement;
  private pickControls!: HTMLElement;
  private emptyHint!: HTMLElement;
  private qualityBtns = new Map<Quality, HTMLButtonElement>();
  /** Boutons des réglages avancés : chacun sait s'il correspond aux réglages actuels. */
  private graphicsBtns: Array<{ b: HTMLButtonElement; on: (g: Graphics) => boolean }> = [];
  private coarsePointer = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  private projects!: ProjectManager;
  private gallery!: Gallery;
  private banner!: HTMLElement;
  private nameInput!: HTMLInputElement;
  private saveInfo!: HTMLElement;
  private fileInput!: HTMLInputElement;
  private newCreateBtn!: HTMLButtonElement;
  private newConfirm!: HTMLElement;
  private openNewConfirm!: (size: number, color: string) => void;
  private menu!: HTMLElement;
  private noticeViewer!: HTMLElement;
  private noticeFrame!: HTMLIFrameElement;
  private noticeStatus!: HTMLElement;
  private noticeDownloadBtn!: HTMLButtonElement;
  private noticePrintBtn!: HTMLButtonElement;
  private noticeSlidesBtn!: HTMLButtonElement;
  private noticeHtml = '';
  private debugBox: HTMLElement | null = null;
  private toastTimer = 0;

  // Gestes
  private readonly pointers = new Map<number, { x: number; y: number; t: number; type: string }>();
  private tapCandidate: { id: number; x: number; y: number; t: number } | null = null;

  constructor(root: HTMLElement, debug: boolean) {
    this.root = root;
    this.debug = debug;
  }

  async start(quality: Quality): Promise<void> {
    this.build();
    try {
      this.scene = new BuildScene(this.canvas, quality);
      const saved = loadGraphics();
      if (saved) this.scene.setGraphics(saved);
    } catch {
      this.root.replaceChildren(h('p', { class: 'fatal' }, t('app.noWebgl')));
      return;
    }
    this.projects = new ProjectManager({
      installGame: (game) => this.installGame(game),
      captureThumbnail: () => this.scene.captureThumbnail(),
      notify: (text, kind) => this.showToast(text, kind),
      onStateChange: () => this.syncProjectUi(),
    });
    this.gallery = new Gallery(this.projects, () => this.syncProjectUi());
    this.root.append(this.gallery.element);
    this.examples = new Examples(this.projects, () => {
      this.counts.examples += 1;
      this.syncProjectUi();
    });
    this.root.append(this.examples.element);
    this.install = new Install();
    this.root.append(this.install.element);
    this.welcome = new Welcome(() => this.guide.start());
    this.root.append(this.welcome.element);
    this.bindEvents();
    this.scene.start();
    this.guide = new Guide(this.root, () => this.facts(), () => undefined);
    await this.projects.init();
    this.syncUi();
    // L'écran d'accueil, puis les missions, ne se lancent tout seuls qu'à la toute première ouverture de l'application, sur une construction
    // vide ; « Commencer les missions » lance le guide. L'ouverture est notée tout de suite : on peut les quitter ou recharger la page sans qu'elles reviennent.
    // Elles restent disponibles à tout moment : « Revoir le guide » du menu, ou le bouton ? sur la scène.
    if (!this.guideDone()) {
      this.markGuideDone();
      if (this.game.model.count === 0) this.welcome.open();
    }
  }

  private guideDone(): boolean {
    try {
      return localStorage.getItem('atelier-briques:guide') === 'fait';
    } catch {
      return false;
    }
  }

  private markGuideDone(): void {
    try {
      localStorage.setItem('atelier-briques:guide', 'fait');
    } catch {
      /* navigation privée : le guide pourra se relancer tout seul, sans gravité */
    }
  }

  /** Ce que le guide a besoin de savoir de l'état du jeu. */
  private facts(): Facts {
    const s = this.state;
    return {
      typeId: s.typeId,
      color: s.color,
      drawerOpen: !this.drawer.hidden,
      gx: s.gx,
      gz: s.gz,
      pieceCount: this.game.model.count,
      azimuth: this.scene.azimuth(),
      tool: s.tool,
      menuOpen: !this.menu.hidden,
      noticeOpen: !this.noticeViewer.hidden,
      rotatable: canRotate(requireType(s.typeId)),
      lifted: this.game.lifted !== null,
      stacked: this.game.model.all().filter((p) => p.y > 0).length,
      opening: isOpening(s.typeId),
      openingCount: this.game.model.all().filter((p) => isOpening(p.typeId)).length,
      visit: this.visit,
      viewMenuOpen: !this.viewPop.hidden,
      examplesOpen: this.examples.isOpen,
      hasSwitch: this.game.switches().length > 0,
      ...this.counts,
    };
  }

  // ------------------------------------------------------------------ partie

  /** Affiche une partie (nouvelle ou rouverte) : la gestion des projets appelle ceci à chaque changement de construction. */
  private installGame(game: Game): void {
    this.unsubscribeGame?.();
    this.game = game;
    this.scene.setGame(game);
    this.state.selected = null;
    this.state.dy = 0;
    this.liftSaved = null;
    const type = requireType(this.state.typeId);
    const { fx, fz } = footprintSize(type, normalizeOrient(type, this.state.orient));
    this.state.gx = Math.floor((game.model.baseW - fx) / 2);
    this.state.gz = Math.floor((game.model.baseL - fz) / 2);
    this.unsubscribeGame = game.subscribe(() => this.syncUi());
    this.syncUi();
  }

  /**
   * Une nouvelle version du jeu est prête : un bandeau propose de la mettre en service. Le projet en cours est enregistré
   * d'abord, puis la page se recharge ; rien ne change sans que le joueur l'ait demandé.
   */
  offerUpdate(apply: () => void): void {
    if (this.updateBanner) return;
    const go = h('button', { type: 'button', class: 'btn primary tiny' }, t('update.apply'));
    const later = h('button', { type: 'button', class: 'btn tiny' }, t('update.later'));
    const banner = h('div', { class: 'update-banner', role: 'status' }, h('span', {}, t('update.ready')), h('span', { class: 'banner-actions' }, later, go));
    later.addEventListener('click', () => {
      banner.remove();
      this.updateBanner = null;
    });
    go.addEventListener('click', async () => {
      go.disabled = true;
      await this.projects.flush();
      apply();
    });
    this.updateBanner = banner;
    this.root.append(banner);
  }

  /** Vrai si l'on peut modifier la construction (sinon, explique pourquoi). */
  private canEdit(): boolean {
    if (this.projects?.readOnly) {
      this.showToast(t('readonly.blocked'), 'error');
      return false;
    }
    return true;
  }

  private undo(): void {
    this.cancelMove();
    if (this.canEdit() && this.game.undo()) {
      this.counts.undos += 1;
      this.sound.play('step');
    }
  }

  private redo(): void {
    this.cancelMove();
    if (this.canEdit() && this.game.redo()) {
      this.counts.redos += 1;
      this.sound.play('step');
    }
  }

  private pieceLabel(typeId: string, color: string): string {
    const type = requireType(typeId);
    return `${typeName(type)}, ${colorLabel(color).toLowerCase()}`;
  }

  /** Mémorise la pièce qu'on vient de poser dans « Dernières pièces ». */
  private pushRecent(): void {
    const s = this.state;
    const type = requireType(s.typeId);
    const entry: Recent = { typeId: s.typeId, color: s.color, orient: normalizeOrient(type, s.orient) };
    s.recents = [entry, ...s.recents.filter((r) => !(r.typeId === entry.typeId && r.color === entry.color && r.orient === entry.orient))].slice(0, 6);
    this.renderRecents();
  }

  private renderRecents(): void {
    this.recentRow.replaceChildren();
    this.recentWrap.hidden = this.state.recents.length === 0;
    for (const r of this.state.recents) {
      const label = this.pieceLabel(r.typeId, r.color);
      const b = h('button', { type: 'button', class: 'recent-btn', 'aria-label': label, title: label, html: partIconSvg(r.typeId, colorHex(r.color), finishOf(r.color)) });
      b.addEventListener('click', () => {
        const s = this.state;
        s.typeId = r.typeId;
        s.color = r.color;
        s.orient = r.orient;
        s.kind = requireType(r.typeId).kind;
        s.dy = 0;
        this.renderSizes();
        this.syncUi();
      });
      this.recentRow.append(b);
    }
  }

  /** La pièce fantôme est affichée et se déplace : outil Construire, ou outil Déplacer avec une pièce soulevée. */
  private placing(): boolean {
    if (this.visit) return false;
    return this.state.tool === 'place' || (this.state.tool === 'move' && this.game.lifted !== null);
  }

  private restoreSelection(): void {
    const saved = this.liftSaved;
    if (!saved) return;
    this.liftSaved = null;
    const s = this.state;
    s.typeId = saved.typeId;
    s.color = saved.color;
    s.orient = saved.orient;
    s.kind = saved.kind;
    s.dy = saved.dy;
  }

  /**
   * Outil « Déplacer » : soulève la pièce touchée avec tout ce qui est posé dessus. Elle devient la pièce fantôme
   * (ou l'ensemble fantôme), à sa place d'origine.
   */
  private liftPiece(id: number | null): void {
    if (!this.canEdit() || id === null) return;
    this.liftConnected = groupConnected(this.game.model, id);
    this.liftIds(id, groupAbove(this.game.model, id));
  }

  /** « Tout l'ensemble » : repart de la place d'origine, avec tout ce qui est attaché à la pièce touchée. */
  private liftWhole(): void {
    const anchor = this.game.lifted;
    if (!anchor || this.liftConnected.length <= this.game.liftedGroup.length) return;
    this.game.cancelLift();
    this.restoreSelection();
    this.liftIds(anchor.id, this.liftConnected);
  }

  private liftIds(anchorId: number, ids: readonly number[]): void {
    const ordered = [anchorId, ...ids.filter((i) => i !== anchorId)];
    const outcome = ordered.length === 1 ? this.game.lift(anchorId) : this.game.liftGroup(ordered);
    if (!outcome.ok) {
      this.sound.play('refused');
      this.scene.flash(outcome.stranded);
      this.showToast(t('move.dernier_appui', { n: outcome.stranded.length }), 'error');
      return;
    }
    const piece = outcome.piece;
    const s = this.state;
    this.liftSaved = { typeId: s.typeId, color: s.color, orient: s.orient, kind: s.kind, dy: s.dy };
    s.typeId = piece.typeId;
    s.color = piece.color;
    s.orient = piece.orient;
    s.kind = requireType(piece.typeId).kind;
    this.liftTurns = 0;
    if (this.groupLifted()) {
      const b = groupBounds(this.game.liftedGroup);
      s.gx = b.x;
      s.gz = b.z;
      s.dy = Math.min(0, b.y - groupLanding(this.game.model, this.game.liftedGroup, 0, b.x, b.z));
    } else {
      s.gx = piece.x;
      s.gz = piece.z;
      // Le fantôme part de la place exacte de la pièce, même si d'autres pièces reposent encore au-dessus.
      s.dy = Math.min(0, piece.y - landingLevel(this.game.model, piece.typeId, piece.orient, piece.x, piece.z));
    }
    this.sound.play('step');
    this.syncUi();
  }

  /** Un ensemble de plusieurs pièces est soulevé (sinon : une pièce seule, ou rien). */
  private groupLifted(): boolean {
    return this.game.liftedGroup.length > 1;
  }

  private dropNow(): void {
    if (!this.canEdit() || this.game.lifted === null) return;
    const wasGroup = this.groupLifted();
    let outcome: { ok: true; moved: boolean } | { ok: false; reason: PlacementReason };
    if (wasGroup) {
      const { x, y, z } = this.groupGhostQuery();
      outcome = this.game.dropGroup({ x, y, z, turns: this.liftTurns });
    } else {
      const { x, y, z, orient } = this.ghostQuery();
      outcome = this.game.drop({ x, y, z, orient });
    }
    if (outcome.ok) {
      this.restoreSelection();
      this.showToast(outcome.moved ? t(wasGroup ? 'move.okGroup' : 'move.ok') : '', 'ok');
      if (outcome.moved) {
        this.counts.moves += 1;
        navigator.vibrate?.(8);
        this.sound.play('place');
      }
      this.syncUi();
    } else {
      this.showToast(reasonText(outcome.reason, this.game.model.maxLevel), 'error');
      this.sound.play('refused');
      this.syncUi();
    }
  }

  /** Remet la pièce soulevée à sa place, sans rien changer à l'historique. */
  private cancelMove(): void {
    if (this.game.lifted === null) return;
    this.game.cancelLift();
    this.restoreSelection();
    this.syncUi();
  }

  /** Outil « Copier » : reprend la forme, la couleur et l'orientation d'une pièce posée. */
  private copyPiece(id: number): void {
    const piece = this.game.model.get(id);
    if (!piece) return;
    const s = this.state;
    s.typeId = piece.typeId;
    s.color = piece.color;
    s.orient = piece.orient;
    s.kind = requireType(piece.typeId).kind;
    s.dy = 0;
    this.counts.picks += 1;
    this.renderSizes();
    this.setTool('place');
    this.showToast(t('pick.done', { piece: this.pieceLabel(piece.typeId, piece.color) }), 'ok');
  }

  /** Accès pour les mesures et les tests automatisés. */
  get api() {
    return {
      game: () => this.game,
      scene: () => this.scene,
      state: this.state,
      projects: () => this.projects,
      newGame: (size: number, color: string) => this.projects.newProject(size, color),
      makeNotice: () => createNotice(this.game, () => undefined),
      openNotice: () => this.openNotice(),
      loadReference: async (n = 300) => {
        await this.projects.newProject(32, 'vert');
        const placed = buildDenseReference(this.game, n, 7);
        this.scene.recenter(true);
        this.syncUi();
        return placed;
      },
    };
  }

  // ------------------------------------------------------------------ fantôme

  private ghostQuery() {
    const s = this.state;
    const type = requireType(s.typeId);
    const orient = normalizeOrient(type, s.orient);
    const { fx, fz } = footprintSize(type, orient);
    const { baseW, baseL } = this.game.model;
    const x = clamp(s.gx, 0, baseW - fx);
    const z = clamp(s.gz, 0, baseL - fz);
    const landing = landingLevel(this.game.model, s.typeId, orient, x, z);
    s.gx = x;
    s.gz = z;
    s.dy = clamp(s.dy, -landing, this.game.model.maxLevel);
    const y = Math.max(0, landing + s.dy);
    return { typeId: s.typeId, orient, x, y, z };
  }

  /** Cases « + » près du bord où l'on construit (pièce visée ou ensemble soulevé). */
  private refreshPlateHints(): void {
    this.plateHints = [];
    if (this.offerPlates && this.placing() && this.canEdit()) {
      const rect = this.groupLifted()
        ? { ...this.groupGhostQuery(), ...groupFootprint(this.game.liftedGroup, this.liftTurns) }
        : (() => {
            const q = this.ghostQuery();
            const type = requireType(q.typeId);
            return { x: q.x, z: q.z, ...footprintSize(type, q.orient) };
          })();
      this.plateHints = edgeHints(this.game.model.plates, rect.x, rect.z, rect.fx, rect.fz, BASE_SIZES);
    }
    this.scene.setPlateHints(this.plateHints.map((h) => h.preview));
  }

  /** Fenêtre « Ajouter une plaque » : taille et couleur, choisies à chaque ajout. */
  private buildPlateDialog(): HTMLElement {
    let pending: PlateHint | null = null;
    let size = 16;
    let color = 'vert';
    const sizeRow = h('div', { class: 'choice-row', role: 'radiogroup', 'aria-label': t('menu.size') });
    const colorRow = h('div', { class: 'choice-row', role: 'radiogroup', 'aria-label': t('menu.color') });
    const sizeBtns = new Map<number, HTMLButtonElement>();
    const colorBtns = new Map<string, HTMLButtonElement>();
    const status = h('p', { class: 'hint', role: 'status' });
    const surface = h('p', { class: 'surface-info' });
    const refresh = () => {
      // Surface : maintenant, avec la plaque choisie, et le maximum.
      const plates = this.game.model.plates;
      const now = `${this.game.model.baseW} × ${this.game.model.baseL}`;
      const beside = pending ? plateBeside(plates, plates[pending.from]!, pending.side, size, color) : null;
      const all = beside?.ok ? [...plates, beside.plate] : plates;
      const w = Math.max(...all.map((p) => p.x + p.w)) - Math.min(...all.map((p) => p.x));
      const l = Math.max(...all.map((p) => p.z + p.l)) - Math.min(...all.map((p) => p.z));
      surface.textContent = t('plate.surface', { now, after: `${w} × ${l}`, max: `${MAX_EXTENT} × ${MAX_EXTENT}` });
      for (const [n, b] of sizeBtns) {
        const fits = !!pending && edgeFits(this.game.model.plates, pending, n);
        b.disabled = !fits;
        b.setAttribute('aria-checked', String(n === size));
      }
      for (const [id, b] of colorBtns) b.setAttribute('aria-checked', String(id === color));
    };
    for (const n of BASE_SIZES) {
      const b = h('button', { type: 'button', class: 'choice', role: 'radio', 'aria-checked': 'false' }, `${t(`size.${n}` as Key)} ${n}×${n}`);
      b.addEventListener('click', () => {
        size = n;
        refresh();
      });
      sizeBtns.set(n, b);
      sizeRow.append(b);
    }
    for (const c of BASE_COLORS) {
      const b = h('button', { type: 'button', class: 'choice swatch-choice', role: 'radio', 'aria-checked': 'false', 'aria-label': t(`color.${c.id}` as Key) });
      b.style.setProperty('--swatch', c.hex);
      b.append(h('span', { class: 'dot' }), t(`color.${c.id}` as Key));
      b.addEventListener('click', () => {
        color = c.id;
        refresh();
      });
      colorBtns.set(c.id, b);
      colorRow.append(b);
    }
    const cancel = h('button', { type: 'button', class: 'btn' }, t('menu.cancel'));
    const add = h('button', { type: 'button', class: 'btn primary' }, t('plate.add'));
    const dialog = h(
      'div',
      { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('plate.title') },
      h('h2', {}, t('plate.title')),
      surface,
      h('h3', {}, t('menu.size')),
      sizeRow,
      h('h3', {}, t('menu.color')),
      colorRow,
      status,
      h('div', { class: 'dialog-actions' }, cancel, add),
    );
    const overlay = h('div', { class: 'overlay', hidden: '' }, dialog);
    this.openPlateDialog = (hint) => {
      pending = hint;
      const from = this.game.model.plates[hint.from]!;
      size = hint.preview.w;
      color = from.color;
      status.textContent = t('plate.hint');
      refresh();
      overlay.hidden = false;
      add.focus({ preventScroll: true });
    };
    cancel.addEventListener('click', () => (overlay.hidden = true));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.hidden = true;
    });
    add.addEventListener('click', () => {
      if (!pending || !this.canEdit()) return;
      const out = this.game.addPlate(pending.from, pending.side, size, color);
      if (!out.ok) {
        status.textContent = t(out.reason === 'occupe' ? 'plate.occupied' : 'plate.tooBig');
        return;
      }
      overlay.hidden = true;
      // Ajout à gauche ou au fond : tout s'est décalé ; la pièce visée suit.
      this.state.gx += out.dx;
      this.state.gz += out.dz;
      this.sound.play('place');
      this.showToast(t('plate.added'), 'ok');
      this.syncUi();
    });
    return overlay;
  }

  /** Fantôme d'un ensemble : coin minimal de sa boîte, niveau de chute de l'ensemble et décalage ↑↓. */
  private groupGhostQuery() {
    const s = this.state;
    const group = this.game.liftedGroup;
    const { fx, fz } = groupFootprint(group, this.liftTurns);
    const { baseW, baseL } = this.game.model;
    const x = clamp(s.gx, 0, Math.max(0, baseW - fx));
    const z = clamp(s.gz, 0, Math.max(0, baseL - fz));
    const landing = groupLanding(this.game.model, group, this.liftTurns, x, z);
    s.gx = x;
    s.gz = z;
    s.dy = clamp(s.dy, -landing, this.game.model.maxLevel);
    return { x, y: Math.max(0, landing + s.dy), z };
  }

  private refreshGhost(): { ok: boolean; reason?: PlacementReason } {
    if (!this.placing()) {
      this.scene.setGhost(null);
      return { ok: false };
    }
    if (this.groupLifted()) {
      const anchor = this.game.lifted!;
      const q = this.groupGhostQuery();
      const placed = transformGroup(this.game.liftedGroup, this.liftTurns, q.x, q.y, q.z);
      const result = evaluateGroupPlacement(this.game.model, placed);
      this.scene.setGhost({
        ...q,
        typeId: anchor.typeId,
        orient: anchor.orient,
        color: anchor.color,
        valid: result.ok,
        supported: result.supportedCells,
        colliding: result.collidingCells,
        group: placed,
      });
      return result;
    }
    const q = this.ghostQuery();
    const result = evaluatePlacement(this.game.model, q);
    const info: GhostInfo = {
      ...q,
      color: this.state.color,
      valid: result.ok,
      supported: result.supportedCells,
      colliding: result.collidingCells,
    };
    this.scene.setGhost(info);
    return result;
  }

  private moveGhost(dx: number, dz: number): void {
    this.state.gx += dx;
    this.state.gz += dz;
    this.syncUi();
  }

  /** Déplacement relatif à l'écran : « haut » éloigne la pièce de soi, quelle que soit la vue. */
  private moveOnScreen(dir: 'up' | 'down' | 'left' | 'right'): void {
    const { forward, right } = this.scene.screenAxes();
    if (dir === 'up') this.moveGhost(forward.x, forward.z);
    else if (dir === 'down') this.moveGhost(-forward.x, -forward.z);
    else if (dir === 'right') this.moveGhost(right.x, right.z);
    else this.moveGhost(-right.x, -right.z);
  }

  private rotate(): void {
    if (this.groupLifted()) {
      this.liftTurns = (this.liftTurns + 1) % 4;
      this.counts.turns += 1;
      this.syncUi();
      return;
    }
    const type = requireType(this.state.typeId);
    if (!canRotate(type)) return;
    this.state.orient = nextOrient(type, this.state.orient);
    this.counts.turns += 1;
    this.syncUi();
  }

  private shiftLevel(delta: number): void {
    this.state.dy += delta;
    this.syncUi();
  }

  private placeNow(): void {
    if (this.state.tool === 'move') {
      this.dropNow();
      return;
    }
    if (this.state.tool !== 'place' || !this.canEdit()) return;
    const q = this.ghostQuery();
    const outcome = this.game.place({ ...q, color: this.state.color });
    if (outcome.ok) {
      this.state.dy = 0;
      this.showToast('', 'ok');
      navigator.vibrate?.(8);
      this.sound.play('place');
      this.pushRecent();
    } else {
      this.showToast(reasonText(outcome.reason, this.game.model.maxLevel), 'error');
      this.sound.play('refused');
      this.syncUi();
    }
  }

  /** Retire la pièce touchée tout de suite : on enchaîne les retraits, et ↶ remet la dernière. */
  private removeNow(id: number | null): void {
    if (!this.canEdit() || id === null) return;
    const outcome = this.game.remove(id);
    if (outcome.ok) {
      this.counts.removals += 1;
      this.state.selected = null;
      this.showToast(t('remove.ok'), 'ok');
      this.sound.play('remove');
    } else {
      this.sound.play('refused');
      this.scene.flash(outcome.stranded);
      this.showToast(t('remove.dernier_appui', { n: outcome.stranded.length }), 'error');
    }
  }

  // ------------------------------------------------------------------ construction du DOM

  private iconButton(name: IconName, labelKey: Key, onClick: () => void, cls = ''): HTMLButtonElement {
    const b = h('button', { type: 'button', class: `btn icon-btn ${cls}`.trim(), 'aria-label': t(labelKey), title: t(labelKey), html: icon(name) });
    b.addEventListener('click', onClick);
    return b;
  }

  private build(): void {
    const root = this.root;
    root.replaceChildren();

    // Barre du haut
    this.undoBtn = this.iconButton('undo', 'history.undo', () => this.undo(), 'undo-btn');
    this.redoBtn = this.iconButton('redo', 'history.redo', () => this.redo(), 'redo-btn');
    const menuBtn = this.iconButton('menu', 'menu.open', () => this.openMenu());
    // Un seul bouton « Vue » : il ouvre un petit menu aux lignes écrites, au lieu de pictos à deviner.
    this.viewBtn = h('button', { type: 'button', class: 'btn view-menu-btn', 'aria-expanded': 'false', 'aria-controls': 'view-pop' });
    this.viewBtn.addEventListener('click', () => this.setViewMenu(Boolean(this.viewPop.hidden)));
    this.viewPop = this.buildViewMenu();
    const topbar = h('header', { class: 'topbar' }, menuBtn, h('span', { class: 'spacer brand-spacer' }, h('img', { class: 'brand-logo', src: logoUrl, alt: t('app.title') })), this.undoBtn, this.redoBtn, this.viewBtn);

    // Scène
    this.canvas = h('canvas', { class: 'stage-canvas', 'aria-label': t('app.title') });
    this.status = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
    // Plafond atteint : on propose de le monter, juste sous le message.
    this.ceilingBtn = h('button', { type: 'button', class: 'btn primary ceiling-btn', hidden: '' }, t('ceiling.raise'));
    this.ceilingBtn.addEventListener('click', () => {
      if (!this.canEdit() || !this.game.canRaiseCeiling) return;
      const bricks = this.game.raiseCeiling();
      this.sound.play('step');
      this.showToast(t('ceiling.raised', { n: bricks }), 'ok');
      this.syncUi();
    });
    this.toast = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite', hidden: '' });
    this.rotateBtn = this.iconButton('rotate', 'action.rotate', () => this.rotate(), 'view-btn rotate-piece');
    const viewButtons = h(
      'div',
      { class: 'view-buttons' },
      this.rotateBtn,
      this.iconButton('orbitLeft', 'cam.rotateLeft', () => this.scene.rotateView(90), 'view-btn orbit-btn'),
      this.iconButton('orbitRight', 'cam.rotateRight', () => this.scene.rotateView(-90), 'view-btn orbit-btn'),
    );
    this.soundBtn = h('button', { type: 'button', class: 'btn icon-btn view-btn' });
    this.soundBtn.addEventListener('click', () => {
      this.sound.setEnabled(!this.sound.enabled);
      this.syncSoundButton();
      this.sound.play('step');
    });
    // Lumières : allumer ou éteindre tout, même un interrupteur caché dans une construction fermée.
    this.lightsBtn = h('button', { type: 'button', class: 'btn icon-btn view-btn lights-btn', hidden: '' });
    this.lightsBtn.addEventListener('click', () => {
      if (!this.canEdit()) return;
      const on = !this.game.anySwitchOn;
      this.game.setAllSwitches(on);
      this.counts.lights += 1;
      this.sound.play('step');
      this.showToast(t(on ? 'lights.allOn' : 'lights.allOff'), 'ok');
    });
    viewButtons.append(this.lightsBtn);
    viewButtons.append(this.soundBtn);
    viewButtons.append(this.iconButton('help', 'guide.help', () => this.guide.start(), 'view-btn'));
    this.syncSoundButton();
    this.emptyHint = h('div', { class: 'empty-hint', hidden: '' });
    const copyBtn = h('button', { type: 'button', class: 'btn tiny' }, t('readonly.copy'));
    copyBtn.addEventListener('click', () => void this.projects.duplicateCurrent());
    const retryBtn = h('button', { type: 'button', class: 'btn tiny' }, t('readonly.retry'));
    retryBtn.addEventListener('click', () => void this.projects.retryLock());
    this.banner = h('div', { class: 'banner', role: 'status', hidden: '' }, h('span', {}, t('readonly.banner')), h('span', { class: 'banner-actions' }, copyBtn, retryBtn));
    this.visitExitBtn = h('button', { type: 'button', class: 'btn primary visit-exit', hidden: '' }, t('visit.exit'));
    this.visitExitBtn.addEventListener('click', () => this.setVisit(false));
    const stage = h('main', { class: 'stage' }, this.canvas, this.status, this.ceilingBtn, this.banner, viewButtons, this.emptyHint, this.toast, this.visitExitBtn);

    // Panneau
    const toolSeg = h('div', { class: 'segmented', role: 'group', 'aria-label': t('tool.label') });
    for (const tool of ['place', 'remove', 'pick', 'move', 'link'] as Tool[]) {
      const b = h('button', { type: 'button', class: 'seg', 'aria-pressed': 'false', 'data-tool': tool }, t(`tool.${tool}` as Key));
      b.addEventListener('click', () => this.setTool(tool));
      this.toolBtns.set(tool, b);
      toolSeg.append(b);
    }

    const kindSeg = h('div', { class: 'segmented small', role: 'tablist' });
    for (const kind of KINDS) {
      const b = h('button', { type: 'button', class: 'seg', role: 'tab', 'aria-selected': 'false', 'data-kind': kind }, t(`kind.${kind}` as Key));
      b.addEventListener('click', () => this.setKind(kind));
      this.kindBtns.set(kind, b);
      kindSeg.append(b);
    }
    this.sizeRow = h('div', { class: 'size-row', role: 'radiogroup', 'aria-label': t('kind.brick') });

    const colorRow = h('div', { class: 'color-row', role: 'radiogroup', 'aria-label': t('color.group') });
    for (const c of COLORS) {
      const b = h('button', { type: 'button', class: 'swatch', role: 'radio', 'aria-checked': 'false', 'aria-label': t(`color.${c.id}` as Key), title: t(`color.${c.id}` as Key) });
      b.style.setProperty('--swatch', c.hex);
      b.addEventListener('click', () => {
        // On garde la matière choisie (opaque, transparente, givrée, lumineuse) en changeant de couleur.
        this.state.color = withFinish(c.id, finishOf(this.state.color));
        this.renderSizes();
        this.syncUi();
      });
      this.colorBtns.set(c.id, b);
      colorRow.append(b);
    }
    this.colorName = h('span', { class: 'color-name' });
    const finishRow = h('div', { class: 'finish-row', role: 'radiogroup', 'aria-label': t('finish.group') });
    const finishKeys: Record<Finish, Key> = { opaque: 'finish.opaque', clear: 'finish.clear', frost: 'finish.frost', glow: 'finish.glow' };
    for (const finish of FINISHES) {
      const b = h('button', { type: 'button', class: 'finish-btn', role: 'radio', 'aria-checked': 'false' }, t(finishKeys[finish]));
      b.addEventListener('click', () => {
        this.state.color = withFinish(this.state.color, finish);
        this.renderSizes();
        this.syncUi();
      });
      this.finishBtns.set(finish, b);
      finishRow.append(b);
    }
    // Sous « Lumineux » : de quoi allumer et éteindre (l'interrupteur n'est dans aucun onglet).
    const takeSwitch = h('button', { type: 'button', class: 'btn take-switch', html: `${partIconSvg(SWITCH_ID, colorHex('blanc'))}<span>${t('finish.takeSwitch')}</span>` });
    takeSwitch.addEventListener('click', () => {
      this.state.typeId = SWITCH_ID;
      this.state.color = withFinish(this.state.color, 'opaque');
      this.state.dy = 0;
      this.renderSizes();
      this.syncUi();
    });
    this.glowHintText = h('p', { class: 'hint' });
    this.glowHint = h('div', { class: 'glow-hint', hidden: '' }, this.glowHintText, takeSwitch);

    // Commandes de pose
    const dpad = h('div', { class: 'dpad', role: 'group', 'aria-label': t('move.group') });
    const dirs: Array<[ 'up' | 'down' | 'left' | 'right', IconName, Key ]> = [
      ['up', 'up', 'move.up'],
      ['left', 'left', 'move.left'],
      ['right', 'right', 'move.right'],
      ['down', 'down', 'move.down'],
    ];
    for (const [dir, ic, label] of dirs) {
      const b = this.iconButton(ic, label, () => this.moveOnScreen(dir), `dpad-${dir}`);
      dpad.append(b);
    }
    // Poser au centre de la croix : on règle la position et on pose sans lâcher la croix du pouce.
    this.placeMini = this.iconButton('check', 'action.place', () => this.placeNow(), 'dpad-place');
    dpad.append(this.placeMini);
    // Croix directionnelle et niveaux : ils flottent sur la scène, pour libérer le panneau du bas.
    this.padBox = h(
      'div',
      { class: 'pad-box' },
      dpad,
      h(
        'div',
        { class: 'levels' },
        this.iconButton('levelUp', 'action.up', () => this.shiftLevel(1), 'level-btn'),
        this.iconButton('levelDown', 'action.down', () => this.shiftLevel(-1), 'level-btn'),
      ),
    );
    stage.append(this.padBox);
    this.recentRow = h('div', { class: 'recent-row' });
    this.recentWrap = h('div', { class: 'recent', hidden: '' }, h('span', { class: 'recent-label' }, t('recent.label')), this.recentRow);
    this.placeBtn = h('button', { type: 'button', class: 'btn primary place-btn', html: `${icon('check', 24)}<span>${t('action.place')}</span>` });
    this.placeBtn.addEventListener('click', () => this.placeNow());
    // Puce de la pièce actuelle : un appui ouvre le tiroir de choix (forme, couleur, dernières pièces).
    this.pieceChip = h('button', { type: 'button', class: 'piece-chip', 'aria-expanded': 'false', 'aria-controls': 'drawer' });
    this.pieceChip.addEventListener('click', () => this.setDrawer(Boolean(this.drawer.hidden)));
    const drawerClose = this.iconButton('down', 'drawer.close', () => this.setDrawer(false), 'drawer-close');
    this.drawer = h(
      'div',
      { class: 'drawer', id: 'drawer', role: 'group', 'aria-label': t('drawer.title'), hidden: '' },
      h('div', { class: 'drawer-head' }, h('span', { class: 'drawer-title' }, t('drawer.title')), drawerClose),
      kindSeg,
      this.sizeRow,
      h('div', { class: 'color-line' }, colorRow, this.colorName),
      finishRow,
      this.glowHint,
      this.recentWrap,
    );
    this.placeControls = h('div', { class: 'place-controls' }, h('div', { class: 'bar-row' }, this.pieceChip, this.placeBtn), this.drawer);

    this.removeInfo = h('p', { class: 'remove-info' });
    this.removeControls = h('div', { class: 'remove-controls' }, this.removeInfo);

    this.pickControls = h('div', { class: 'remove-controls' }, h('p', { class: 'remove-info' }, t('pick.hint')));
    this.moveInfo = h('p', { class: 'remove-info' });
    const moveCancel = h('button', { type: 'button', class: 'btn' }, t('move.cancel'));
    moveCancel.addEventListener('click', () => this.cancelMove());
    this.moveDropBtn = h('button', { type: 'button', class: 'btn primary place-btn', html: `${icon('check', 24)}<span>${t('action.place')}</span>` });
    this.moveDropBtn.addEventListener('click', () => this.dropNow());
    this.moveRow = h('div', { class: 'bar-row move-row' }, moveCancel, this.moveDropBtn);
    this.moveWholeBtn = h('button', { type: 'button', class: 'btn move-whole' }, t('move.whole'));
    this.moveWholeBtn.addEventListener('click', () => this.liftWhole());
    this.moveControls = h('div', { class: 'place-controls' }, this.moveInfo, this.moveWholeBtn, this.moveRow);
    this.linkInfo = h('p', { class: 'remove-info' });
    this.linkControls = h('div', { class: 'remove-controls' }, this.linkInfo);
    const panel = h('aside', { class: 'panel' }, toolSeg, this.placeControls, this.removeControls, this.pickControls, this.moveControls, this.linkControls);

    root.append(topbar, stage, panel, this.viewPop);

    this.menu = this.buildMenu();
    root.append(this.menu);
    this.newConfirm = this.buildNewConfirm();
    root.append(this.newConfirm);
    this.plateDialog = this.buildPlateDialog();
    root.append(this.plateDialog);
    this.noticeViewer = this.buildNoticeViewer();
    root.append(this.noticeViewer);

    if (this.debug) {
      this.debugBox = h('div', { class: 'debug' });
      root.append(this.debugBox);
    }
    this.renderSizes();
  }

  private renderSizes(): void {
    this.sizeRow.replaceChildren();
    this.sizeRow.setAttribute('aria-label', t(`kind.${this.state.kind}` as Key));
    for (const type of typesOfKind(this.state.kind)) {
      const svg = partIconSvg(type.id, colorHex(this.state.color), finishOf(this.state.color));
      const name = typeName(type);
      const b = h('button', {
        type: 'button',
        class: 'size-btn',
        role: 'radio',
        'aria-checked': String(type.id === this.state.typeId),
        'aria-label': `${name}, ${t('piece.sizeLabel', { w: type.w, l: type.l })}`,
        'data-type': type.id,
        html: `${svg}<span>${sizeText(type)}</span>`,
      });
      b.addEventListener('click', () => {
        this.state.typeId = type.id;
        this.state.dy = 0;
        this.renderSizes();
        this.syncUi();
      });
      this.sizeRow.append(b);
    }
  }

  private buildMenu(): HTMLElement {
    let size: number = 24;
    let color = 'vert';
    const sizeGroup = h('div', { class: 'choice-row', role: 'radiogroup', 'aria-label': t('menu.size') });
    const colorGroup = h('div', { class: 'choice-row', role: 'radiogroup', 'aria-label': t('menu.color') });
    const warn = h('p', { class: 'hint' }, t('menu.kept'));
    const sizeBtns: HTMLButtonElement[] = [];
    const colorBtns: HTMLButtonElement[] = [];
    const refresh = () => {
      sizeBtns.forEach((b, i) => b.setAttribute('aria-checked', String(BASE_SIZES[i] === size)));
      colorBtns.forEach((b, i) => b.setAttribute('aria-checked', String(BASE_COLORS[i]?.id === color)));
      warn.hidden = !this.game || this.game.model.count === 0;
      this.nameInput.value = this.projects?.meta.name ?? '';
      this.nameInput.disabled = !!this.projects?.readOnly;
      this.newCreateBtn.disabled = !!this.projects?.readOnly;
      this.updateSaveInfo();
      for (const [q, b] of this.qualityBtns) b.setAttribute('aria-checked', String(this.scene?.currentQuality === q));
      for (const { b, on } of this.graphicsBtns) b.setAttribute('aria-checked', String(!!this.scene && on(this.scene.currentGraphics)));
      for (const [v, b] of this.offerBtns) b.setAttribute('aria-checked', String(v === this.offerPlates));
    };
    BASE_SIZES.forEach((s) => {
      const b = h('button', { type: 'button', class: 'choice', role: 'radio', 'aria-checked': 'false' }, `${t(`size.${s}` as Key)} ${s}×${s}`);
      b.addEventListener('click', () => {
        size = s;
        refresh();
      });
      sizeBtns.push(b);
      sizeGroup.append(b);
    });
    BASE_COLORS.forEach((c) => {
      const b = h('button', { type: 'button', class: 'choice swatch-choice', role: 'radio', 'aria-checked': 'false', 'aria-label': t(`color.${c.id}` as Key) });
      b.style.setProperty('--swatch', c.hex);
      b.append(h('span', { class: 'dot' }), t(`color.${c.id}` as Key));
      b.addEventListener('click', () => {
        color = c.id;
        refresh();
      });
      colorBtns.push(b);
      colorGroup.append(b);
    });
    const noticeBtn = h('button', { type: 'button', class: 'btn primary notice-open' }, t('notice.menu'));
    const galleryBtn = h('button', { type: 'button', class: 'btn notice-open' }, t('menu.gallery'));
    const examplesBtn = h('button', { type: 'button', class: 'btn notice-open', 'data-action': 'examples' }, t('menu.examples'));
    const installBtn = h('button', { type: 'button', class: 'btn notice-open' }, t('menu.install'));
    const exportBtn = h('button', { type: 'button', class: 'btn notice-open' }, t('menu.export'));
    const importBtn = h('button', { type: 'button', class: 'btn notice-open' }, t('menu.import'));
    const guideBtn = h('button', { type: 'button', class: 'btn notice-open' }, t('guide.help'));
    this.fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: '' });
    this.nameInput = h('input', { type: 'text', class: 'name-input', maxlength: '80', 'aria-label': t('project.name'), autocomplete: 'off' });
    this.saveInfo = h('p', { class: 'hint', role: 'status' });
    const qualityRow = h('div', { class: 'choice-row', role: 'radiogroup', 'aria-label': t('quality.title') });
    for (const q of ['high', 'low'] as Quality[]) {
      const b = h('button', { type: 'button', class: 'choice', role: 'radio', 'aria-checked': 'false' }, t(`quality.${q}` as Key));
      b.addEventListener('click', () => {
        this.scene.setQuality(q);
        try {
          localStorage.setItem('atelier-briques:qualite', q);
        } catch {
          /* préférence non conservée */
        }
        saveGraphics(this.scene.currentGraphics);
        refresh();
      });
      this.qualityBtns.set(q, b);
      qualityRow.append(b);
    }
    // Réglages avancés : chaque ligne est un choix exclusif ; les qualités ci-dessus en sont des préréglages.
    const setting = <K extends keyof Graphics>(key: K, label: Key, options: Array<[Graphics[K], Key]>) => {
      const row = h('div', { class: 'choice-row', role: 'radiogroup', 'aria-label': t(label) });
      for (const [value, text] of options) {
        const b = h('button', { type: 'button', class: 'choice', role: 'radio', 'aria-checked': 'false' }, t(text));
        b.addEventListener('click', () => {
          this.scene.setGraphics({ ...this.scene.currentGraphics, [key]: value });
          saveGraphics(this.scene.currentGraphics);
          refresh();
        });
        this.graphicsBtns.push({ b, on: (g) => g[key] === value });
        row.append(b);
      }
      return [h('h4', { class: 'setting-title' }, t(label)), row];
    };
    const advanced = h(
      'details',
      { class: 'advanced' },
      h('summary', {}, t('graphics.advanced')),
      ...setting('night', 'graphics.night', [[false, 'graphics.day'], [true, 'graphics.nightOn']]),
      ...setting('halo', 'graphics.halo', [[true, 'graphics.yes'], [false, 'graphics.no']]),
      ...setting('shadows', 'graphics.shadows', [['soft', 'graphics.shadowSoft'], ['simple', 'graphics.shadowSimple'], ['none', 'graphics.shadowNone']]),
      ...setting('sharp', 'graphics.sharp', [[true, 'graphics.sharpOn'], [false, 'graphics.sharpOff']]),
      h('p', { class: 'hint' }, t('graphics.hint')),
    );
    // Cases « + » des plaques : on peut ne plus les proposer.
    const offerRow = h('div', { class: 'choice-row', role: 'radiogroup', 'aria-label': t('plate.offer') });
    for (const v of [true, false]) {
      const b = h('button', { type: 'button', class: 'choice', role: 'radio', 'aria-checked': 'false' }, t(v ? 'graphics.yes' : 'graphics.no'));
      b.addEventListener('click', () => {
        this.offerPlates = v;
        saveFlag(PLATES_KEY, v);
        refresh();
        this.syncUi();
      });
      this.offerBtns.set(v, b);
      offerRow.append(b);
    }
    const create = h('button', { type: 'button', class: 'btn' }, t('menu.create'));
    this.newCreateBtn = create;
    const [licenseBefore = '', licenseAfter = ''] = t('menu.license', { licence: '\u0000' }).split('\u0000');
    const license = h(
      'p',
      { class: 'hint license' },
      licenseBefore,
      h('a', { href: 'https://creativecommons.org/licenses/by-nc/4.0/deed.fr', target: '_blank', rel: 'license noopener' }, t('menu.licenseName')),
      licenseAfter,
      h('br'),
      t('menu.licenseHint'),
    );
    const cancel = h('button', { type: 'button', class: 'btn' }, t('menu.cancel'));
    const dialog = h(
      'div',
      { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('menu.title') },
      h('h2', {}, t('menu.heading')),
      h('label', { class: 'field' }, h('span', {}, t('project.name')), this.nameInput),
      this.saveInfo,
      noticeBtn,
      h('p', { class: 'hint' }, t('notice.menuHint')),
      galleryBtn,
      examplesBtn,
      installBtn,
      exportBtn,
      importBtn,
      this.fileInput,
      h('p', { class: 'hint' }, t('menu.fileHint')),
      guideBtn,
      h('h3', { class: 'section' }, t('plate.offer')),
      offerRow,
      h('p', { class: 'hint' }, t('plate.offerHint')),
      h('h3', { class: 'section' }, t('quality.title')),
      qualityRow,
      h('p', { class: 'hint' }, t('quality.hint')),
      advanced,
      h('h3', { class: 'section' }, t('menu.title')),
      h('h3', {}, t('menu.size')),
      sizeGroup,
      h('h3', {}, t('menu.color')),
      colorGroup,
      warn,
      h('div', { class: 'dialog-actions' }, cancel, create),
      license,
    );
    const overlay = h('div', { class: 'overlay', hidden: '' }, dialog);
    cancel.addEventListener('click', () => (overlay.hidden = true));
    noticeBtn.addEventListener('click', () => {
      overlay.hidden = true;
      void this.openNotice();
    });
    guideBtn.addEventListener('click', () => {
      overlay.hidden = true;
      this.guide.start();
    });
    examplesBtn.addEventListener('click', () => {
      overlay.hidden = true;
      this.examples.open();
    });
    installBtn.addEventListener('click', () => {
      overlay.hidden = true;
      this.install.open();
    });
    galleryBtn.addEventListener('click', () => {
      overlay.hidden = true;
      void this.gallery.open();
    });
    exportBtn.addEventListener('click', () => void this.projects.exportCurrent());
    importBtn.addEventListener('click', () => {
      if (this.canEdit()) this.fileInput.click();
    });
    this.fileInput.addEventListener('change', async () => {
      const file = this.fileInput.files?.[0];
      this.fileInput.value = '';
      if (!file) return;
      if (await this.projects.importFile(file)) overlay.hidden = true;
    });
    this.nameInput.addEventListener('change', () => this.projects.rename(this.nameInput.value));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.hidden = true;
    });
    create.addEventListener('click', () => {
      overlay.hidden = true;
      if (!this.canEdit()) return;
      // Avant de quitter une construction qui a des pièces : proposer de la garder aussi hors de l'appareil.
      if (this.game.model.count > 0) this.openNewConfirm(size, color);
      else void this.projects.newProject(size, color);
    });
    overlay.addEventListener('menu:open', refresh);
    refresh();
    return overlay;
  }

  /**
   * Confirmation avant une nouvelle construction. L'actuelle reste dans « Mes créations » ; on propose en plus de l'enregistrer
   * dans un fichier ou d'en télécharger la notice, à l'abri d'un nettoyage du navigateur.
   */
  private buildNewConfirm(): HTMLElement {
    let pending = { size: 24, color: 'vert' };
    const kept = h('p', {});
    const status = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
    const fileBtn = h('button', { type: 'button', class: 'btn notice-open' }, t('menu.export'));
    const noticeBtn = h('button', { type: 'button', class: 'btn notice-open' }, t('newConfirm.notice'));
    const cancel = h('button', { type: 'button', class: 'btn' }, t('menu.cancel'));
    const start = h('button', { type: 'button', class: 'btn primary' }, t('menu.create'));
    const dialog = h(
      'div',
      { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': t('menu.title') },
      h('h2', {}, t('menu.title')),
      kept,
      h('p', { class: 'hint' }, t('newConfirm.keep')),
      fileBtn,
      noticeBtn,
      status,
      h('div', { class: 'dialog-actions' }, cancel, start),
    );
    const overlay = h('div', { class: 'overlay', hidden: '' }, dialog);
    this.openNewConfirm = (size, color) => {
      pending = { size, color };
      kept.textContent = t('newConfirm.kept', { name: this.projects.meta.name });
      status.textContent = '';
      noticeBtn.disabled = false;
      overlay.hidden = false;
      start.focus({ preventScroll: true });
    };
    fileBtn.addEventListener('click', async () => {
      await this.projects.exportCurrent();
      status.textContent = t('newConfirm.fileDone');
    });
    noticeBtn.addEventListener('click', async () => {
      noticeBtn.disabled = true;
      status.textContent = t('notice.working', { done: 0, total: '…' });
      try {
        const bundle = await createNotice(this.game, (done, total) => {
          status.textContent = t('notice.working', { done: Math.min(done + 1, total), total });
        });
        this.downloadHtml(bundle.html);
        status.textContent = t('newConfirm.noticeDone');
      } catch (error) {
        console.error(error);
        status.textContent = t('notice.failed');
      } finally {
        noticeBtn.disabled = false;
      }
    });
    cancel.addEventListener('click', () => (overlay.hidden = true));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.hidden = true;
    });
    start.addEventListener('click', () => {
      overlay.hidden = true;
      if (this.canEdit()) void this.projects.newProject(pending.size, pending.color);
    });
    return overlay;
  }

  private buildNoticeViewer(): HTMLElement {
    this.noticeStatus = h('span', { class: 'notice-status', role: 'status', 'aria-live': 'polite' });
    const close = h('button', { type: 'button', class: 'btn' }, t('notice.close'));
    this.noticeDownloadBtn = h('button', { type: 'button', class: 'btn primary' }, t('notice.download'));
    this.noticePrintBtn = h('button', { type: 'button', class: 'btn' }, t('notice.print'));
    this.noticeSlidesBtn = h('button', { type: 'button', class: 'btn' }, t('notice.bookButton'));
    this.noticeSlidesBtn.addEventListener('click', () => {
      (this.noticeFrame.contentWindow as (Window & { startBook?: (n?: number) => void }) | null)?.startBook?.(0);
      this.noticeFrame.contentWindow?.focus();
    });
    this.noticeFrame = h('iframe', { class: 'notice-frame', title: t('notice.title'), sandbox: 'allow-same-origin allow-modals allow-scripts' });
    close.addEventListener('click', () => (this.noticeViewer.hidden = true));
    this.noticeDownloadBtn.addEventListener('click', () => this.downloadNotice());
    this.noticePrintBtn.addEventListener('click', () => {
      this.noticeFrame.contentWindow?.focus();
      this.noticeFrame.contentWindow?.print();
    });
    const bar = h('div', { class: 'notice-bar' }, close, this.noticeSlidesBtn, this.noticeDownloadBtn, this.noticePrintBtn, this.noticeStatus);
    const viewer = h('div', { class: 'notice-viewer', hidden: '' }, bar, this.noticeFrame);
    return viewer;
  }

  private async openNotice(): Promise<void> {
    if (this.game.model.count === 0) {
      this.showToast(t('notice.empty'), 'error');
      return;
    }
    this.noticeViewer.hidden = false;
    this.noticeFrame.hidden = true;
    this.noticeDownloadBtn.disabled = true;
    this.noticePrintBtn.disabled = true;
    this.noticeSlidesBtn.disabled = true;
    this.noticeStatus.textContent = t('notice.working', { done: 0, total: '…' });
    try {
      const bundle = await createNotice(this.game, (done, total) => {
        this.noticeStatus.textContent = t('notice.working', { done: Math.min(done + 1, total), total });
      });
      this.noticeHtml = bundle.html;
      this.noticeFrame.srcdoc = bundle.html;
      this.noticeFrame.hidden = false;
      this.noticeDownloadBtn.disabled = false;
      this.noticePrintBtn.disabled = false;
      this.noticeSlidesBtn.disabled = false;
      this.noticeStatus.textContent = bundle.verified ? t('notice.verified') : t('notice.notVerified');
      this.noticeStatus.dataset['state'] = bundle.verified ? 'ok' : 'bad';
    } catch (error) {
      console.error(error);
      this.noticeStatus.textContent = t('notice.failed');
      this.noticeStatus.dataset['state'] = 'bad';
    }
  }

  private downloadNotice(): void {
    if (this.noticeHtml) this.downloadHtml(this.noticeHtml);
  }

  private downloadHtml(html: string): void {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const link = h('a', { href: url, download: 'notice-briques.html' });
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  private openMenu(): void {
    this.cancelMove();
    this.menu.hidden = false;
    this.menu.dispatchEvent(new Event('menu:open'));
    (this.menu.querySelector('button.choice') as HTMLElement | null)?.focus();
  }

  // ------------------------------------------------------------------ état et affichage

  private buildViewMenu(): HTMLElement {
    const recenter = h('button', { type: 'button', class: 'pop-row', html: `${icon('recenter', 22)}<span>${t('view.recenter')}</span>` });
    recenter.addEventListener('click', () => {
      this.scene.recenter();
      this.setViewMenu(false);
    });
    this.viewFreeRow = h('button', { type: 'button', class: 'pop-row', role: 'switch', 'aria-checked': 'false', html: `${icon('free', 22)}<span>${t('view.free')}</span><i class="switch" aria-hidden="true"></i>` });
    this.viewFreeRow.addEventListener('click', () => {
      this.scene.setCameraFree(!this.scene.cameraFree);
      this.syncUi();
    });
    this.viewVisitRow = h('button', { type: 'button', class: 'pop-row visit-row', role: 'switch', 'aria-checked': 'false', html: `${icon('eye', 22)}<span>${t('view.visit')}</span><i class="switch" aria-hidden="true"></i>` });
    this.viewVisitRow.addEventListener('click', () => {
      this.setVisit(!this.visit);
      this.setViewMenu(false);
    });
    const radios = h('div', { class: 'pop-radios', role: 'radiogroup', 'aria-label': t('view.finger') }, h('div', { class: 'pop-label' }, t('view.finger')));
    for (const [mode, key] of [['placement', 'view.finger.piece'], ['camera', 'view.finger.view']] as Array<[InteractionMode, Key]>) {
      const row = h('button', { type: 'button', class: 'pop-row', role: 'radio', 'aria-checked': 'false', html: `<i class="radio" aria-hidden="true"></i><span>${t(key)}</span>` });
      row.addEventListener('click', () => this.setMode(mode));
      this.viewModeRows.set(mode, row);
      radios.append(row);
    }
    return h('div', { class: 'view-pop', id: 'view-pop', role: 'group', 'aria-label': t('view.button'), hidden: '' }, recenter, this.viewFreeRow, this.viewVisitRow, radios);
  }

  private setViewMenu(open: boolean): void {
    this.viewPop.hidden = !open;
    this.viewBtn.setAttribute('aria-expanded', String(open));
  }

  private syncViewMenu(): void {
    const free = this.scene.cameraFree;
    const camera = this.state.mode === 'camera';
    this.viewFreeRow.setAttribute('aria-checked', String(free));
    this.viewVisitRow.setAttribute('aria-checked', String(this.visit));
    for (const [mode, row] of this.viewModeRows) row.setAttribute('aria-checked', String(mode === this.state.mode));
    // Un point jaune rappelle qu'un réglage de vue n'est pas celui par défaut.
    this.viewBtn.innerHTML = `${icon('eye', 20)}<span>${t('view.button')}</span>${free || camera || this.visit ? '<i class="view-dot" aria-hidden="true"></i>' : ''}`;
    this.viewBtn.setAttribute('aria-label', t('view.button'));
  }

  /** Ouvre ou ferme le tiroir de choix de la pièce. */
  private setDrawer(open: boolean): void {
    this.drawer.hidden = !open;
    this.pieceChip.setAttribute('aria-expanded', String(open));
    // La forme choisie doit être visible à l'ouverture, même dans une rangée qui défile.
    if (open) this.sizeRow.querySelector('[aria-checked="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  private renderChip(): void {
    const s = this.state;
    const type = requireType(s.typeId);
    const name = typeName(type);
    const color = colorLabel(s.color);
    this.pieceChip.setAttribute('aria-label', `${name}, ${color.toLowerCase()}. ${t('chip.open')}`);
    this.pieceChip.innerHTML = `${partIconSvg(s.typeId, colorHex(s.color), finishOf(s.color))}<span class="chip-text"><span class="chip-title">${name}</span><span class="chip-sub">${color}</span></span><span class="chip-caret">${icon('up', 18)}</span>`;
  }

  private setTool(tool: Tool): void {
    this.cancelMove();
    this.setDrawer(false);
    this.state.tool = tool;
    this.linkSwitchId = null;
    this.state.selected = null;
    this.scene.setSelection(null);
    this.syncUi();
  }

  /** Entre dans la visite (ou en sort) : vue libre, un doigt tourne la vue, plus de pièce fantôme ni de panneau. */
  private setVisit(on: boolean): void {
    if (on === this.visit) return;
    this.cancelMove();
    this.setDrawer(false);
    this.visit = on;
    this.root.classList.toggle('visit', on);
    if (on) {
      this.visitSaved = { mode: this.state.mode, free: this.scene.cameraFree };
      this.setMode('camera');
      this.scene.setCameraFree(true);
    } else if (this.visitSaved) {
      this.scene.setCameraFree(this.visitSaved.free);
      this.setMode(this.visitSaved.mode);
      this.visitSaved = null;
    }
    this.syncUi();
  }

  private setMode(mode: InteractionMode): void {
    this.state.mode = mode;
    this.scene.setInteractionMode(mode);
    this.syncUi();
  }

  private setKind(kind: PieceKind): void {
    this.state.kind = kind;
    const current = requireType(this.state.typeId);
    if (current.kind !== kind || isSwitch(current.id)) {
      // Garde la même taille quand elle existe dans la nouvelle famille (l'interrupteur, lui, n'est dans aucun onglet).
      const same = typesOfKind(kind).find((ty) => ty.w === current.w && ty.l === current.l);
      this.state.typeId = (same ?? typesOfKind(kind)[0]!).id;
    }
    this.state.dy = 0;
    this.renderSizes();
    this.syncUi();
  }

  private syncUi(): void {
    if (!this.game) return;
    const s = this.state;
    const ro = !!this.projects?.readOnly;
    this.undoBtn.disabled = !this.game.canUndo || ro;
    this.redoBtn.disabled = !this.game.canRedo || ro;

    this.syncViewMenu();

    for (const [tool, b] of this.toolBtns) b.setAttribute('aria-pressed', String(tool === s.tool));
    for (const [kind, b] of this.kindBtns) b.setAttribute('aria-selected', String(kind === s.kind));
    for (const [id, b] of this.colorBtns) b.setAttribute('aria-checked', String(id === baseColorId(s.color)));
    this.colorName.textContent = colorLabel(s.color);
    for (const [finish, b] of this.finishBtns) b.setAttribute('aria-checked', String(finish === finishOf(s.color)));
    const switchChosen = isSwitch(s.typeId);
    this.glowHint.hidden = finishOf(s.color) !== 'glow' && !switchChosen;
    this.glowHintText.textContent = t(switchChosen ? 'finish.switchHint' : 'finish.glowHint');
    this.glowHint.classList.toggle('chosen', switchChosen);
    this.placeControls.hidden = s.tool !== 'place';
    this.removeControls.hidden = s.tool !== 'remove';
    this.pickControls.hidden = s.tool !== 'pick';
    this.moveControls.hidden = s.tool !== 'move';
    this.linkControls.hidden = s.tool !== 'link';
    this.visitExitBtn.hidden = !this.visit;
    this.moveRow.hidden = this.game.lifted === null;
    this.moveWholeBtn.hidden = this.game.lifted === null || this.liftConnected.length <= this.game.liftedGroup.length;
    this.padBox.hidden = !this.placing();
    this.renderChip();
    this.emptyHint.hidden = !(s.tool === 'place' && !this.visit && this.game.model.count === 0);
    this.emptyHint.textContent = t(this.coarsePointer ? 'hint.empty.touch' : 'hint.empty.mouse');
    for (const b of this.sizeRow.querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset['type'] === s.typeId));

    const type = requireType(s.typeId);
    this.rotateBtn.disabled = !canRotate(type) && !this.groupLifted();
    this.rotateBtn.hidden = !this.placing();

    this.ceilingBtn.hidden = true;
    this.syncLightsButton();
    this.refreshPlateHints();
    if (this.visit) {
      this.refreshGhost();
      this.scene.setSelection(null);
      this.status.textContent = t('status.visit');
      this.status.dataset['state'] = 'idle';
    } else if (this.placing()) {
      const result = this.refreshGhost();
      this.placeBtn.setAttribute('aria-disabled', String(!result.ok || ro));
      this.placeMini.setAttribute('aria-disabled', String(!result.ok || ro));
      this.moveDropBtn.setAttribute('aria-disabled', String(!result.ok || ro));
      this.moveInfo.textContent = this.groupLifted() ? t('move.liftedGroup', { n: this.game.liftedGroup.length }) : t('move.lifted');
      this.status.textContent = result.ok ? t('status.ok') : reasonText(result.reason ?? 'sans_appui', this.game.model.maxLevel);
      this.ceilingBtn.hidden = result.reason !== 'trop_haut' || !this.game.canRaiseCeiling || ro;
      this.status.dataset['state'] = result.ok ? 'ok' : 'bad';
    } else if (s.tool === 'move') {
      this.refreshGhost();
      this.scene.setSelection(null);
      this.moveInfo.textContent = t('move.hint');
      this.status.textContent = t('status.move');
      this.status.dataset['state'] = 'idle';
    } else if (s.tool === 'link') {
      this.refreshGhost();
      const sw = this.linkSwitchId === null ? undefined : this.game.model.get(this.linkSwitchId);
      if (this.linkSwitchId !== null && !sw) this.linkSwitchId = null;
      const linked = sw ? [...(this.game.switchLinks.get(sw.id) ?? [])].filter((id) => this.game.model.get(id)) : [];
      this.scene.setSelection(sw ? sw.id : null, linked);
      this.linkInfo.textContent = sw ? t('link.chosen', { n: linked.length }) : t('link.hint');
      this.status.textContent = t('status.link');
      this.status.dataset['state'] = sw ? 'ok' : 'idle';
    } else if (s.tool === 'pick') {
      this.refreshGhost();
      this.scene.setSelection(null);
      this.status.textContent = t('status.pick');
      this.status.dataset['state'] = 'idle';
    } else {
      this.refreshGhost();
      const piece = s.selected === null ? undefined : this.game.model.get(s.selected);
      if (s.selected !== null && !piece) s.selected = null;
      this.scene.setSelection(s.selected);
      const label = piece
        ? `${typeName(requireType(piece.typeId))}, ${colorLabel(piece.color).toLowerCase()}`
        : '';
      this.removeInfo.textContent = piece ? t('remove.selected', { piece: label }) : t('remove.select');
      this.status.textContent = t('status.remove');
      this.status.dataset['state'] = piece ? 'ok' : 'idle';
    }
    this.updateDebug();
  }

  /** Bouton « Lumières » : seulement s'il y a un interrupteur ; enfoncé tant qu'une lumière commandée est allumée. */
  private syncLightsButton(): void {
    const has = this.game.switches().length > 0;
    this.lightsBtn.hidden = !has;
    if (!has) return;
    const on = this.game.anySwitchOn;
    this.lightsBtn.innerHTML = icon(on ? 'bulb' : 'bulbOff');
    this.lightsBtn.setAttribute('aria-pressed', String(on));
    this.lightsBtn.setAttribute('aria-label', t(on ? 'lights.turnOff' : 'lights.turnOn'));
    this.lightsBtn.title = t(on ? 'lights.turnOff' : 'lights.turnOn');
  }

  private syncSoundButton(): void {
    const on = this.sound.enabled;
    this.soundBtn.innerHTML = icon(on ? 'sound' : 'mute');
    this.soundBtn.setAttribute('aria-pressed', String(on));
    this.soundBtn.setAttribute('aria-label', t(on ? 'sound.on' : 'sound.off'));
    this.soundBtn.title = t(on ? 'sound.on' : 'sound.off');
  }

  private updateSaveInfo(): void {
    const p = this.projects;
    if (!p) return;
    let key: Key = 'save.status.none';
    if (p.readOnly) key = 'save.status.readonly';
    else if (p.status === 'pending') key = 'save.status.pending';
    else if (p.status === 'error') key = 'save.status.error';
    else if (p.status === 'saved') key = 'save.status.saved';
    const time = p.lastSavedAt ? new Date(p.lastSavedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
    this.saveInfo.textContent = t(key, { time });
    this.saveInfo.dataset['state'] = p.status;
  }

  /** L'état d'enregistrement ou la lecture seule a changé. */
  private syncProjectUi(): void {
    const p = this.projects;
    if (!p || !this.game) return;
    this.banner.hidden = !p.readOnly;
    this.updateSaveInfo();
    if (document.activeElement !== this.nameInput) this.nameInput.value = p.meta.name;
    this.syncUi();
  }

  private showToast(text: string, kind: 'ok' | 'error'): void {
    window.clearTimeout(this.toastTimer);
    if (!text) {
      this.toast.hidden = true;
      return;
    }
    this.toast.textContent = text;
    this.toast.dataset['kind'] = kind;
    this.toast.hidden = false;
    this.toastTimer = window.setTimeout(() => (this.toast.hidden = true), 4200);
  }

  // ------------------------------------------------------------------ gestes et clavier

  private bindEvents(): void {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    c.addEventListener('pointermove', (e) => this.onPointerMove(e));
    c.addEventListener('pointerup', (e) => this.onPointerUp(e));
    c.addEventListener('pointercancel', (e) => this.pointers.delete(e.pointerId));
    window.addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener('pointerdown', (e) => {
      const target = e.target as Node | null;
      if (!this.viewPop.hidden && target && !this.viewPop.contains(target) && !this.viewBtn.contains(target)) this.setViewMenu(false);
      this.sound.unlock();
      this.coarsePointer = e.pointerType !== 'mouse';
    }, { passive: true });
    // Évite le zoom de page par pincement et les menus contextuels sur iOS.
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
  }

  /** `exact` : vise le point touché lui-même, sans le décalage qui garde la pièce visible au-dessus du doigt. */
  private aimWith(e: PointerEvent, exact = false): void {
    const touch = e.pointerType !== 'mouse';
    const offset = touch && !exact ? TOUCH_AIM_OFFSET_PX : 0;
    const group = this.groupLifted() ? this.game.liftedGroup : null;
    const type = requireType(this.state.typeId);
    const orient = normalizeOrient(type, this.state.orient);
    const { fx, fz } = group ? groupFootprint(group, this.liftTurns) : footprintSize(type, orient);
    const at = (a: { x: number; z: number }) => ({ gx: Math.floor(a.x - fx / 2 + 0.5), gz: Math.floor(a.z - fz / 2 + 0.5) });
    // La pièce suit le doigt sur le plan de sa hauteur de chute. On descend les niveaux depuis le haut : le premier niveau
    // dont le plan, au point visé, correspond bien à la hauteur de chute à cet endroit est celui que le doigt « touche ».
    const { baseW, baseL } = this.game.model;
    const levelAt = (gx: number, gz: number) => {
      const x = clamp(gx, 0, Math.max(0, baseW - fx));
      const z = clamp(gz, 0, Math.max(0, baseL - fz));
      return group ? groupLanding(this.game.model, group, this.liftTurns, x, z) : landingLevel(this.game.model, this.state.typeId, orient, x, z);
    };
    let pos: { gx: number; gz: number } | null = null;
    for (let level = this.game.model.maxLevel; level >= 0 && !pos; level--) {
      const a = this.scene.aim(e.clientX, e.clientY, offset, level);
      if (!a) continue;
      const cand = at(a);
      if (levelAt(cand.gx, cand.gz) === level) pos = cand;
    }
    if (!pos) return;
    const { gx, gz } = pos;
    this.state.gx = gx;
    this.state.gz = gz;
    this.syncUi();
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.drawer.hidden) {
      // Un appui sur la scène referme d'abord le tiroir de choix.
      this.setDrawer(false);
      this.tapCandidate = null;
      return;
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType });
    this.tapCandidate = this.pointers.size === 1 && (e.pointerType !== 'mouse' || e.button === 0) ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() } : null;
    // Un doigt posé sur une case « + » ne déplace pas la pièce visée : il va ouvrir l'ajout de plaque.
    const onHint = this.plateHints.length > 0 && this.scene.pickPlateHint(e.clientX, e.clientY) !== null;
    if (!onHint && this.pointers.size === 1 && this.placing() && this.state.mode === 'placement' && (e.pointerType !== 'mouse' || e.button === 0)) {
      this.aimWith(e);
    }
  }

  private onPointerMove(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    if (p) {
      p.x = e.clientX;
      p.y = e.clientY;
    }
    if (this.tapCandidate && this.tapCandidate.id === e.pointerId && Math.hypot(e.clientX - this.tapCandidate.x, e.clientY - this.tapCandidate.y) > TAP_MAX_MOVE_PX) {
      this.tapCandidate = null;
    }
    if (!this.placing() || this.state.mode !== 'placement') return;
    if (e.pointerType === 'mouse') {
      // Souris : la pièce suit le pointeur au survol et pendant le glisser du clic gauche.
      if (e.buttons === 0 || e.buttons === 1) this.aimWith(e);
    } else if (this.pointers.size === 1) {
      this.aimWith(e);
    }
  }

  private onPointerUp(e: PointerEvent): void {
    const tap = this.tapCandidate && this.tapCandidate.id === e.pointerId ? this.tapCandidate : null;
    this.pointers.delete(e.pointerId);
    this.tapCandidate = null;
    if (!tap || performance.now() - tap.t > 700) return;
    // Case « + » : proposer d'ajouter une plaque de ce côté.
    const hint = this.scene.pickPlateHint(e.clientX, e.clientY);
    if (hint !== null && this.plateHints[hint]) {
      this.openPlateDialog(this.plateHints[hint]!);
      return;
    }
    // Un interrupteur se touche pour allumer ou éteindre (sauf avec les outils qui agissent sur la pièce elle-même).
    if (this.state.tool === 'link' && !this.visit) {
      this.tapLink(this.scene.pickPiece(e.clientX, e.clientY));
      return;
    }
    if (this.visit || this.state.tool === 'place' || this.state.mode === 'camera') {
      const id = this.visit ? this.scene.pickActive(e.clientX, e.clientY) : this.scene.pickPiece(e.clientX, e.clientY);
      const piece = id === null ? undefined : this.game.model.get(id);
      // Une porte ou une fenêtre s'ouvre en visite ou quand un doigt tourne la vue : en pose, le toucher sert à poser à côté.
      if (piece && isOpening(piece.typeId) && (this.visit || this.state.mode === 'camera')) {
        const open = this.game.toggleOpening(piece.id);
        this.counts.opens += 1;
        this.sound.play('step');
        const shape = requireType(piece.typeId).shape;
        const what = shape === 'casement' ? 'window' : shape;
        this.showToast(t(`${what}.${open ? 'open' : 'closed'}` as Key), 'ok');
        return;
      }
      if (piece && isSwitch(piece.typeId)) {
        const on = this.game.toggleSwitch(piece.id);
        this.counts.lights += 1;
        this.sound.play('step');
        const bare = !this.game.switchLinks.get(piece.id)?.size;
        this.showToast(t(bare ? 'switch.unlinked' : on ? 'switch.on' : 'switch.off'), 'ok');
        return;
      }
    }
    if (this.visit) return;
    if (this.state.tool === 'remove') {
      this.removeNow(this.scene.pickPiece(e.clientX, e.clientY));
    } else if (this.state.tool === 'pick') {
      const id = this.scene.pickPiece(e.clientX, e.clientY);
      if (id !== null) this.copyPiece(id);
    } else if (this.state.tool === 'move' && this.game.lifted === null) {
      this.liftPiece(this.scene.pickPiece(e.clientX, e.clientY));
    } else if (this.state.mode === 'placement') {
      // Un clic ou un toucher bref pose la pièce à l'endroit visé. Glisser le doigt la déplace sans la poser ;
      // le bouton « Poser » reste là pour confirmer après un glisser ou la croix.
      this.aimWith(e, true);
      this.placeNow();
    }
  }

  /** Outil Relier : un interrupteur se choisit d'abord, puis chaque pièce lumineuse touchée lui est reliée ou détachée. */
  private tapLink(id: number | null): void {
    const piece = id === null ? undefined : this.game.model.get(id);
    if (!piece) return;
    if (isSwitch(piece.typeId)) {
      this.linkSwitchId = piece.id;
      this.sound.play('step');
      this.syncUi();
      return;
    }
    if (this.linkSwitchId === null) {
      this.showToast(t('link.needSwitch'), 'error');
      return;
    }
    if (!isGlow(piece.color)) {
      this.showToast(t('link.notGlow'), 'error');
      return;
    }
    if (!this.canEdit()) return;
    const linked = this.game.toggleLink(this.linkSwitchId, piece.id);
    this.sound.play('step');
    this.showToast(t(linked ? 'link.linked' : 'link.unlinked'), 'ok');
  }

  private onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (!this.noticeViewer.hidden) {
      if (e.key === 'Escape') this.noticeViewer.hidden = true;
      return;
    }
    if (!this.viewPop.hidden && e.key === 'Escape') {
      this.setViewMenu(false);
      return;
    }
    if (!this.drawer.hidden && e.key === 'Escape') {
      this.setDrawer(false);
      return;
    }
    if (!this.menu.hidden) {
      if (e.key === 'Escape') this.menu.hidden = true;
      return;
    }
    if (!this.newConfirm.hidden) {
      if (e.key === 'Escape') this.newConfirm.hidden = true;
      return;
    }
    const mod = e.metaKey || e.ctrlKey;
    const onButton = target?.tagName === 'BUTTON';
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      this.redo();
      return;
    }
    if (mod || e.altKey) return;
    switch (e.key) {
      case 'r':
      case 'R':
        this.rotate();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.moveOnScreen('up');
        break;
      case 'ArrowDown':
        e.preventDefault();
        this.moveOnScreen('down');
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.moveOnScreen('left');
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.moveOnScreen('right');
        break;
      case 'PageUp':
      case '+':
        this.shiftLevel(1);
        break;
      case 'PageDown':
      case '-':
        this.shiftLevel(-1);
        break;
      case 'Enter':
      case ' ':
        if (onButton) return;
        e.preventDefault();
        if (this.placing()) this.placeNow();
        break;
      case 'Delete':
      case 'Backspace':
        if (this.visit) return;
        e.preventDefault();
        this.setTool('remove');
        break;
      case 'Escape':
        if (this.visit) this.setVisit(false);
        else if (this.game.lifted) this.cancelMove();
        else this.setTool('place');
        break;
      default:
    }
  }

  // ------------------------------------------------------------------ mesures (?debug)

  private updateDebug(): void {
    const box = this.debugBox;
    if (!box) return;
    const stats = this.game.journal.stats();
    const f = this.scene.frameStats();
    box.innerHTML = `
      <strong>${t('debug.title')}</strong>
      <div>${t('debug.fps')} : <b data-k="fps">${f.fps.toFixed(0)}</b> · ${t('debug.p99')} : <b data-k="p99">${f.p99Ms.toFixed(0)}</b> ms</div>
      <div>${t('debug.pieces')} : <b data-k="pieces">${this.game.model.count}</b></div>
      <div>${t('debug.attempts')} : <b data-k="attempts">${stats.attempts}</b> · ${t('debug.missed')} : <b data-k="missed">${stats.missed}</b> (${(stats.missRate * 100).toFixed(0)} %)</div>
      <div class="debug-actions"></div>`;
    const actions = box.querySelector('.debug-actions')!;
    const mk = (label: string, fn: () => void) => {
      const b = h('button', { type: 'button', class: 'btn tiny' }, label);
      b.addEventListener('click', fn);
      actions.append(b);
    };
    mk(t('debug.load300'), () => {
      void this.api.loadReference(300).then(() => this.scene.resetFrameStats());
    });
    mk(t('debug.clear'), () => void this.projects.newProject(this.game.model.baseW, this.game.baseColor));
    mk(t('debug.copy'), () => {
      const payload = JSON.stringify({ stats: this.game.journal.stats(), events: this.game.journal.list() }, null, 1);
      void navigator.clipboard?.writeText(payload).then(() => this.showToast(t('debug.copied'), 'ok'));
    });
    mk(t('debug.loseGl'), () => this.scene.simulateContextLoss());
  }

  /** Rafraîchit périodiquement les mesures de performance affichées. */
  startDebugLoop(): void {
    if (!this.debug) return;
    window.setInterval(() => {
      const box = this.debugBox;
      if (!box) return;
      const f = this.scene.frameStats();
      const set = (k: string, v: string) => {
        const el = box.querySelector(`[data-k="${k}"]`);
        if (el) el.textContent = v;
      };
      set('fps', f.fps.toFixed(0));
      set('p99', f.p99Ms.toFixed(0));
    }, 500);
  }
}

const GRAPHICS_KEY = 'atelier-briques:graphismes';

/** Réglages graphiques enregistrés sur l'appareil (null s'il n'y en a pas, ou s'ils sont illisibles). */
function loadGraphics(): Graphics | null {
  try {
    const raw = JSON.parse(localStorage.getItem(GRAPHICS_KEY) ?? 'null') as Partial<Graphics> | null;
    if (!raw || typeof raw !== 'object') return null;
    if (typeof raw.halo !== 'boolean' || typeof raw.night !== 'boolean' || typeof raw.sharp !== 'boolean') return null;
    if (raw.shadows !== 'soft' && raw.shadows !== 'simple' && raw.shadows !== 'none') return null;
    return { halo: raw.halo, night: raw.night, sharp: raw.sharp, shadows: raw.shadows };
  } catch {
    return null;
  }
}

function saveGraphics(g: Graphics): void {
  try {
    localStorage.setItem(GRAPHICS_KEY, JSON.stringify(g));
  } catch {
    /* préférence non conservée */
  }
}

/** La plaque de cette case « + » tiendrait-elle à cette taille ? */
function edgeFits(plates: Parameters<typeof plateBeside>[0], hint: PlateHint, size: number): boolean {
  return plateBeside(plates, plates[hint.from]!, hint.side, size, 'vert').ok;
}

const PLATES_KEY = 'atelier-briques:casesPlus';

/** Réglage oui / non gardé sur l'appareil (valeur par défaut s'il n'y en a pas ou si le stockage est indisponible). */
function loadFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function saveFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* préférence non conservée */
  }
}
