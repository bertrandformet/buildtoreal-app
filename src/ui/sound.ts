// Bruitages de pose, synthétisés (aucun fichier audio). Interrupteur mémorisé sur l'appareil.
// Les navigateurs n'autorisent le son qu'après un premier geste de l'utilisateur : `unlock()` est appelé à chaque appui.

export type SoundKind = 'place' | 'remove' | 'refused' | 'step';

const KEY = 'atelier-briques:son';

export class Sound {
  private ctx: AudioContext | null = null;
  enabled = true;

  constructor() {
    try {
      this.enabled = localStorage.getItem(KEY) !== 'off';
    } catch {
      /* stockage indisponible : son activé par défaut */
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      /* préférence non conservée */
    }
    if (on) this.unlock();
  }

  /** À appeler lors d'un geste de l'utilisateur. */
  unlock(): void {
    if (!this.enabled) return;
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  private tone(freq: number, endFreq: number, duration: number, volume: number, type: OscillatorType, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), t0 + duration);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  play(kind: SoundKind): void {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    switch (kind) {
      case 'place': // « clac » d'emboîtement : deux frappes brèves
        this.tone(900, 420, 0.05, 0.22, 'square');
        this.tone(330, 180, 0.09, 0.2, 'triangle', 0.012);
        break;
      case 'remove': // pièce détachée : plus sourd
        this.tone(300, 140, 0.09, 0.2, 'triangle');
        break;
      case 'refused': // refus : deux notes descendantes
        this.tone(260, 220, 0.09, 0.16, 'sawtooth');
        this.tone(200, 160, 0.12, 0.16, 'sawtooth', 0.09);
        break;
      case 'step': // annuler / rétablir : discret
        this.tone(620, 520, 0.035, 0.1, 'sine');
        break;
    }
  }
}
