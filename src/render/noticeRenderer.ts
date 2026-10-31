// Rendu des images de la notice, sur un moteur dédié (hors de la scène interactive).
// Pour chaque étape : on essaie les 4 vues isométriques et on garde celle qui montre le plus les pièces nouvelles.
// Si ces pièces restent en grande partie cachées, les pièces gênantes sont rendues semi-transparentes.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { accentColor, colorHex, isTranslucent } from '../core/catalogue';
import type { BasePlate } from '../core/model';
import type { NoticePiece } from '../core/notice';
import { addFillLight, pieceMaterial } from './materials';
import { PLATE_H, STUD_H, STUD_R, pieceGeometry, pieceSize } from './pieceGeometry';

const AZIMUTHS_DEG = [45, 315, 135, 225];
const ELEVATION = THREE.MathUtils.degToRad(33);
const FOV = 26;
const MASK_W = 160;
/** Épaisseur du contour des pièces nouvelles, en unités du monde (1 = un tenon). */
const OUTLINE = 0.03;
/** En dessous de cette part visible, les pièces gênantes deviennent semi-transparentes. */
const MIN_VISIBLE_RATIO = 0.55;

export class NoticeRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly maskTarget: THREE.WebGLRenderTarget;
  private readonly maskWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private readonly maskBlack = new THREE.MeshBasicMaterial({ color: 0x000000 });
  private readonly outlineMat = new THREE.MeshBasicMaterial({ color: 0x15171c, side: THREE.BackSide });
  private readonly bright = new Map<string, THREE.MeshStandardMaterial>();
  private readonly muted = new Map<string, THREE.MeshStandardMaterial>();
  private readonly faded = new Map<string, THREE.MeshStandardMaterial>();
  private content = new THREE.Group();

  constructor(width = 960, height = 680) {
    const canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.renderer.setClearColor(0xffffff, 1);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.6;
    pmrem.dispose();
    this.scene.background = new THREE.Color(0xffffff);
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(30, 60, 20);
    this.scene.add(sun, new THREE.HemisphereLight(0xffffff, 0xc4cad4, 0.55));
    addFillLight(this.scene);
    this.scene.add(this.content);

    this.camera = new THREE.PerspectiveCamera(FOV, width / height, 0.5, 600);
    this.maskTarget = new THREE.WebGLRenderTarget(MASK_W, Math.round((MASK_W * height) / width));
  }

  dispose(): void {
    this.maskTarget.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private material(map: Map<string, THREE.MeshStandardMaterial>, color: string, make: (c: string) => THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
    let m = map.get(color);
    if (!m) {
      m = make(color);
      map.set(color, m);
    }
    return m;
  }

  private brightMat(color: string): THREE.MeshStandardMaterial {
    return this.material(this.bright, color, (c) => pieceMaterial(c));
  }

  /** Pièces déjà posées : teintes adoucies, pour que les pièces nouvelles ressortent. */
  private mutedMat(color: string): THREE.MeshStandardMaterial {
    return this.material(this.muted, color, (c) => {
      // Une pièce transparente déjà posée reste transparente, plus pâle encore.
      if (isTranslucent(c)) return new THREE.MeshStandardMaterial({ color: colorHex(c), roughness: 0.3, transparent: true, opacity: 0.3, depthWrite: false });
      const col = new THREE.Color(colorHex(c)).lerp(new THREE.Color(0xd5d9e0), 0.7);
      return new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 });
    });
  }

  private fadedMat(color: string): THREE.MeshStandardMaterial {
    return this.material(this.faded, color, (c) => {
      const col = new THREE.Color(colorHex(c)).lerp(new THREE.Color(0xd5d9e0), 0.7);
      return new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, transparent: true, opacity: 0.3, depthWrite: false });
    });
  }

  /** Matériau(x) d'une pièce pour une variante (vive, adoucie, estompée) : support + pneus noirs pour une pièce à roues. */
  private piecesMat(typeId: string, color: string, variant: (c: string) => THREE.MeshStandardMaterial): THREE.Material | THREE.Material[] {
    const accent = accentColor(typeId);
    return accent ? [variant(color), variant(accent)] : variant(color);
  }

  private clearContent(): void {
    for (const child of [...this.content.children]) {
      this.content.remove(child);
      if (child instanceof THREE.InstancedMesh) child.dispose();
      if ((child instanceof THREE.Mesh || child instanceof THREE.LineSegments) && child.userData['ownGeometry']) child.geometry.dispose();
    }
  }

  /**
   * Produit l'image d'une étape. `previous` : pièces déjà posées, `added` : pièces de l'étape.
   * `fixedAzimuth` impose une vue (couverture) au lieu de chercher la meilleure. `plates` : plaques déjà posées ;
   * `newPlate` : rang de celle qu'on ajoute à cette étape (cerclée de noir).
   */
  renderStep(plates: readonly BasePlate[], previous: readonly NoticePiece[], added: readonly NoticePiece[], fixedAzimuth?: number, newPlate?: number): string {
    this.clearContent();
    const all = [...previous, ...added];

    // Plaque de base : seulement la zone utile, avec une marge d'un tenon.
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    let maxY = 0;
    for (const p of all) {
      const s = pieceSize(p.typeId, p.orient);
      minX = Math.min(minX, p.x);
      minZ = Math.min(minZ, p.z);
      maxX = Math.max(maxX, p.x + s.x);
      maxZ = Math.max(maxZ, p.z + s.z);
      maxY = Math.max(maxY, p.y * PLATE_H + s.y);
    }
    const W = Math.max(...plates.map((p) => p.x + p.w));
    const L = Math.max(...plates.map((p) => p.z + p.l));
    // Une seule plaque : la zone utile autour des pièces. Plusieurs : toutes les plaques posées, en entier.
    const many = plates.length > 1 || all.length === 0;
    const px0 = many ? Math.min(...plates.map((p) => p.x)) : Math.max(0, Math.floor(minX) - 1);
    const pz0 = many ? Math.min(...plates.map((p) => p.z)) : Math.max(0, Math.floor(minZ) - 1);
    const px1 = many ? Math.max(W, Math.ceil(maxX)) : Math.min(W, Math.ceil(maxX) + 1);
    const pz1 = many ? Math.max(L, Math.ceil(maxZ)) : Math.min(L, Math.ceil(maxZ) + 1);

    // Chaque plaque, dans sa couleur, réduite à la zone utile.
    const baseMeshes: THREE.Mesh[] = [];
    for (const plate of plates) {
      const x0 = Math.max(px0, plate.x);
      const z0 = Math.max(pz0, plate.z);
      const x1 = Math.min(px1, plate.x + plate.w);
      const z1 = Math.min(pz1, plate.z + plate.l);
      if (x1 <= x0 || z1 <= z0) continue;
      const pw = x1 - x0;
      const pl = z1 - z0;
      const baseMat = new THREE.MeshStandardMaterial({ color: this.baseHex(plate.color), roughness: 0.5 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(pw, PLATE_H, pl), baseMat);
      box.position.set(x0 + pw / 2, -PLATE_H / 2, z0 + pl / 2);
      box.userData['ownGeometry'] = true;
      this.content.add(box);
      const studs = new THREE.InstancedMesh(new THREE.CylinderGeometry(STUD_R, STUD_R, STUD_H, 14), baseMat, pw * pl);
      const m = new THREE.Matrix4();
      let n = 0;
      for (let x = 0; x < pw; x++) {
        for (let z = 0; z < pl; z++) {
          m.makeTranslation(x0 + x + 0.5, STUD_H / 2 - 0.01, z0 + z + 0.5);
          studs.setMatrixAt(n++, m);
        }
      }
      this.content.add(studs);
      baseMeshes.push(box, studs);
      if (newPlate !== undefined && plate === plates[newPlate]) {
        // Plaque ajoutée à cette étape : un trait noir tout autour, comme une pièce nouvelle.
        const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(pw + 0.06, PLATE_H + 0.06, pl + 0.06));
        const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x15171c }));
        lines.position.copy(box.position);
        lines.userData['ownGeometry'] = true;
        this.content.add(lines);
      }
    }

    const oldMeshes: THREE.Mesh[] = [];
    const newMeshes: THREE.Mesh[] = [];
    const addPiece = (p: NoticePiece, isNew: boolean) => {
      const mesh = new THREE.Mesh(pieceGeometry(p.typeId, p.orient), this.piecesMat(p.typeId, p.color, (c) => (isNew ? this.brightMat(c) : this.mutedMat(c))));
      mesh.position.set(p.x, p.y * PLATE_H, p.z);
      mesh.userData['color'] = p.color;
      mesh.userData['typeId'] = p.typeId;
      mesh.userData['clear'] = isTranslucent(p.color);
      this.content.add(mesh);
      (isNew ? newMeshes : oldMeshes).push(mesh);
      if (isNew) this.content.add(this.outlineOf(p));
    };
    for (const p of previous) addPiece(p, false);
    for (const p of added) addPiece(p, true);

    // Boîte englobante pour le cadrage : pièces et zone de plaque affichée.
    const box = new THREE.Box3(new THREE.Vector3(px0, -PLATE_H, pz0), new THREE.Vector3(px1, maxY, pz1));
    const center = box.getCenter(new THREE.Vector3());
    const corners = this.cornersOf(box);

    // Choix de la vue.
    let azimuth = fixedAzimuth ?? AZIMUTHS_DEG[0]!;
    let ratio = 1;
    if (fixedAzimuth === undefined && newMeshes.length > 0) {
      let bestCount = -1;
      for (const az of AZIMUTHS_DEG) {
        this.placeCamera(center, corners, az);
        const visible = this.maskCount(oldMeshes, newMeshes, baseMeshes, false);
        if (visible > bestCount) {
          bestCount = visible;
          azimuth = az;
        }
      }
      this.placeCamera(center, corners, azimuth);
      const full = this.maskCount(oldMeshes, newMeshes, baseMeshes, true);
      ratio = full > 0 ? bestCount / full : 1;
    }
    this.placeCamera(center, corners, azimuth);

    // Pièces nouvelles trop cachées : on rend les pièces gênantes semi-transparentes.
    if (ratio < MIN_VISIBLE_RATIO) {
      for (const mesh of oldMeshes) mesh.material = this.piecesMat(mesh.userData['typeId'] as string, mesh.userData['color'] as string, (c) => this.fadedMat(c));
    }

    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(0xffffff, 1);
    this.scene.background = new THREE.Color(0xffffff);
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/jpeg', 0.88);
  }

  /** Fin trait noir autour d'une pièce nouvelle (coque inversée, légèrement agrandie) : la repère même en noir et blanc. */
  private outlineOf(p: NoticePiece): THREE.Object3D {
    const e = OUTLINE;
    const size = pieceSize(p.typeId, p.orient);
    if (isTranslucent(p.color)) {
      // Une coque noire se verrait à travers le verre : pour une pièce transparente, on trace les arêtes du bloc.
      const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z));
      edges.translate(size.x / 2, size.y / 2, size.z / 2);
      const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x15171c }));
      lines.position.set(p.x, p.y * PLATE_H, p.z);
      lines.userData['ownGeometry'] = true;
      return lines;
    }
    const mesh = new THREE.Mesh(pieceGeometry(p.typeId, p.orient), this.outlineMat);
    mesh.scale.set((size.x + 2 * e) / size.x, (size.y + 2 * e) / size.y, (size.z + 2 * e) / size.z);
    mesh.position.set(p.x - e, p.y * PLATE_H - e, p.z - e);
    return mesh;
  }

  private baseHex(id: string): string {
    const palette: Record<string, string> = { vert: '#4c9a5f', gris: '#9aa0a6', bleu: '#5b86c7', sable: '#d9c7a0' };
    return palette[id] ?? '#4c9a5f';
  }

  private cornersOf(box: THREE.Box3): THREE.Vector3[] {
    const { min, max } = box;
    const out: THREE.Vector3[] = [];
    for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) out.push(new THREE.Vector3(x, y, z));
    return out;
  }

  /** Place la caméra à l'azimut voulu, assez loin pour que tous les coins de la boîte tiennent dans l'image. */
  private placeCamera(center: THREE.Vector3, corners: readonly THREE.Vector3[], azimuthDeg: number): void {
    const az = THREE.MathUtils.degToRad(azimuthDeg);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(ELEVATION), Math.sin(ELEVATION), Math.cos(az) * Math.cos(ELEVATION));
    let dist = 40;
    for (let i = 0; i < 4; i++) {
      this.camera.position.copy(center).addScaledVector(dir, dist);
      this.camera.lookAt(center);
      this.camera.updateMatrixWorld();
      let worst = 0;
      for (const c of corners) {
        const v = c.clone().project(this.camera);
        worst = Math.max(worst, Math.abs(v.x), Math.abs(v.y));
      }
      dist *= Math.max(0.2, worst / 0.94);
    }
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.camera.lookAt(center);
    this.camera.updateMatrixWorld();
  }

  /**
   * Nombre de pixels des pièces nouvelles visibles dans la vue courante (rendu en masque, basse définition).
   * `isolated` : sans les anciennes pièces ni la plaque, pour connaître la surface qu'elles occuperaient librement.
   */
  private maskCount(oldMeshes: THREE.Mesh[], newMeshes: THREE.Mesh[], baseMeshes: THREE.Mesh[], isolated: boolean): number {
    const saved = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    for (const mesh of oldMeshes) {
      saved.set(mesh, mesh.material);
      mesh.material = this.maskBlack;
      // Une pièce transparente ne cache rien : elle ne compte pas parmi les pièces qui masquent.
      mesh.visible = !isolated && !mesh.userData['clear'];
    }
    for (const mesh of newMeshes) {
      saved.set(mesh, mesh.material);
      mesh.material = this.maskWhite;
    }
    // Les plaques cachent aussi (en noir) ; isolées, on les retire.
    for (const mesh of baseMeshes) {
      saved.set(mesh, mesh.material);
      mesh.material = this.maskBlack;
      mesh.visible = !isolated;
    }
    const prevBackground = this.scene.background;
    this.scene.background = new THREE.Color(0x000000);
    this.renderer.setRenderTarget(this.maskTarget);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.render(this.scene, this.camera);
    const buf = new Uint8Array(this.maskTarget.width * this.maskTarget.height * 4);
    this.renderer.readRenderTargetPixels(this.maskTarget, 0, 0, this.maskTarget.width, this.maskTarget.height, buf);
    this.renderer.setRenderTarget(null);
    this.scene.background = prevBackground;

    for (const [mesh, mat] of saved) {
      mesh.material = mat;
      mesh.visible = true;
    }
    let count = 0;
    for (let i = 0; i < buf.length; i += 4) if (buf[i]! > 200) count++;
    return count;
  }
}
