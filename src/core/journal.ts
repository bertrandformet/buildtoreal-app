// Journal des poses : mesure objective du critère d'ergonomie du prototype A.
// « Pose ratée » = pose refusée, ou annulée dans les 5 secondes qui suivent.

export const UNDO_GRACE_MS = 5000;

export type JournalKind = 'place' | 'refused' | 'undo' | 'redo' | 'remove' | 'remove_refused' | 'move' | 'move_refused';

export interface JournalEvent {
  readonly t: number;
  readonly kind: JournalKind;
  readonly pieceId?: number;
  readonly reason?: string;
}

export interface JournalStats {
  /** Tentatives de pose : acceptées + refusées. */
  readonly attempts: number;
  readonly accepted: number;
  readonly refused: number;
  /** Poses acceptées puis annulées dans le délai de grâce. */
  readonly undoneQuickly: number;
  readonly missed: number;
  /** Part de poses ratées, entre 0 et 1 (0 s'il n'y a eu aucune tentative). */
  readonly missRate: number;
  readonly durationMs: number;
}

export class Journal {
  private events: JournalEvent[] = [];
  private readonly now: () => number;

  constructor(now: () => number) {
    this.now = now;
  }

  record(kind: JournalKind, pieceId?: number, reason?: string): void {
    this.events.push({ t: this.now(), kind, pieceId, reason });
  }

  list(): readonly JournalEvent[] {
    return this.events;
  }

  clear(): void {
    this.events = [];
  }

  stats(): JournalStats {
    const accepted = this.events.filter((e) => e.kind === 'place').length;
    const refused = this.events.filter((e) => e.kind === 'refused').length;
    const placedAt = new Map<number, number>();
    const quickly = new Set<number>();
    for (const e of this.events) {
      if (e.kind === 'place' && e.pieceId !== undefined) placedAt.set(e.pieceId, e.t);
      if (e.kind === 'undo' && e.pieceId !== undefined) {
        const t0 = placedAt.get(e.pieceId);
        if (t0 !== undefined && e.t - t0 <= UNDO_GRACE_MS) quickly.add(e.pieceId);
      }
    }
    const attempts = accepted + refused;
    const missed = refused + quickly.size;
    const first = this.events[0]?.t ?? 0;
    const last = this.events[this.events.length - 1]?.t ?? 0;
    return {
      attempts,
      accepted,
      refused,
      undoneQuickly: quickly.size,
      missed,
      missRate: attempts === 0 ? 0 : missed / attempts,
      durationMs: last - first,
    };
  }
}
