import type pg from "pg";

export interface UniverseInstrument { symbol: string; name: string; sector: string; tier: number | null }

/** Membership dates are inclusive at the start and exclusive at the end. */
export async function loadUniverse(db: Pick<pg.Pool, "query">, asOf?: string): Promise<UniverseInstrument[]> {
  const result = await db.query<{ ticker: string; name: string; sector: string; tier: number | null }>(
    `SELECT i.ticker,i.name,i.sector,m.tier FROM universe_membership m
     JOIN instruments i ON i.ticker=m.ticker
     WHERE m.list <> 'benchmark' AND m.valid_from <= COALESCE($1::date,CURRENT_DATE)
       AND (m.valid_to IS NULL OR m.valid_to > COALESCE($1::date,CURRENT_DATE)) ORDER BY i.ticker`,
    [asOf ?? null],
  );
  return result.rows.map((row) => ({ symbol: row.ticker, name: row.name, sector: row.sector, tier: row.tier }));
}

/** True when the ticker is currently in the active universe (benchmarks excluded). */
export async function isKnownInstrument(db: Pick<pg.Pool, "query">, symbol: string): Promise<boolean> {
  const result = await db.query("SELECT 1 FROM universe_membership WHERE ticker=$1 AND list <> 'benchmark' AND valid_from <= CURRENT_DATE AND (valid_to IS NULL OR valid_to > CURRENT_DATE) LIMIT 1", [symbol]);
  return (result.rowCount ?? 0) > 0;
}
