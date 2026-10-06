import type pg from "pg";

export interface UniverseInstrument { symbol: string; name: string; sector: string; tier: number | null }

/** The instruments table is the editable runtime universe; benchmarks are excluded. */
export async function loadUniverse(db: Pick<pg.Pool, "query">): Promise<UniverseInstrument[]> {
  const result = await db.query<{ ticker: string; name: string; sector: string; tier: number | null }>(
    "SELECT ticker,name,sector,tier FROM instruments WHERE source <> 'benchmark' ORDER BY ticker",
  );
  return result.rows.map((row) => ({ symbol: row.ticker, name: row.name, sector: row.sector, tier: row.tier }));
}
