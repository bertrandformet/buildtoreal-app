// Affichage 3D de la construction. Cette couche ne décide d'aucune règle : elle montre le modèle et un « fantôme ».

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { TIRE_COLOR, accentColor, colorHex, isGlow, isOpening, isSwitch, isTranslucent } from '../core/catalogue';
import { litPieces } from '../core/lights';
import type { Game } from '../core/game';
import type { Cell, Piece } from '../core/model';
import { addFillLight, pieceMaterial } from './materials';
import { PLATE_H, STUD_H, STUD_R, hasTires, pieceGeometry, pieceSize } from './pieceGeometry';

export interface GhostInfo {
  readonly typeId: string;
  readonly orient: number;
  readonly color: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly valid: boolean;
  readonly supported: readonly Cell[];
  readonly colliding: readonly Cell[];
  /** Ensemble déplacé d'un bloc : ses pièces, à leur place visée (x, y, z ci-dessus = coin minimal de la boîte). */
  readonly group?: readonly GhostPart[];
}

export interface GhostPart {
  readonly typeId: string;
  readonly orient: number;
  readonly color: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type InteractionMode = 'placement' | 'camera';
export type Quality = 'high' | 'low';

/** Réglages graphiques avancés. Les deux qualités (Élevée, Économie) en sont des préréglages. */
export interface Graphics {
  /** Halo autour des pièces lumineuses allumées. */
  readonly halo: boolean;
  readonly shadows: 'soft' | 'simple' | 'none';
  /** Scène assombrie : les pièces lumineuses ressortent. */
  readonly night: boolean;
  /** Image nette (résolution de l'écran, jusqu'à 2×) ; sinon économique (1×). Le givré « vrai » suit ce réglage. */
  readonly sharp: boolean;
}

export const QUALITY_PRESETS: Readonly<Record<Quality, Omit<Graphics, 'night'>>> = {
  high: { halo: true, shadows: 'soft', sharp: true },
  low: { halo: false, shadows: 'none', sharp: false },
};

/** Nombre de petites lumières (sans ombre) posées sur les pièces lumineuses allumées : fixe, pour éviter de recompiler les matériaux. */
const GLOW_LIGHTS = 4;

export interface FrameStats {
  readonly frames: number;
  readonly fps: number;
  readonly p99Ms: number;
}

const NO_BUTTON = -1 as unknown as THREE.MOUSE;
const NO_TOUCH = -1 as unknown as THREE.TOUCH;

export class BuildScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;

  private readonly scene = new THREE.Scene();
  private readonly canvas: HTMLCanvasElement;
  private readonly sun: THREE.DirectionalLight;
  private readonly world = new THREE.Group();
  private readonly pieceGroup = new THREE.Group();
  private baseGroup = new THREE.Group();
  /** Plaques de la surface, pour le lancer de rayon (le pointeur s'arrête sur elles). */
  private baseMeshes: THREE.Mesh[] = [];
  /** Signature des plaques affichées, et position de la première : on suit un décalage de la surface. */
  private platesKey = '';
  /** Cadre actuel de l'image d'ombre (pour ne la recadrer que si la construction a changé d'étendue). */
  private shadowKey = '';
  private firstPlate = { x: 0, z: 0 };
  private table: THREE.Mesh;
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private game!: Game;
  private unsubscribe: (() => void) | null = null;

