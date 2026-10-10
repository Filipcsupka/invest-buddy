import type pg from "pg";

export type DeliveryKey = { channel: "telegram"; target: string; asOf: string; kind: string };

export interface DeliveryLog {
  /** Records the delivery before sending. Returns false when it was already recorded. */
  claim(key: DeliveryKey, itemCount: number): Promise<boolean>;
  /** Removes a claim after a failed send, so the next run retries. */
  release(key: DeliveryKey): Promise<void>;
}

export class PostgresDeliveryLog implements DeliveryLog {
  constructor(private readonly pool: Pick<pg.Pool, "query">) {}

  async claim(key: DeliveryKey, itemCount: number): Promise<boolean> {
    const result = await this.pool.query(
      "INSERT INTO notification_deliveries (channel, target, as_of, kind, item_count) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING RETURNING 1",
      [key.channel, key.target, key.asOf, key.kind, itemCount],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async release(key: DeliveryKey): Promise<void> {
    await this.pool.query("DELETE FROM notification_deliveries WHERE channel = $1 AND target = $2 AND as_of = $3 AND kind = $4", [key.channel, key.target, key.asOf, key.kind]);
  }
}

export class MemoryDeliveryLog implements DeliveryLog {
  readonly keys = new Set<string>();
  private id(key: DeliveryKey) { return [key.channel, key.target, key.asOf, key.kind].join("|"); }
  async claim(key: DeliveryKey): Promise<boolean> {
    const id = this.id(key);
    if (this.keys.has(id)) return false;
    this.keys.add(id);
    return true;
  }
  async release(key: DeliveryKey): Promise<void> { this.keys.delete(this.id(key)); }
}
