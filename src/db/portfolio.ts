import pg from "pg";
import type { PortfolioSnapshot } from "../portfolio/model";

export interface PortfolioRepository {
  save(snapshot: PortfolioSnapshot): Promise<void>;
  latestPublished(today: string): Promise<PortfolioSnapshot | null>;
}

export class MemoryPortfolioRepository implements PortfolioRepository {
  private readonly snapshots = new Map<string, PortfolioSnapshot>();
  async save(snapshot: PortfolioSnapshot) { this.snapshots.set(snapshot.asOf, structuredClone(snapshot)); }
  async latestPublished(today: string) {
    const snapshot = [...this.snapshots.values()].filter((item) => item.publishOn <= today).sort((a, b) => b.asOf.localeCompare(a.asOf))[0];
    return snapshot ? structuredClone(snapshot) : null;
  }
}

export class PostgresPortfolioRepository implements PortfolioRepository {
  constructor(private readonly pool: pg.Pool) {}
  async save(snapshot: PortfolioSnapshot) {
    await this.pool.query("INSERT INTO portfolio_snapshots (as_of, publish_on, snapshot) VALUES ($1,$2,$3::jsonb) ON CONFLICT (as_of) DO UPDATE SET publish_on=EXCLUDED.publish_on, snapshot=EXCLUDED.snapshot", [snapshot.asOf, snapshot.publishOn, JSON.stringify(snapshot)]);
  }
  async latestPublished(today: string) {
    const result = await this.pool.query<{ snapshot: PortfolioSnapshot }>("SELECT snapshot FROM portfolio_snapshots WHERE publish_on <= $1 ORDER BY as_of DESC LIMIT 1", [today]);
    return result.rows[0]?.snapshot ?? null;
  }
}
