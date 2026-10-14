import type pg from "pg";

export const SUPPRESS_HOURS = 23;

export interface AlertStateStore {
  /** True when the key may be sent now: never sent, or last sent at least 23 hours ago. Records the send time. */
  claim(key: string, subject: string, now: Date): Promise<{ claimed: boolean; previous: Date | null }>;
  /** Puts back the state before a claim, after a send failed, so the next run tries again. */
  release(key: string, previous: Date | null): Promise<void>;
}

export class PgAlertState implements AlertStateStore {
  constructor(private readonly pool: Pick<pg.Pool, "query">) {}

  async claim(key: string, subject: string, now: Date) {
    const before = await this.pool.query<{ last_sent_at: Date }>("SELECT last_sent_at FROM alert_state WHERE alert_key = $1", [key]);
    const previous = before.rows[0]?.last_sent_at ?? null;
    const result = await this.pool.query(
      `INSERT INTO alert_state (alert_key, last_sent_at, last_subject) VALUES ($1, $2, $3)
       ON CONFLICT (alert_key) DO UPDATE SET last_sent_at = EXCLUDED.last_sent_at, last_subject = EXCLUDED.last_subject
       WHERE alert_state.last_sent_at <= $2::timestamptz - make_interval(hours => $4)
       RETURNING 1`, [key, now, subject, SUPPRESS_HOURS]);
    return { claimed: (result.rowCount ?? 0) > 0, previous };
  }

  async release(key: string, previous: Date | null) {
    if (previous) await this.pool.query("UPDATE alert_state SET last_sent_at = $2 WHERE alert_key = $1", [key, previous]);
    else await this.pool.query("DELETE FROM alert_state WHERE alert_key = $1", [key]);
  }
}

/** For tests. */
export class MemoryAlertState implements AlertStateStore {
  readonly sent = new Map<string, Date>();
  async claim(key: string, _subject: string, now: Date) {
    const previous = this.sent.get(key) ?? null;
    if (previous && now.getTime() - previous.getTime() < SUPPRESS_HOURS * 3_600_000) return { claimed: false, previous };
    this.sent.set(key, now);
    return { claimed: true, previous };
  }
  async release(key: string, previous: Date | null) { if (previous) this.sent.set(key, previous); else this.sent.delete(key); }
}
