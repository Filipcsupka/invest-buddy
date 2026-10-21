import type pg from "pg";
import type { CatalogListing } from "../jobs/etf-catalog-data";

export type CatalogDb = Pick<pg.Pool, "query" | "connect">;
export interface Enrichment {
  listingKey: string; isin: string | null; issuer: string | null; assetClass: "equity" | "bond" | "commodity" | "multi_asset" | "other" | null;
  region: string | null; theme: string | null; trackedIndex: string | null; terPct: number | null;
  aumUsdM: number | null; domicile: string | null; replication: string | null;
  distribution: "acc" | "dist" | null; ucits: boolean | null; sourceUrl: string | null;
  source?: "eodhd" | "codex"; holdingsCount?: number | null;
}
export interface ShortlistRow { listing_key: string; mnemonic: string | null; asset_class: string | null; region: string | null; tracked_index: string | null; aum_usd_m: number | null; ter_pct: number | null; distribution: string | null; instrument_type: string; enrichment_status: string; last_seen: string }

export async function upsertCatalog(db: CatalogDb, listings: CatalogListing[], today: string, dryRun = false): Promise<number> {
  if (dryRun) return listings.length;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    for (const row of listings) await client.query(`INSERT INTO etf_catalog
      (listing_key,isin,wkn,mnemonic,name,instrument_type,exchange,listing_region,trading_currency,ucits,first_seen,last_seen)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
      ON CONFLICT (listing_key) DO UPDATE SET wkn=EXCLUDED.wkn,mnemonic=EXCLUDED.mnemonic,name=EXCLUDED.name,
      instrument_type=EXCLUDED.instrument_type,trading_currency=EXCLUDED.trading_currency,
      ucits=CASE WHEN etf_catalog.enrichment_status='ok' THEN etf_catalog.ucits ELSE EXCLUDED.ucits END,
      last_seen=EXCLUDED.last_seen,updated_at=now()`,
      [row.listingKey,row.isin,row.wkn,row.mnemonic,row.name,row.instrumentType,row.exchange,row.listingRegion,row.tradingCurrency,row.ucits,today]);
    await client.query("COMMIT"); return listings.length;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export function enrichmentComplete(row: Enrichment): boolean { return !!row.issuer && !!row.assetClass && row.terPct !== null; }
export async function ingestEnrichment(db: CatalogDb, rows: Enrichment[]): Promise<void> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    for (const row of rows) {
      const ok = enrichmentComplete(row);
      const result = await client.query(`UPDATE etf_catalog SET issuer=$2,asset_class=$3,region=$4,theme=$5,tracked_index=$6,ter_pct=$7,
        aum_usd_m=$8,domicile=$9,replication=$10,distribution=$11,
        ucits=COALESCE($12,ucits),source_url=$13,
        enrichment_status=$14,enrichment_source=$15,holdings_count=$16,
        enrich_attempts=enrich_attempts+CASE WHEN $14 IN ('failed','eodhd_unmapped','eodhd_incomplete') THEN 1 ELSE 0 END,
        enriched_at=CASE WHEN $14='ok' THEN now() ELSE enriched_at END,updated_at=now()
        WHERE listing_key=$1 AND enrichment_status<>'ok' AND enrich_attempts<3 RETURNING listing_key`,
      [row.listingKey,row.issuer,row.assetClass,row.region,row.theme,row.trackedIndex,row.terPct,row.aumUsdM,row.domicile,row.replication,row.distribution,row.ucits,row.sourceUrl,
        ok ? "ok" : row.source === "eodhd" ? row.sourceUrl ? "eodhd_incomplete" : "eodhd_unmapped" : "failed",row.source ?? "codex",row.holdingsCount ?? null]);
      if (!result.rowCount) throw new Error(`ETF catalog row not pending: ${row.listingKey}`);
      if (row.isin) await client.query("UPDATE etf_catalog SET isin=COALESCE(isin,$2) WHERE listing_key=$1", [row.listingKey,row.isin]);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export function rankShortlist(rows: ShortlistRow[], today: string, limit = 150): string[] {
  const cutoff = new Date(`${today}T00:00:00Z`); cutoff.setUTCDate(cutoff.getUTCDate() - 30);
  const eligible = rows.filter((row) => row.enrichment_status === "ok" && ["ETF", "ACTIVE_ETF"].includes(row.instrument_type) && row.last_seen >= cutoff.toISOString().slice(0,10) && /^[A-Z0-9][A-Z0-9.-]{0,11}$/.test(row.mnemonic ?? ""));
  const groups = new Map<string, ShortlistRow[]>();
  for (const row of eligible) { const key = `${row.asset_class ?? "other"}|${row.region ?? "Unknown"}`; groups.set(key, [...(groups.get(key) ?? []), row]); }
  const sort = (a: ShortlistRow, b: ShortlistRow) => {
    const aumA = a.aum_usd_m === null ? -1 : Number(a.aum_usd_m), aumB = b.aum_usd_m === null ? -1 : Number(b.aum_usd_m);
    if (aumA !== aumB) return aumB - aumA;
    const terA = a.ter_pct === null ? Infinity : Number(a.ter_pct), terB = b.ter_pct === null ? Infinity : Number(b.ter_pct);
    if (terA !== terB) return terA - terB;
    return a.listing_key.localeCompare(b.listing_key);
  };
  for (const [key, group] of groups) {
    group.sort(sort);
    // Among share classes tracking the same index, prefer an accumulating class.
    const byIndex = new Map<string, ShortlistRow[]>();
    for (const row of group) { const index = row.tracked_index?.toLowerCase() ?? row.listing_key; byIndex.set(index, [...(byIndex.get(index) ?? []), row]); }
    const winners = [...byIndex.values()].map((items) => items.find((item) => item.distribution === "acc") ?? items[0]);
    const rest = group.filter((item) => !winners.includes(item));
    groups.set(key, [...winners.sort(sort), ...rest.sort(sort)]);
  }
  const ranked: string[] = []; const keys = [...groups.keys()].sort();
  while (ranked.length < limit && keys.some((key) => groups.get(key)?.length)) for (const key of keys) { const row = groups.get(key)?.shift(); if (row) ranked.push(row.listing_key); if (ranked.length === limit) break; }
  return ranked;
}

export async function refreshShortlist(db: CatalogDb, today: string): Promise<number> {
  const rows = await db.query(`SELECT listing_key,mnemonic,asset_class,region,tracked_index,aum_usd_m,ter_pct,distribution,instrument_type,enrichment_status,last_seen::text FROM etf_catalog`);
  const ranked = rankShortlist(rows.rows as ShortlistRow[], today);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE etf_catalog SET shortlist=false,shortlist_rank=NULL WHERE shortlist=true");
    for (const [index, key] of ranked.entries()) await client.query("UPDATE etf_catalog SET shortlist=true,shortlist_rank=$2 WHERE listing_key=$1", [key,index+1]);
    await client.query("COMMIT"); return ranked.length;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function pendingCatalog(db: CatalogDb, limit: number) {
  const result = await db.query(`SELECT c.listing_key AS "listingKey",c.isin,c.name,c.mnemonic AS symbol,c.exchange,c.trading_currency AS "tradingCurrency",s.vendor_symbol AS "vendorSymbol" FROM etf_catalog c
    LEFT JOIN LATERAL (SELECT vendor_symbol FROM symbols WHERE c.isin IS NOT NULL AND isin=c.isin AND NOT delisted
      ORDER BY CASE WHEN exchange='XETRA' THEN 0 WHEN exchange='US' THEN 1 ELSE 2 END, vendor_symbol LIMIT 1) s ON true
    WHERE c.enrichment_status <> 'ok' AND c.enrich_attempts < 3 AND c.last_seen >= CURRENT_DATE - 30
    ORDER BY (CASE WHEN c.name ~* '(\\m[23]x\\M|-1x|leverag|inverse|ultra|short|bear|bull|daily|\\mlev\\M)' THEN -100 ELSE 0 END
      + CASE c.instrument_type WHEN 'ETF' THEN 20 ELSE 0 END
      + CASE WHEN c.name ~* '^(ishares|ishs|vanguard|vang|xtrackers|xtr|spdr|state street|amundi|amu|am-|ais-|invesco|i7-|ubs|lyxor|mul|wisdomtree|witr|vaneck|jpmorgan|jpm|fidelity|schwab|bnp|dws)' THEN 20 ELSE 0 END
      + CASE WHEN c.name ~* '(s&p ?500|s\\+p ?500|msci|world|acwi|nasdaq.?100|n100|stoxx|ftse|total market|emerging|\\mem\\M|europe|dividend|treasury|bond|gold|core)' THEN 15 ELSE 0 END
      + CASE WHEN c.exchange IN ('XETR','NYSEARCA','NASDAQ','NYSE','BATS') THEN 5 ELSE 0 END) DESC,
      c.first_seen,c.listing_key LIMIT $1`, [limit]); return result.rows;
}
export async function shortlistedCatalog(db: CatalogDb) {
  const result = await db.query(`SELECT listing_key AS "listingKey",isin,name,mnemonic AS symbol,exchange,listing_region AS "listingRegion",trading_currency AS "tradingCurrency",issuer,
    asset_class AS "assetClass",region,theme,tracked_index AS "trackedIndex",ter_pct AS "terPct",aum_usd_m AS "aumUsdM",
    domicile,replication,distribution,source_url AS "sourceUrl" FROM etf_catalog WHERE shortlist=true ORDER BY shortlist_rank`);
  return result.rows;
}
