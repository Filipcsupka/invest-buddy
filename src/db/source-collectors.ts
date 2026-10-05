import type pg from "pg";

export interface CusipEntry { cusip: string; symbol: string | null; figi: string | null; name: string | null; resolvedAt: string }
/** Lookups that found no universe ticker are re-checked after this many days. */
export const NEGATIVE_CACHE_DAYS = 30;
export interface CusipStore {
  get(cusips: string[]): Promise<Map<string, CusipEntry>>;
  put(entry: Omit<CusipEntry, "resolvedAt">): Promise<void>;
}

export const cusipIsFresh = (entry: CusipEntry, now: Date) =>
  entry.symbol !== null || now.getTime() - Date.parse(entry.resolvedAt) < NEGATIVE_CACHE_DAYS * 86400000;

export class MemoryCusipStore implements CusipStore {
  readonly rows = new Map<string, CusipEntry>();
  constructor(private readonly now: () => Date = () => new Date()) {}
  async get(cusips: string[]) {
    return new Map(cusips.flatMap((cusip) => { const row = this.rows.get(cusip); return row ? [[cusip, row] as const] : []; }));
  }
  async put(entry: Omit<CusipEntry, "resolvedAt">) { this.rows.set(entry.cusip, { ...entry, resolvedAt: this.now().toISOString() }); }
}

export class PostgresCusipStore implements CusipStore {
  constructor(private readonly pool: pg.Pool) {}
  async get(cusips: string[]) {
    if (!cusips.length) return new Map<string, CusipEntry>();
    const result = await this.pool.query<{ cusip: string; symbol: string | null; figi: string | null; name: string | null; resolved_at: Date }>(
      "SELECT cusip,symbol,figi,name,resolved_at FROM cusip_map WHERE cusip = ANY($1::text[])", [cusips]);
    return new Map(result.rows.map((row) => [row.cusip, { cusip: row.cusip, symbol: row.symbol, figi: row.figi, name: row.name, resolvedAt: row.resolved_at.toISOString() }]));
  }
  async put(entry: Omit<CusipEntry, "resolvedAt">) {
    await this.pool.query(`INSERT INTO cusip_map (cusip,symbol,figi,name) VALUES ($1,$2,$3,$4)
      ON CONFLICT (cusip) DO UPDATE SET symbol=EXCLUDED.symbol,figi=EXCLUDED.figi,name=EXCLUDED.name,resolved_at=now()`,
      [entry.cusip, entry.symbol, entry.figi, entry.name]);
  }
}
