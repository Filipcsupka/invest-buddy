import pg from "pg";

// Read-only inventory of what the database holds and how big it is.
// Usage: DATABASE_URL=... npm run data:inventory   (JSON first, then a markdown table)
// Every statement is a SELECT, and main() runs them inside a READ ONLY transaction.

export type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

/** Tables the report covers. Names and columns are fixed here, never taken from input. */
export const INVENTORY_TABLES: { table: string; dateColumn: string | null }[] = [
  { table: "instruments", dateColumn: null },
  { table: "daily_bars", dateColumn: "bar_date" },
  { table: "discovery_price_bars", dateColumn: "bar_date" },
  { table: "discovery_candidates", dateColumn: null },
  { table: "filing_watch", dateColumn: "filed_at" },
  { table: "source_documents", dateColumn: "published_at" },
  { table: "collected_facts", dateColumn: "as_of" },
  { table: "raw_snapshots", dateColumn: "fetched_at" },
  { table: "collector_runs", dateColumn: "started_at" },
  { table: "scan_runs", dateColumn: null },
  { table: "scan_findings", dateColumn: null },
  { table: "extraction_runs", dateColumn: "created_at" },
  { table: "score_results", dateColumn: "as_of" },
  { table: "consensus_findings", dateColumn: "as_of" },
  { table: "record_snapshots", dateColumn: "as_of" },
  { table: "record_signals", dateColumn: null },
  { table: "trade_ideas", dateColumn: null },
  { table: "portfolio_nav_history", dateColumn: "date" },
  { table: "cusip_map", dateColumn: null },
];

export type TableRow = { table: string; rows: number; min: string | null; max: string | null; bytes: number };
export type GroupRow = { key: string; documents: number; bodyBytes: number; min: string | null; max: string | null };
export type SnapshotGroup = { source: string; snapshots: number; sizeBytes: number; storedBytes: number; min: string | null; max: string | null };
export type ExpiryRow = { month: string; documents: number; bodyBytes: number };
export type Inventory = {
  generatedAt: string;
  databaseBytes: number;
  tables: TableRow[];
  instrumentsBySource: { source: string; rows: number }[];
  documentsBySource: GroupRow[];
  snapshotsBySource: SnapshotGroup[];
  factsByKey: { key: string; rows: number; min: string | null; max: string | null }[];
  documentExpiry: ExpiryRow[];
  factExpiry: { month: string; rows: number }[];
};

const num = (value: unknown) => Number(value ?? 0);
const str = (value: unknown) => (value == null ? null : String(value));

