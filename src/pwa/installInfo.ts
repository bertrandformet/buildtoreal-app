// Que proposer pour installer l'application sur cet appareil ? Fonction pure : l'environnement est passé en paramètre.

export type InstallMode =
  /** Déjà lancée comme une application (écran d'accueil). */
  | 'installed'
  /** Le navigateur propose lui-même l'installation (Chrome, Edge, Android) : un bouton suffit. */
  | 'prompt'
  /** iPhone ou iPad : l'installation se fait à la main, par le bouton Partager de Safari. */
  | 'ios'
  /** Autre navigateur : on renvoie vers son menu. */
  | 'other';

export interface InstallEnvironment {
  readonly userAgent: string;
  readonly platform: string;
  readonly maxTouchPoints: number;
  /** `navigator.standalone` (Safari sur iPhone). */
  readonly standalone: boolean;
  /** `matchMedia('(display-mode: standalone)')`. */
  readonly displayStandalone: boolean;
  /** Le navigateur a envoyé `beforeinstallprompt`. */
  readonly hasPrompt: boolean;
}

/** iPhone, iPad, iPod ; un iPad récent se présente comme un Mac mais garde l'écran tactile. */
export function isIos(env: Pick<InstallEnvironment, 'userAgent' | 'platform' | 'maxTouchPoints'>): boolean {
  return /iPhone|iPad|iPod/.test(env.userAgent) || (env.platform === 'MacIntel' && env.maxTouchPoints > 1);
}

export function installMode(env: InstallEnvironment): InstallMode {
  if (env.standalone || env.displayStandalone) return 'installed';
  if (env.hasPrompt) return 'prompt';
  if (isIos(env)) return 'ios';
  return 'other';
}
