import type pg from "pg";

export interface UniverseInstrument { symbol: string; name: string; sector: string; tier: number | null }

/** The instruments table is the editable runtime universe; benchmarks are excluded. */
export async function loadUniverse(db: Pick<pg.Pool, "query">): Promise<UniverseInstrument[]> {
  const result = await db.query<{ ticker: string; name: string; sector: string; tier: number | null }>(
    "SELECT ticker,name,sector,tier FROM instruments WHERE source <> 'benchmark' ORDER BY ticker",
  );
  return result.rows.map((row) => ({ symbol: row.ticker, name: row.name, sector: row.sector, tier: row.tier }));
}

/** True when the ticker is in the editable instruments table (benchmarks excluded). */
export async function isKnownInstrument(db: Pick<pg.Pool, "query">, symbol: string): Promise<boolean> {
  const result = await db.query("SELECT 1 FROM instruments WHERE ticker=$1 AND source <> 'benchmark' LIMIT 1", [symbol]);
  return (result.rowCount ?? 0) > 0;
}