  // Fantôme
  private readonly ghostGroup = new THREE.Group();
  /** Pièces du fantôme, placées par rapport au coin de leur boîte : une seule, ou tout un ensemble. */
  private readonly ghostParts = new THREE.Group();
  /** Matériaux translucides des pièces d'un ensemble, un par couleur. */
  private readonly ghostColorMaterials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly ghostMaterial = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.62, depthWrite: false, roughness: 0.4 });
  private readonly ghostTireMaterial = new THREE.MeshStandardMaterial({ color: colorHex(TIRE_COLOR), transparent: true, opacity: 0.62, depthWrite: false, roughness: 0.6 });
  private ghostOutline: THREE.LineSegments | null = null;
  private ghostFootprint: THREE.Mesh;
  private readonly supportMarkers: THREE.Mesh[] = [];
  private readonly collisionMarkers: THREE.Mesh[] = [];
  private ghostKey = '';

  // Surbrillance
  private readonly selectionMaterial = new THREE.MeshBasicMaterial({ color: 0xff9500, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false });
  private readonly flashMaterial = new THREE.MeshBasicMaterial({ color: 0xe5302a, transparent: true, opacity: 0.7, depthTest: false, depthWrite: false });
  private readonly linkedMaterial = new THREE.MeshBasicMaterial({ color: 0x2fbf71, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false });
  private readonly highlightGroup = new THREE.Group();
  private flashGroup = new THREE.Group();
  private flashUntil = 0;

  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();

  private mode: InteractionMode = 'placement';
  private free = false;
  private graphics: Graphics = { ...QUALITY_PRESETS.high, night: false };
  private readonly hemi: THREE.HemisphereLight;
  private readonly fill: THREE.DirectionalLight;
  private readonly haloGroup = new THREE.Group();
  /** Cases « + » : où une plaque peut s'ajouter, près du bord où l'on construit. */
  private readonly hintGroup = new THREE.Group();
  private hintKey = '';
  private plusTexture: THREE.Texture | null = null;
  private haloTexture: THREE.Texture | null = null;
  private readonly glowLights: THREE.PointLight[] = [];
  private orbit: { t0: number; dur: number; angle: number; base: THREE.Vector3; done: number } | null = null;
  private tween: { fromPos: THREE.Vector3; toPos: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3; t0: number; dur: number } | null = null;
  private readonly reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  private frameTimes: number[] = [];
  private lastTime = 0;
  private lost = false;
  private running = false;
  private readonly resizeObserver: ResizeObserver;

  constructor(canvas: HTMLCanvasElement, quality: Quality = 'high') {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.scene.background = new THREE.Color('#e9ecf1');
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xb8bfca, 0.5);
    this.scene.add(this.hemi);
    this.fill = addFillLight(this.scene);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.04;
    this.controls.minDistance = 4;
    this.controls.rotateSpeed = 0.8;
    this.controls.zoomSpeed = 0.9;

    const tableGeo = new THREE.PlaneGeometry(400, 400);
    this.table = new THREE.Mesh(tableGeo, new THREE.MeshStandardMaterial({ color: '#dfe3ea', roughness: 1 }));
    this.table.rotation.x = -Math.PI / 2;
    this.table.position.y = -PLATE_H - 0.002;
    this.table.receiveShadow = true;
    this.scene.add(this.table);

    this.world.add(this.baseGroup, this.pieceGroup, this.haloGroup, this.hintGroup, this.highlightGroup, this.flashGroup, this.ghostGroup);
    this.scene.add(this.world);

    // Fantôme : corps translucide, contour, repères d'appui et de collision.
    this.ghostGroup.add(this.ghostParts);
    this.ghostFootprint = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x2f6fd1, transparent: true, opacity: 0.28, depthWrite: false }));
    this.ghostFootprint.rotation.x = -Math.PI / 2;
    this.ghostFootprint.renderOrder = 4;
    this.ghostGroup.add(this.ghostFootprint);
    const supportGeo = new THREE.CylinderGeometry(STUD_R + 0.05, STUD_R + 0.05, 0.05, 20);
    const supportMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.95, depthTest: false });
    for (let i = 0; i < 128; i++) {
      const m = new THREE.Mesh(supportGeo, supportMat);
      m.renderOrder = 6;
      m.visible = false;
      this.supportMarkers.push(m);
      this.ghostGroup.add(m);
    }
    const collisionGeo = new THREE.BoxGeometry(0.98, PLATE_H * 0.98, 0.98);
    const collisionMat = new THREE.MeshBasicMaterial({ color: 0xe5302a, transparent: true, opacity: 0.55, depthTest: false });
    for (let i = 0; i < 160; i++) {
      const m = new THREE.Mesh(collisionGeo, collisionMat);
      m.renderOrder = 6;
      m.visible = false;
      this.collisionMarkers.push(m);
      this.ghostGroup.add(m);
    }
    this.ghostGroup.visible = false;

    this.setGraphics({ ...QUALITY_PRESETS[quality], night: false });
    this.setInteractionMode('placement');

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);

    // Perte du contexte WebGL (ex. application passée en arrière-plan sur mobile) : la scène est recréée depuis le modèle.
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.materials.clear();
      this.rebuildBase();
      this.rebuildPieces();
      this.ghostKey = '';
      this.start();
    });
  }

  // ----------------------------------------------------------------- partie

  setGame(game: Game): void {
    this.unsubscribe?.();
    this.game = game;
    this.rebuildBase();
    this.rebuildPieces();
    this.setSelection(null);
    this.setGhost(null);
    this.frameSurface();
    this.recenter(true);
    this.unsubscribe = game.subscribe(() => this.onGameChange());
  }

  /** Recul de la caméra selon la taille de la surface ; ombres cadrées sur la construction. */
  private frameSurface(): void {
    this.applyDistanceLimits();
    this.fitShadows();
  }

  /**
   * Une seule image d'ombre (2048 × 2048) : on la cadre sur les pièces, avec une marge, plutôt que sur toute la surface.
   * Ainsi les ombres restent nettes même sur une grande surface (jusqu'à 128 × 128 tenons).
   */
  private fitShadows(): void {
    const model = this.game.model;
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    let top = 0;
    for (const p of model.all()) {
      const s = pieceSize(p.typeId, p.orient);
      x0 = Math.min(x0, p.x);
      z0 = Math.min(z0, p.z);
      x1 = Math.max(x1, p.x + s.x);
      z1 = Math.max(z1, p.z + s.z);
      top = Math.max(top, p.y * PLATE_H + s.y);
    }
    if (x0 === Infinity) {
      // Rien de posé : la première plaque.
      const first = model.plates[0]!;
      [x0, z0, x1, z1] = [first.x, first.z, first.x + first.w, first.z + first.l];
    }
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    // Marge : l'ombre portée d'une tour s'allonge de sa hauteur environ.
    const half = Math.max(x1 - x0, z1 - z0) / 2 + top * 0.8 + 6;
    const key = [cx, cz, half].map((v) => Math.round(v * 2)).join('|');
    if (key === this.shadowKey) return;
    this.shadowKey = key;
    const sunOffset = new THREE.Vector3(0.7, 1.4, 0.4).normalize().multiplyScalar(half * 2 + 80);
    this.sun.position.set(cx + sunOffset.x, sunOffset.y, cz + sunOffset.z);
    this.sun.target.position.set(cx, 0, cz);
    const cam = this.sun.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 1;
    cam.far = half * 4 + 160;
    cam.updateProjectionMatrix();
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
  }

  /** La partie a changé : pièces toujours ; plaques seulement si la surface a changé (ajout, ou son annulation). */
  private onGameChange(): void {
    const plates = this.game.model.plates;
    const key = JSON.stringify(plates);
    if (key !== this.platesKey) {
      // Une plaque ajoutée à gauche ou au fond décale tout : la caméra suit, la vue ne saute pas.
      const first = plates[0]!;
      const shift = new THREE.Vector3(first.x - this.firstPlate.x, 0, first.z - this.firstPlate.z);
      this.camera.position.add(shift);
      this.controls.target.add(shift);
      this.rebuildBase();
      this.frameSurface();
    }
    this.rebuildPieces();
  }

  private materialFor(color: string, lit = true): THREE.MeshStandardMaterial {
    const key = `${color}|${lit}`;
    let m = this.materials.get(key);
    if (!m) {
      m = pieceMaterial(color, { lit, frostReal: this.graphics.sharp, night: this.graphics.night });
      this.materials.set(key, m);
    }
    return m;
  }

  /** Matériau(x) d'une pièce : un seul, ou corps + pneus (ou manette) noirs. */
  private materialsFor(typeId: string, color: string, lit = true): THREE.Material | THREE.Material[] {
    const body = this.materialFor(color, lit);
    const accent = accentColor(typeId);
    return accent ? [body, this.materialFor(accent)] : body;
  }

  private clearGroup(group: THREE.Group): void {
    for (const child of [...group.children]) {
      group.remove(child);
      if (child instanceof THREE.InstancedMesh) child.dispose();
    }
  }

  private rebuildBase(): void {
    this.clearGroup(this.baseGroup);
    this.baseMeshes = [];
    const plates = this.game.model.plates;
    this.platesKey = JSON.stringify(plates);
    this.firstPlate = { x: plates[0]!.x, z: plates[0]!.z };
    const m = new THREE.Matrix4();
    for (const plate of plates) {
      const mat = new THREE.MeshStandardMaterial({ color: baseColorHex(plate.color), roughness: 0.5 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(plate.w, PLATE_H, plate.l), mat);
      box.position.set(plate.x + plate.w / 2, -PLATE_H / 2, plate.z + plate.l / 2);
      box.castShadow = true;
      box.receiveShadow = true;
      const studs = new THREE.InstancedMesh(new THREE.CylinderGeometry(STUD_R, STUD_R, STUD_H, 16), mat, plate.w * plate.l);
      let i = 0;
      for (let x = 0; x < plate.w; x++) {
        for (let z = 0; z < plate.l; z++) {
          m.makeTranslation(plate.x + x + 0.5, STUD_H / 2 - 0.01, plate.z + z + 0.5);
          studs.setMatrixAt(i++, m);
        }
      }
      studs.castShadow = true;
      studs.receiveShadow = true;
      this.baseGroup.add(box, studs);
      this.baseMeshes.push(box);
    }
  }

  private rebuildPieces(): void {
    this.clearGroup(this.pieceGroup);
    const model = this.game.model;
    const off = this.game.switchesOff;
    const lit = litPieces(model, off, this.game.switchLinks);
    const groups = new Map<string, { list: Piece[]; orient: number; lit: boolean; open: boolean }>();
    for (const p of model.all()) {
      // Interrupteur éteint : la manette penche de l'autre côté (la même forme, un demi-tour).
      const orient = isSwitch(p.typeId) && off.has(p.id) ? (p.orient + 2) % 4 : p.orient;
      const on = !isGlow(p.color) || lit.has(p.id);
      const open = isOpening(p.typeId) && this.game.openings.has(p.id);
      const key = `${p.typeId}|${orient}|${p.color}|${on}|${open}`;
      const g = groups.get(key);
      if (g) g.list.push(p);
      else groups.set(key, { list: [p], orient, lit: on, open });
    }
    const m = new THREE.Matrix4();
    for (const { list, orient, lit: on, open } of groups.values()) {
      const first = list[0]!;
      const mesh = new THREE.InstancedMesh(pieceGeometry(first.typeId, orient, open), this.materialsFor(first.typeId, first.color, on), list.length);
      list.forEach((p, i) => {
        m.makeTranslation(p.x, p.y * PLATE_H, p.z);
        mesh.setMatrixAt(i, m);
      });
      mesh.userData['ids'] = list.map((p) => p.id);
      // Verre et givré laissent passer la lumière : pas d'ombre portée, et ils se dessinent après les pièces opaques.
      const see = isTranslucent(first.color);
      mesh.castShadow = !see;
      mesh.receiveShadow = true;
      if (see) mesh.renderOrder = 2;
      this.pieceGroup.add(mesh);
    }
    this.rebuildGlow(lit);
    this.fitShadows();
  }

  /** Halos et petites lumières des pièces lumineuses allumées. */
  private rebuildGlow(lit: ReadonlySet<number>): void {
    for (const child of this.haloGroup.children) ((child as THREE.Sprite).material as THREE.Material).dispose();
    this.haloGroup.clear();
    const pieces = [...lit].map((id) => this.game.model.get(id)!).filter(Boolean);
    if (pieces.length > 0 && this.glowLights.length === 0) {
      for (let i = 0; i < GLOW_LIGHTS; i++) {
        const light = new THREE.PointLight(0xffffff, 0, 7, 2);
        this.glowLights.push(light);
        this.world.add(light);
      }
    }
    const strength = this.graphics.night ? 5 : 2;
    this.glowLights.forEach((light, i) => {
      const p = pieces[i];
      light.intensity = p ? strength : 0;
      if (!p) return;
      const size = pieceSize(p.typeId, p.orient);
      light.color.set(colorHex(p.color));
      light.position.set(p.x + size.x / 2, p.y * PLATE_H + size.y / 2, p.z + size.z / 2);
    });
    if (!this.graphics.halo || pieces.length === 0) return;
    this.haloTexture ??= haloTexture();
    for (const p of pieces) {
      const size = pieceSize(p.typeId, p.orient);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.haloTexture, color: colorHex(p.color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: haloOpacity(colorHex(p.color), this.graphics.night) }),
      );
      const r = Math.max(size.x, size.z, size.y) * 1.9 + 0.8;
      sprite.scale.set(r, r, 1);
      sprite.position.set(p.x + size.x / 2, p.y * PLATE_H + size.y / 2, p.z + size.z / 2);
      sprite.renderOrder = 3;
      this.haloGroup.add(sprite);
    }
  }

  // ----------------------------------------------------------------- caméra

  private defaultView(): { pos: THREE.Vector3; target: THREE.Vector3 } {
    const { baseW: W, baseL: L } = this.game.model;
    const dir = new THREE.Vector3(0.45, 0.72, 0.9).normalize();
    const pieces = this.game.model.all();
    if (pieces.length > 0) {
      // La vue se centre sur la construction elle-même, et recule selon sa taille.
      const box = new THREE.Box3();
      for (const p of pieces) {
        const s = pieceSize(p.typeId, p.orient);
        box.expandByPoint(new THREE.Vector3(p.x, p.y * PLATE_H, p.z));
        box.expandByPoint(new THREE.Vector3(p.x + s.x, p.y * PLATE_H + s.y, p.z + s.z));
      }
      const center = box.getCenter(new THREE.Vector3());
      const span = box.getSize(new THREE.Vector3());
      const extent = Math.max(span.x, span.z, span.y * 1.2);
      const dist = Math.min(Math.max(extent * 1.9 + 6, 12), Math.max(W, L) * 4);
      return { pos: center.clone().add(dir.multiplyScalar(dist)), target: center };
    }
    const size = Math.max(W, L);
    const target = new THREE.Vector3(W / 2, 1.0, L / 2);
    const dist = size * 1.05 + 8;
    return { pos: target.clone().add(dir.multiplyScalar(dist)), target };
  }

  private applyDistanceLimits(): void {
    const size = Math.max(this.game.model.baseW, this.game.model.baseL);
    this.controls.maxDistance = this.free ? size * 8 : size * 4.2;
    this.controls.enablePan = this.free;
    this.controls.screenSpacePanning = true;
  }

  /** Recentre la vue sur la zone de montage. */
  recenter(instant = false): void {
    this.orbit = null;
    const { pos, target } = this.defaultView();
    if (instant || this.reducedMotion) {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
      this.tween = null;
      return;
    }
    this.tween = {
      fromPos: this.camera.position.clone(),
      toPos: pos,
      fromTarget: this.controls.target.clone(),
      toTarget: target,
      t0: performance.now(),
      dur: 450,
    };
  }

  setCameraFree(on: boolean): void {
    this.free = on;
    this.applyDistanceLimits();
    this.controls.mouseButtons = this.mouseButtons();
    this.applyTouches();
    if (!on) this.recenter();
  }

  get cameraFree(): boolean {
    return this.free;
  }

  private mouseButtons(): { LEFT: THREE.MOUSE; MIDDLE: THREE.MOUSE; RIGHT: THREE.MOUSE } {
    return {
      LEFT: this.mode === 'camera' ? THREE.MOUSE.ROTATE : NO_BUTTON,
      MIDDLE: this.free ? THREE.MOUSE.PAN : THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE,
    };
  }

  /** En mode « placement », un doigt (ou le clic gauche) déplace la pièce ; en mode « caméra », il tourne la vue. */
  setInteractionMode(mode: InteractionMode): void {
    this.mode = mode;
    this.controls.mouseButtons = this.mouseButtons();
    this.applyTouches();
  }

  /**
   * Un doigt : tourne la vue en mode « caméra », déplace la pièce sinon.
   * Deux doigts : zoom et rotation en vue centrée (pour faire le tour sans changer de mode), zoom et déplacement en caméra libre.
   */
  private applyTouches(): void {
    this.controls.touches = {
      ONE: this.mode === 'camera' ? THREE.TOUCH.ROTATE : NO_TOUCH,
      TWO: this.free ? THREE.TOUCH.DOLLY_PAN : THREE.TOUCH.DOLLY_ROTATE,
    };
  }

  /** Fait pivoter la vue autour de la construction (boutons), en conservant la distance et la hauteur. */
  rotateView(degrees: number): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const angle = THREE.MathUtils.degToRad(degrees);
    if (this.reducedMotion) {
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      this.camera.position.copy(this.controls.target).add(offset);
      this.controls.update();
      return;
    }
    this.tween = null;
    // On enchaîne proprement si l'on appuie à nouveau pendant le mouvement.
    const pending = this.orbit ? this.orbit.angle - this.orbit.done : 0;
    this.orbit = { t0: performance.now(), dur: 380, angle: angle + pending, base: offset, done: 0 };
  }

  /** Azimut de la caméra, ramené à l'axe de la grille le plus proche : sert aux flèches relatives à l'écran. */
  screenAxes(): { forward: { x: number; z: number }; right: { x: number; z: number } } {
    const f = new THREE.Vector3();
    this.camera.getWorldDirection(f);
    const forward = Math.abs(f.x) > Math.abs(f.z) ? { x: Math.sign(f.x), z: 0 } : { x: 0, z: Math.sign(f.z) };
    return { forward, right: { x: -forward.z, z: forward.x } };
  }

  // ----------------------------------------------------------------- pointage

  private setPointer(clientX: number, clientY: number): void {
    // Les matrices ne sont recalculées qu'au rendu : on les met à jour pour viser juste même juste après un changement.
    this.camera.updateMatrixWorld();
    this.scene.updateMatrixWorld();
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
  }

  private pickables(): THREE.Object3D[] {
    const list: THREE.Object3D[] = [...this.pieceGroup.children];
    list.push(...this.baseMeshes);
    return list;
  }

  /**
   * Affiche les cases « + » : chaque rectangle est la plaque qu'on ajouterait (coordonnées de la surface, éventuellement
   * négatives). Liste vide : rien.
   */
  setPlateHints(hints: ReadonlyArray<{ x: number; z: number; w: number; l: number }>): void {
    const key = JSON.stringify(hints);
    if (key === this.hintKey) return;
    this.hintKey = key;
    for (const child of this.hintGroup.children) {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      (mesh.material as THREE.Material | undefined)?.dispose();
    }
    this.hintGroup.clear();
    this.plusTexture ??= plusTexture();
    hints.forEach((h, i) => {
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(h.w, h.l),
        new THREE.MeshBasicMaterial({ color: 0x2f6fd1, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(h.x + h.w / 2, -PLATE_H + 0.01, h.z + h.l / 2);
      plane.userData['hint'] = i;
      plane.renderOrder = 4;
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(h.w - 0.2, h.l - 0.2)),
        new THREE.LineDashedMaterial({ color: 0x2f6fd1, dashSize: 0.8, gapSize: 0.5, transparent: true, opacity: 0.9 }),
      );
      edge.computeLineDistances();
      edge.rotation.x = -Math.PI / 2;
      edge.position.copy(plane.position).setY(-PLATE_H + 0.02);
      const plus = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.plusTexture, depthTest: false, transparent: true }));
      const r = Math.min(4, Math.max(2.4, Math.min(h.w, h.l) * 0.22));
      plus.scale.set(r, r, 1);
      plus.position.set(h.x + h.w / 2, r * 0.6, h.z + h.l / 2);
      plus.userData['hint'] = i;
      plus.renderOrder = 9;
      this.hintGroup.add(plane, edge, plus);
    });
  }

  /** Case « + » sous le pointeur (son rang dans la liste donnée à `setPlateHints`), ou null. */
  pickPlateHint(clientX: number, clientY: number): number | null {
    if (this.hintGroup.children.length === 0) return null;
    this.setPointer(clientX, clientY);
    const targets = this.hintGroup.children.filter((c) => c.userData['hint'] !== undefined);
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    return hit ? (hit.object.userData['hint'] as number) : null;
  }

  /** Pièce sous le pointeur (outil « retirer »). */
  pickPiece(clientX: number, clientY: number): number | null {
    this.setPointer(clientX, clientY);
    const hit = this.raycaster.intersectObjects(this.pickables(), false)[0];
    if (!hit || !(hit.object instanceof THREE.InstancedMesh) || hit.instanceId === undefined) return null;
    const ids = hit.object.userData['ids'] as number[] | undefined;
    return ids?.[hit.instanceId] ?? null;
  }

  /**
   * Interrupteur, porte ou fenêtre sous le pointeur, même derrière des pièces transparentes ou givrées : on regarde à travers
   * jusqu'à la première pièce opaque (comprise).
   */
  pickActive(clientX: number, clientY: number): number | null {
    this.setPointer(clientX, clientY);
    for (const hit of this.raycaster.intersectObjects(this.pickables(), false)) {
      if (!(hit.object instanceof THREE.InstancedMesh) || hit.instanceId === undefined) continue;
      const id = (hit.object.userData['ids'] as number[] | undefined)?.[hit.instanceId];
      const piece = id === undefined ? undefined : this.game.model.get(id);
      if (!piece) continue;
      if (isSwitch(piece.typeId) || isOpening(piece.typeId)) return piece.id;
      if (!isTranslucent(piece.color)) return null;
    }
    return null;
  }

  /**
   * Point visé (coordonnées continues en tenons) sur le plan horizontal de la hauteur où la pièce se posera.
   * Les pièces déjà posées ne comptent pas dans la visée : elles masquent l'espace entre elles, et la perspective
   * décalerait la pièce si l'on visait le sol. `offsetPx` décale la visée vers le haut de l'écran, pour que le doigt
   * ne masque pas la pièce. `level` : niveau du plan, en plaques.
   */
  aim(clientX: number, clientY: number, offsetPx: number, level: number): { x: number; z: number } | null {
    this.setPointer(clientX, clientY - offsetPx);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -level * PLATE_H);
    const point = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, point) ? { x: point.x, z: point.z } : null;
  }

  /** Azimut de la caméra autour de son point de visée, en radians. */
  azimuth(): number {
    return Math.atan2(this.camera.position.x - this.controls.target.x, this.camera.position.z - this.controls.target.z);
  }

  /** Position écran (pixels client) d'un point du monde : utile aux tests automatisés. */
  screenOf(x: number, y: number, z: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  // ----------------------------------------------------------------- fantôme et surbrillances

  setGhost(info: GhostInfo | null): void {
    if (!info) {
      this.ghostGroup.visible = false;
      return;
    }
    this.ghostGroup.visible = true;
    const parts: readonly GhostPart[] = info.group ?? [info];
    const key = parts.map((p) => `${p.typeId}|${p.orient}|${info.group ? p.color : ''}|${p.x - info.x}|${p.y - info.y}|${p.z - info.z}`).join(';');
    if (key !== this.ghostKey) {
      this.ghostKey = key;
      this.ghostParts.clear();
      // Boîte de l'ensemble, par rapport à son coin : sert au contour et à l'ombre au sol.
      const size = new THREE.Vector3();
      for (const p of parts) {
        const body = info.group ? this.ghostColorMaterial(p.color) : this.ghostMaterial;
        const mesh = new THREE.Mesh(pieceGeometry(p.typeId, p.orient), hasTires(p.typeId) ? [body, accentColor(p.typeId) === TIRE_COLOR ? this.ghostTireMaterial : body] : body);
        mesh.renderOrder = 5;
        mesh.position.set(p.x - info.x, (p.y - info.y) * PLATE_H, p.z - info.z);
        this.ghostParts.add(mesh);
        const s = pieceSize(p.typeId, p.orient);
        size.max(new THREE.Vector3(p.x - info.x + s.x, (p.y - info.y) * PLATE_H + s.y, p.z - info.z + s.z));
      }
      if (this.ghostOutline) {
        this.ghostGroup.remove(this.ghostOutline);
        this.ghostOutline.geometry.dispose();
      }
      const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z));
      edges.translate(size.x / 2, size.y / 2, size.z / 2);
      this.ghostOutline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x22c55e, depthTest: false }));
      this.ghostOutline.renderOrder = 7;
      this.ghostGroup.add(this.ghostOutline);
      this.ghostFootprint.scale.set(size.x, size.z, 1);
      this.ghostFootprint.userData['size'] = size;
    }
    const yWorld = info.y * PLATE_H;
    this.ghostParts.position.set(info.x, yWorld, info.z);
    this.ghostOutline?.position.set(info.x, yWorld, info.z);
    (this.ghostOutline?.material as THREE.LineBasicMaterial).color.set(info.valid ? 0x22c55e : 0xe5302a);
    if (!info.group) this.ghostMaterial.color.set(colorHex(info.color));
    const size = this.ghostFootprint.userData['size'] as THREE.Vector3;
    // Ombre portée au sol : repère de l'emplacement exact quand la pièce est en hauteur.
    this.ghostFootprint.visible = info.y > 0;
    this.ghostFootprint.position.set(info.x + size.x / 2, 0.012, info.z + size.z / 2);

    this.supportMarkers.forEach((m, i) => {
      const c = info.supported[i];
      m.visible = !!c;
      if (c) m.position.set(c.x + 0.5, c.y * PLATE_H + STUD_H + 0.01, c.z + 0.5);
    });
    this.collisionMarkers.forEach((m, i) => {
      const c = info.colliding[i];
      m.visible = !!c;
      if (c) m.position.set(c.x + 0.5, (c.y + 0.5) * PLATE_H, c.z + 0.5);
    });
  }

  private ghostColorMaterial(color: string): THREE.MeshStandardMaterial {
    let m = this.ghostColorMaterials.get(color);
    if (!m) {
      m = this.ghostMaterial.clone();
      m.color.set(colorHex(color));
      this.ghostColorMaterials.set(color, m);
    }
    return m;
  }

  private highlightMesh(piece: Piece, material: THREE.Material): THREE.Mesh {
    const s = 1.05;
    const size = pieceSize(piece.typeId, piece.orient);
    const mesh = new THREE.Mesh(pieceGeometry(piece.typeId, piece.orient), material);
    mesh.scale.setScalar(s);
    mesh.position.set(piece.x - ((s - 1) * size.x) / 2, piece.y * PLATE_H - ((s - 1) * size.y) / 2, piece.z - ((s - 1) * size.z) / 2);
    mesh.renderOrder = 8;
    return mesh;
  }

  /** Surligne une pièce (orange) et, en vert, d'autres pièces qui lui sont reliées. */
  setSelection(pieceId: number | null, linked: readonly number[] = []): void {
    this.highlightGroup.clear();
    const piece = pieceId === null ? undefined : this.game.model.get(pieceId);
    if (piece) this.highlightGroup.add(this.highlightMesh(piece, this.selectionMaterial));
    for (const id of linked) {
      const other = this.game.model.get(id);
      if (other) this.highlightGroup.add(this.highlightMesh(other, this.linkedMaterial));
    }
  }

  /** Fait clignoter des pièces en rouge (celles qui perdraient leur dernier appui). */
  flash(pieces: readonly Piece[], durationMs = 1500): void {
    this.flashGroup.clear();
    for (const p of pieces) this.flashGroup.add(this.highlightMesh(p, this.flashMaterial));
    this.flashUntil = performance.now() + durationMs;
  }

  // ----------------------------------------------------------------- boucle de rendu

  setQuality(q: Quality): void {
    this.setGraphics({ ...QUALITY_PRESETS[q], night: this.graphics.night });
  }

  /** La qualité qui correspond aux réglages actuels, ou null s'ils sont personnalisés. */
  get currentQuality(): Quality | null {
    const g = this.graphics;
    for (const q of ['high', 'low'] as Quality[]) {
      const p = QUALITY_PRESETS[q];
      if (p.halo === g.halo && p.shadows === g.shadows && p.sharp === g.sharp) return q;
    }
    return null;
  }

  get currentGraphics(): Graphics {
    return this.graphics;
  }

  setGraphics(g: Graphics): void {
    const before = this.graphics;
    this.graphics = g;
    this.renderer.setPixelRatio(g.sharp ? Math.min(window.devicePixelRatio || 1, 2) : 1);
    const shadows = g.shadows !== 'none';
    this.renderer.shadowMap.enabled = shadows;
    this.renderer.shadowMap.type = g.shadows === 'soft' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.shadowMap.needsUpdate = true;
    this.sun.castShadow = shadows;
    this.table.receiveShadow = shadows;
    // Nuit : ciel et lumières baissés ; les pièces lumineuses éclairent davantage.
    this.scene.background = new THREE.Color(g.night ? '#141a2b' : '#e9ecf1');
    (this.table.material as THREE.MeshStandardMaterial).color.set(g.night ? '#2a3042' : '#dfe3ea');
    this.sun.intensity = g.night ? 0.35 : 2.2;
    this.hemi.intensity = g.night ? 0.16 : 0.5;
    this.fill.intensity = g.night ? 0.12 : 0.75;
    this.scene.environmentIntensity = g.night ? 0.12 : 0.55;
    // Les matériaux dépendent de la nuit (éclat des pièces lumineuses) et de la finesse (givré vrai) : on les refait.
    if (before.night !== g.night || before.sharp !== g.sharp) {
      this.materials.forEach((m) => m.dispose());
      this.materials.clear();
    } else {
      this.materials.forEach((m) => (m.needsUpdate = true));
    }
    if (this.game) this.rebuildPieces();
    this.resize();
  }

  private resize(): void {
    const host = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // En format portrait étroit, on élargit le champ vertical pour que la plaque reste entière.
    this.camera.fov = w / h < 0.8 ? 52 : 38;
    this.camera.updateProjectionMatrix();
  }

  start(): void {
    if (this.running && !this.lost) return;
    this.running = true;
    this.lastTime = 0;
    requestAnimationFrame(this.loop);
  }

  private readonly loop = (time: number): void => {
    if (this.lost) {
      this.running = false;
      return;
    }
    requestAnimationFrame(this.loop);
    if (this.lastTime) {
      this.frameTimes.push(time - this.lastTime);
      if (this.frameTimes.length > 300) this.frameTimes.shift();
    }
    this.lastTime = time;

    if (this.tween) {
      const k = Math.min(1, (performance.now() - this.tween.t0) / this.tween.dur);
      const e = 1 - Math.pow(1 - k, 3);
      this.camera.position.lerpVectors(this.tween.fromPos, this.tween.toPos, e);
      this.controls.target.lerpVectors(this.tween.fromTarget, this.tween.toTarget, e);
      if (k >= 1) this.tween = null;
    }
    if (this.orbit) {
      const o = this.orbit;
      const k = Math.min(1, (performance.now() - o.t0) / o.dur);
      const e = 1 - Math.pow(1 - k, 3);
      o.done = o.angle * e;
      const offset = o.base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), o.done);
      this.camera.position.copy(this.controls.target).add(offset);
      if (k >= 1) this.orbit = null;
    }
    this.controls.update();

    const now = performance.now();
    this.ghostMaterial.opacity = 0.55 + 0.08 * Math.sin(now / 220);
    this.ghostTireMaterial.opacity = this.ghostMaterial.opacity;
    for (const m of this.ghostColorMaterials.values()) m.opacity = this.ghostMaterial.opacity;
    if (this.flashGroup.children.length > 0) {
      if (now > this.flashUntil) this.flashGroup.clear();
      else this.flashGroup.visible = Math.floor(now / 160) % 2 === 0;
    }
    this.renderer.render(this.scene, this.camera);
  };

  frameStats(): FrameStats {
    const t = this.frameTimes;
    if (t.length === 0) return { frames: 0, fps: 0, p99Ms: 0 };
    const mean = t.reduce((a, b) => a + b, 0) / t.length;
    const sorted = [...t].sort((a, b) => a - b);
    const p99 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))]!;
    return { frames: t.length, fps: 1000 / mean, p99Ms: p99 };
  }

  resetFrameStats(): void {
    this.frameTimes = [];
  }

  /** Vignette (JPEG) de la vue actuelle, sans le fantôme ni les surbrillances. */
  captureThumbnail(width = 240, height = 160): string | undefined {
    try {
      const ghostWas = this.ghostGroup.visible;
      const highlightWas = this.highlightGroup.visible;
      this.ghostGroup.visible = false;
      this.highlightGroup.visible = false;
      this.renderer.render(this.scene, this.camera);
      const src = this.canvas;
      const out = document.createElement('canvas');
      out.width = width;
      out.height = height;
      const ctx = out.getContext('2d');
      let url: string | undefined;
      if (ctx && src.width > 0 && src.height > 0) {
        const scale = Math.max(width / src.width, height / src.height);
        const dw = src.width * scale;
        const dh = src.height * scale;
        ctx.fillStyle = '#e9ecf1';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(src, (width - dw) / 2, (height - dh) / 2, dw, dh);
        url = out.toDataURL('image/jpeg', 0.7);
      }
      this.ghostGroup.visible = ghostWas;
      this.highlightGroup.visible = highlightWas;
      return url;
    } catch {
      return undefined;
    }
  }

  /** Simule une perte du contexte WebGL (test de récupération). */
  simulateContextLoss(): void {
    const gl = this.renderer.getContext();
    const ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) return;
    ext.loseContext();
    window.setTimeout(() => ext.restoreContext(), 600);
  }
}

/** Tache lumineuse ronde et douce (dégradé radial), teintée par la couleur de chaque halo. */
function haloTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Opacité du halo : plein la nuit ; de jour, un halo clair sur un fond clair délave l'image, on l'atténue selon la clarté. */
function haloOpacity(hex: string, night: boolean): number {
  if (night) return 0.95;
  const c = new THREE.Color(hex);
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return 0.6 * (1 - 0.65 * l);
}

/** Couleur affichée d'une plaque de base. */
function baseColorHex(id: string): string {
  const palette: Record<string, string> = { vert: '#4c9a5f', gris: '#9aa0a6', bleu: '#5b86c7', sable: '#d9c7a0' };
  return palette[id] ?? '#4c9a5f';
}

/** Pastille ronde bleue marquée d'un « + » blanc. */
function plusTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#2f6fd1';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(size / 2 - 9, size * 0.24, 18, size * 0.52);
  ctx.fillRect(size * 0.24, size / 2 - 9, size * 0.52, 18);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
