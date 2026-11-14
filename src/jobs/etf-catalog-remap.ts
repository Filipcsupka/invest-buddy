import pg from "pg";
import { mapFundamentals } from "../../scanner/eodhd-etf-enrich.mjs";
import { refreshShortlist } from "../db/etf-catalog-ingest";

/**
 * Re-applies the EODHD catalog mapping (asset class, region, distribution, TER gap) to rows that are already
 * enriched, using the latest stored etf_fund_stats payload and stored dividends. No vendor calls.
 * Dry run by default; `--apply` writes the changes and rebuilds the shortlist.
 */
type Db = Pick<pg.Pool, "query" | "connect">;
export interface RemapRow {
  listingKey: string; isin: string | null; name: string; symbol: string | null; exchange: string; ucitsHint: boolean | null;
  assetClass: string | null; region: string | null; distribution: string | null; terGap: string | null;
  vendorSymbol: string; general: Record<string, unknown> | null; etfData: Record<string, unknown> | null; dividendHistory: { value: unknown }[];
}
export type RemapField = "assetClass" | "region" | "distribution" | "terGap";
export interface RemapChange { listingKey: string; changes: Partial<Record<RemapField, { from: string | null; to: string | null }>> }

/** New values never erase a stored class, region or payout with null; the TER gap follows the payload. */
export function remapRow(row: RemapRow): RemapChange {
  const mapped = mapFundamentals(row, row.vendorSymbol, { General: row.general ?? {}, ETF_Data: row.etfData ?? {} });
  const next: Record<RemapField, string | null> = {
    assetClass: mapped.assetClass ?? row.assetClass, region: mapped.region ?? row.region,
    distribution: mapped.distribution ?? row.distribution, terGap: row.etfData ? mapped.terGap : row.terGap,
  };
  const changes: RemapChange["changes"] = {};
  for (const field of Object.keys(next) as RemapField[]) if (next[field] !== row[field]) changes[field] = { from: row[field], to: next[field] };
  return { listingKey: row.listingKey, changes };
}

export function parseRemapArgs(args: string[]) {
  const out = { apply: false, limit: null as number | null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--apply") out.apply = true;
    else if (args[i] === "--limit") out.limit = Number(args[++i]);
    else throw new Error("Usage: etf-catalog-remap [--apply] [--limit N]");
  }
  if (out.limit !== null && (!Number.isSafeInteger(out.limit) || out.limit < 1)) throw new Error("--limit needs a positive integer");
  return out;
}

// Both payload shapes: bare ETF_Data (before migration 140) and the full root. Holdings stay in the database.
const PAGE_SQL = `SELECT c.listing_key AS "listingKey",c.isin,c.name,c.mnemonic AS symbol,c.exchange,c.ucits_hint AS "ucitsHint",
    c.asset_class AS "assetClass",c.region,c.distribution,c.ter_gap AS "terGap",f.vendor_symbol AS "vendorSymbol",
    f.payload->'General' AS general,COALESCE(f.payload->'ETF_Data',f.payload)-'Holdings'-'Top_10_Holdings' AS "etfData",
    COALESCE((SELECT json_agg(json_build_object('value',d.amount)) FROM etf_dividends d
      WHERE d.vendor_symbol=f.vendor_symbol AND d.ex_date > f.as_of - 400 AND d.ex_date <= f.as_of),'[]'::json) AS "dividendHistory"
  FROM etf_catalog c
  JOIN LATERAL (SELECT vendor_symbol,as_of,payload FROM etf_fund_stats WHERE listing_key=c.listing_key ORDER BY as_of DESC LIMIT 1) f ON true
  WHERE c.enrichment_status='ok' AND c.enrichment_source='eodhd' AND c.listing_key > $1
  ORDER BY c.listing_key LIMIT $2`;

export async function runCatalogRemap(db: Db, options: { apply: boolean; limit: number | null }, log: (line: string) => void = console.log) {
  const counts = { scanned: 0, changed: 0, assetClass: 0, region: 0, distribution: 0, terGap: 0, shortlist: null as number | null, applied: options.apply };
  let after = "";
  while (options.limit === null || counts.scanned < options.limit) {
    const size = Math.min(200, options.limit === null ? 200 : options.limit - counts.scanned);
    const page = (await db.query<RemapRow>(PAGE_SQL, [after, size])).rows;
    if (!page.length) break;
    for (const row of page) {
      counts.scanned++;
      const { changes } = remapRow(row);
      const fields = Object.keys(changes) as RemapField[];
      if (!fields.length) continue;
      counts.changed++;
      for (const field of fields) counts[field]++;
      if (counts.changed <= 20) log(`${row.listingKey}: ${fields.map((field) => `${field} ${changes[field]!.from ?? "null"} -> ${changes[field]!.to ?? "null"}`).join(", ")}`);
      if (options.apply) await db.query(`UPDATE etf_catalog SET asset_class=$2,region=$3,distribution=$4,ter_gap=$5,updated_at=now()
        WHERE listing_key=$1 AND enrichment_status='ok'`, [row.listingKey,
        changes.assetClass ? changes.assetClass.to : row.assetClass, changes.region ? changes.region.to : row.region,
        changes.distribution ? changes.distribution.to : row.distribution, changes.terGap ? changes.terGap.to : row.terGap]);
    }
    after = page.at(-1)!.listingKey;
  }
  if (options.apply && counts.changed) counts.shortlist = await refreshShortlist(db, new Date().toISOString().slice(0, 10));
  return counts;
}

if (/(?:^|[/\\])etf-catalog-remap\.(?:ts|js)$/.test(process.argv[1] ?? "")) {
  const options = parseRemapArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  runCatalogRemap(db, options).then((counts) => console.log(`etf-catalog-remap: ${JSON.stringify(counts)}${options.apply ? "" : " (dry run)"}`))
    .catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.end());
}
