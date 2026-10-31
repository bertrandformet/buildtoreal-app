import * as THREE from 'three';
import { GLASS_OPACITY, colorHex, finishOf } from '../core/catalogue';

/** Luminance relative approximative (0 = noir, 1 = blanc) d'une couleur sRGB. */
function luminance(hex: string): number {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/**
 * Matériau « plastique » d'une brique. Les teintes sombres (noir, anthracite, bleu marine…) absorbent la lumière et
 * perdent leurs tenons : on leur ajoute un vernis brillant, qui accroche des reflets sur les arêtes et les tenons.
 */
export function plasticMaterial(hex: string): THREE.MeshStandardMaterial {
  if (luminance(hex) < 0.13) {
    return new THREE.MeshPhysicalMaterial({
      color: hex,
      roughness: 0.4,
      clearcoat: 0.9,
      clearcoatRoughness: 0.14,
      envMapIntensity: 1.5,
    });
  }
  if (luminance(hex) > 0.75) {
    // Les teintes très claires (blanc) saturent sous le soleil : tenons et arêtes s'effacent. On assombrit un peu la matière
    // (la pastille du tiroir garde la vraie couleur) pour que les ombres se lisent.
    return new THREE.MeshStandardMaterial({ color: new THREE.Color(hex).multiplyScalar(LIGHT_TINT), roughness: 0.5, metalness: 0 });
  }
  return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.36, metalness: 0 });
}

/** Facteur appliqué aux teintes très claires (voir `plasticMaterial`). */
const LIGHT_TINT = 0.7;

/** Matériau d'une pièce transparente : teinté, brillant, translucide. Il n'écrit pas la profondeur : on voit à travers. */
export function glassMaterial(hex: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.12, metalness: 0, transparent: true, opacity: GLASS_OPACITY, depthWrite: false });
}

/**
 * Matériau d'une pièce givrée : translucide et dépolie. `real` : vraie transmission de la lumière (on devine, flou, ce qui est
 * derrière ; plus coûteux) ; sinon un voile laiteux semi-transparent, léger pour les petits appareils et la notice.
 */
export function frostMaterial(hex: string, real: boolean): THREE.MeshStandardMaterial {
  if (real) {
    return new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.55, metalness: 0, transmission: 1, thickness: 0.8, ior: 1.45 });
  }
  const milky = new THREE.Color(hex).lerp(new THREE.Color(0xffffff), 0.35);
  return new THREE.MeshStandardMaterial({ color: milky, roughness: 0.85, metalness: 0, transparent: true, opacity: 0.8, depthWrite: false });
}

/**
 * Matériau d'une pièce lumineuse. Allumée, elle émet sa couleur (davantage la nuit) ; éteinte, elle ressemble à une ampoule
 * éteinte : sa couleur, éclaircie et un peu laiteuse.
 */
export function glowMaterial(hex: string, lit: boolean, night: boolean): THREE.MeshStandardMaterial {
  if (lit) {
    if (night) return new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 1.35, roughness: 0.3, metalness: 0 });
    // De jour, une teinte claire qui émet à plein devient un blanc uni, sans tenons ni arêtes, perdu sur le fond clair :
    // plus la teinte est claire, moins elle émet, et elle s'assombrit comme le blanc opaque pour garder son relief.
    const l = luminance(hex);
    const body = l > 0.75 ? new THREE.Color(hex).multiplyScalar(LIGHT_TINT) : new THREE.Color(hex);
    return new THREE.MeshStandardMaterial({ color: body, emissive: hex, emissiveIntensity: 0.8 * (1 - 0.75 * l), roughness: 0.3, metalness: 0 });
  }
  const pale = new THREE.Color(hex).lerp(new THREE.Color(0xffffff), 0.3);
  return new THREE.MeshStandardMaterial({ color: pale, roughness: 0.22, metalness: 0, transparent: true, opacity: 0.88 });
}

export interface MaterialOptions {
  /** Pièce lumineuse allumée (par défaut : oui). */
  readonly lit?: boolean;
  /** Givré à vraie transmission (par défaut : non, voile léger). */
  readonly frostReal?: boolean;
  readonly night?: boolean;
}

/** Matériau d'une pièce selon son identifiant de couleur et sa finition. */
export function pieceMaterial(colorId: string, opts: MaterialOptions = {}): THREE.MeshStandardMaterial {
  const hex = colorHex(colorId);
  switch (finishOf(colorId)) {
    case 'clear':
      return glassMaterial(hex);
    case 'frost':
      return frostMaterial(hex, opts.frostReal ?? false);
    case 'glow':
      return glowMaterial(hex, opts.lit ?? true, opts.night ?? false);
    default:
      return plasticMaterial(hex);
  }
}

/** Lumière d'appoint, sans ombre, du côté opposé au soleil : garde de la forme aux faces sombres. */
export function addFillLight(scene: THREE.Scene): THREE.DirectionalLight {
  const fill = new THREE.DirectionalLight(0xffffff, 0.75);
  fill.position.set(-30, 18, -22);
  scene.add(fill);
  return fill;
}
