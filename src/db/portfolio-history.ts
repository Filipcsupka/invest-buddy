import type pg from "pg";
import type { NavPoint } from "../portfolio/history";

/** Private NAV history. Raw rows stay server-side: the page only receives indexed series built from them. */
export interface NavHistoryRepository {
  upsert(points: NavPoint[]): Promise<number>;
  all(): Promise<NavPoint[]>;
}

/** A per-day row replaces anything; a summary row never overwrites a per-day row. */
const mayReplace = (old: NavPoint | undefined, next: NavPoint) => !old || old.source !== "flex-daily" || next.source === "flex-daily";

export class MemoryNavHistoryRepository implements NavHistoryRepository {
  private readonly rows = new Map<string, NavPoint>();
  async upsert(points: NavPoint[]) {
    let n = 0;
    for (const point of points) if (mayReplace(this.rows.get(point.date), point)) { this.rows.set(point.date, { ...point }); n++; }
    return n;
  }
  async all() { return [...this.rows.values()].sort((a, b) => a.date.localeCompare(b.date)).map((p) => ({ ...p })); }
}

export class PostgresNavHistoryRepository implements NavHistoryRepository {
  constructor(private readonly pool: Pick<pg.Pool, "query">) {}
  async upsert(points: NavPoint[]) {
    if (!points.length) return 0;
    const result = await this.pool.query(
      `INSERT INTO portfolio_nav_history (date, nav_eur, deposits_eur, source)
       SELECT * FROM unnest($1::date[], $2::numeric[], $3::numeric[], $4::text[])
       ON CONFLICT (date) DO UPDATE SET nav_eur=EXCLUDED.nav_eur, deposits_eur=EXCLUDED.deposits_eur, source=EXCLUDED.source, updated_at=now()
       WHERE portfolio_nav_history.source <> 'flex-daily' OR EXCLUDED.source = 'flex-daily'`,
      [points.map((p) => p.date), points.map((p) => p.navEur), points.map((p) => p.depositsEur), points.map((p) => p.source)]);
    return result.rowCount ?? 0;
  }
  async all() {
    const result = await this.pool.query<{ date: string; nav_eur: string; deposits_eur: string; source: NavPoint["source"] }>("SELECT date::text, nav_eur, deposits_eur, source FROM portfolio_nav_history ORDER BY date");
    return result.rows.map((row) => ({ date: row.date, navEur: Number(row.nav_eur), depositsEur: Number(row.deposits_eur), source: row.source }));
  }
}