export async function collectInventory(db: Queryable): Promise<Inventory> {
  const size = await db.query("SELECT pg_database_size(current_database()) AS bytes");
  const tables: TableRow[] = [];
  for (const { table, dateColumn } of INVENTORY_TABLES) {
    // regclass is NULL for a table that does not exist yet, so an older schema still reports.
    const exists = await db.query("SELECT to_regclass($1) IS NOT NULL AS present", [`public.${table}`]);
    if (!exists.rows[0]?.present) continue;
    const range = dateColumn ? `, min(${dateColumn})::text AS min, max(${dateColumn})::text AS max` : ", NULL::text AS min, NULL::text AS max";
    const result = await db.query(`SELECT count(*) AS rows${range}, pg_total_relation_size('public.${table}'::regclass) AS bytes FROM ${table}`);
    const row = result.rows[0] ?? {};
    tables.push({ table, rows: num(row.rows), min: str(row.min), max: str(row.max), bytes: num(row.bytes) });
  }
  const has = (name: string) => tables.some((entry) => entry.table === name);

  const instrumentsBySource = has("instruments")
    ? (await db.query("SELECT source, count(*) AS rows FROM instruments GROUP BY source ORDER BY source")).rows.map((r) => ({ source: String(r.source), rows: num(r.rows) }))
    : [];
  const documentsBySource = has("source_documents")
    ? (await db.query(`SELECT source AS key, count(*) AS documents, coalesce(sum(octet_length(body)),0) AS body_bytes, min(published_at)::text AS min, max(published_at)::text AS max
        FROM source_documents GROUP BY source ORDER BY source`)).rows.map((r) => ({ key: String(r.key), documents: num(r.documents), bodyBytes: num(r.body_bytes), min: str(r.min), max: str(r.max) }))
    : [];
  const factsByKey = has("collected_facts")
    ? (await db.query("SELECT fact_key AS key, count(*) AS rows, min(as_of)::text AS min, max(as_of)::text AS max FROM collected_facts GROUP BY fact_key ORDER BY fact_key")).rows.map((r) => ({ key: String(r.key), rows: num(r.rows), min: str(r.min), max: str(r.max) }))
    : [];
  const snapshotsBySource = has("raw_snapshots")
    ? (await db.query(`SELECT source_id AS source, count(*) AS snapshots, coalesce(sum(size_bytes),0) AS size_bytes, coalesce(sum(octet_length(body)),0) AS stored_bytes, min(fetched_at)::text AS min, max(fetched_at)::text AS max
        FROM raw_snapshots GROUP BY source_id ORDER BY source_id`)).rows.map((r) => ({ source: String(r.source), snapshots: num(r.snapshots), sizeBytes: num(r.size_bytes), storedBytes: num(r.stored_bytes), min: str(r.min), max: str(r.max) }))
    : [];
  const documentExpiry = has("source_documents")
    ? (await db.query(`SELECT to_char(expires_at, 'YYYY-MM') AS month, count(*) AS documents, coalesce(sum(octet_length(body)),0) AS body_bytes
        FROM source_documents GROUP BY 1 ORDER BY 1`)).rows.map((r) => ({ month: String(r.month), documents: num(r.documents), bodyBytes: num(r.body_bytes) }))
    : [];
  const factExpiry = has("collected_facts")
    ? (await db.query("SELECT to_char(expires_at, 'YYYY-MM') AS month, count(*) AS rows FROM collected_facts GROUP BY 1 ORDER BY 1")).rows.map((r) => ({ month: String(r.month), rows: num(r.rows) }))
    : [];

  return { generatedAt: new Date().toISOString(), databaseBytes: num(size.rows[0]?.bytes), tables, instrumentsBySource, documentsBySource, snapshotsBySource, factsByKey, documentExpiry, factExpiry };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

const cell = (value: string | number | null) => (value == null ? "" : String(value));
const table = (head: string[], rows: (string | number | null)[][]) =>
  [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`)].join("\n");

export function inventoryMarkdown(inv: Inventory): string {
  return [
    `Database size: ${formatBytes(inv.databaseBytes)} (${inv.databaseBytes} bytes). Generated ${inv.generatedAt}.`,
    "",
    "### Tables",
    table(["Table", "Rows", "Min", "Max", "Size (with indexes)"], inv.tables.map((t) => [t.table, t.rows, t.min, t.max, formatBytes(t.bytes)])),
    "",
    "### Instruments by source",
    table(["Source", "Rows"], inv.instrumentsBySource.map((r) => [r.source, r.rows])),
    "",
    "### Source documents by source",
    table(["Source", "Documents", "Body bytes", "Min published", "Max published"], inv.documentsBySource.map((r) => [r.key, r.documents, formatBytes(r.bodyBytes), r.min, r.max])),
    "",
    "### Raw snapshots by source (size = uncompressed, stored = gzip)",
    table(["Source", "Snapshots", "Size", "Stored", "Min fetched", "Max fetched"], inv.snapshotsBySource.map((r) => [r.source, r.snapshots, formatBytes(r.sizeBytes), formatBytes(r.storedBytes), r.min, r.max])),
    "",
    "### Collected facts by key",
    table(["Key", "Rows", "Min as_of", "Max as_of"], inv.factsByKey.map((r) => [r.key, r.rows, r.min, r.max])),
    "",
    "### Expiry histogram (by month of expires_at)",
    table(["Month", "Documents", "Body bytes"], inv.documentExpiry.map((r) => [r.month, r.documents, formatBytes(r.bodyBytes)])),
    "",
    table(["Month", "Facts"], inv.factExpiry.map((r) => [r.month, r.rows])),
    "",
  ].join("\n");
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const inventory = await collectInventory(client);
    await client.query("ROLLBACK");
    console.log(JSON.stringify(inventory, null, 2));
    console.log("");
    console.log(inventoryMarkdown(inventory));
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && /data-inventory\.ts$/.test(process.argv[1])) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : "inventory failed"); process.exitCode = 1; });
}
