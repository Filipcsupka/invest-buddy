import pg from "pg";
import universe from "../../scanner/universe.json";

export interface ChangedRow { symbol: string; reason: string; fact_key?: string | null; value?: unknown }
/** A price move or volume spike worth a new look. Daily facts under these are noise: collect writes a new row for every ticker every trading day. */
export const PRICE_MOVE_PERCENT = 5;
export const VOLUME_RATIO = 2;
/** Reason for a new fact, or null when the fact is not a change. insider_net_buy_90d is left out: a new Form 4 already shows up as a new document. */
export function materialFactReason(key: string | null | undefined, value: unknown): string | null {
  const v = (value ?? {}) as { percent?: unknown; ratio?: unknown };
  if (key === "latest_earnings_8k") return "new earnings 8-K";
  if (key === "price_move_5d" && typeof v.percent === "number" && Math.abs(v.percent) >= PRICE_MOVE_PERCENT) return `price move ${v.percent.toFixed(1)}% over 5 days`;
  if (key === "volume_ratio_20d" && typeof v.ratio === "number" && v.ratio >= VOLUME_RATIO) return `volume ${v.ratio.toFixed(1)}x 20-day average`;
  return null;
}
export function detectSymbols(rows: ChangedRow[], order: string[], max?: number) {
  const reasons: Record<string, string[]> = {};
  for (const row of rows) {
    const reason = row.reason === "new fact" ? materialFactReason(row.fact_key, row.value) : row.reason;
    if (reason) (reasons[row.symbol] ??= []).push(reason);
  }
  const symbols = order.filter((symbol) => reasons[symbol]).slice(0, max);
  return { symbols, reasons: Object.fromEntries(symbols.map((symbol) => [symbol, [...new Set(reasons[symbol])]])) };
}
/** Flags and the value after --since/--max only. A missing flag must not make argument 0 look like its value. */
export function validDetectArgs(args: string[]): boolean {
  const sinceIndex = args.indexOf("--since"), maxIndex = args.indexOf("--max");
  const since = sinceIndex < 0 ? undefined : args[sinceIndex + 1];
  const max = maxIndex < 0 ? undefined : Number(args[maxIndex + 1]);
  if (sinceIndex >= 0 && (!since || !/^\d{4}-\d{2}-\d{2}$/.test(since))) return false;
  if (maxIndex >= 0 && (!Number.isInteger(max) || max! < 1)) return false;
  const values = new Set([sinceIndex >= 0 ? sinceIndex + 1 : -1, maxIndex >= 0 ? maxIndex + 1 : -1]);
  return args.every((arg, i) => values.has(i) || ["--since", "--max", "--force-all"].includes(arg));
}
async function main() {
  const args = process.argv.slice(2);
  const sinceIndex = args.indexOf("--since"), maxIndex = args.indexOf("--max");
  const since = sinceIndex < 0 ? undefined : args[sinceIndex + 1];
  const max = maxIndex < 0 ? undefined : Number(args[maxIndex + 1]);
  if (!validDetectArgs(args)) throw new Error("Usage: detect [--since YYYY-MM-DD] [--max N] [--force-all]");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const order = (universe.instruments as { symbol: string }[]).map((item) => item.symbol);
  if (args.includes("--force-all")) {
    const result = detectSymbols(order.map((symbol) => ({ symbol, reason: "force-all" })), order, max);
    process.stdout.write(`${JSON.stringify({ asOf: new Date().toISOString().slice(0, 10), ...result })}\n`);
    return;
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query<ChangedRow>(`WITH last_scan AS (
      SELECT symbol,max(received_at) AS scanned_at FROM scan_findings WHERE superseded_by IS NULL GROUP BY symbol
    )
    SELECT i.ticker AS symbol, 'never scanned' AS reason, NULL::text AS fact_key, NULL::jsonb AS value FROM instruments i LEFT JOIN last_scan s ON s.symbol=i.ticker
      WHERE i.source <> 'benchmark' AND s.scanned_at IS NULL
    UNION ALL
    SELECT s.symbol,'new document',NULL::text,NULL::jsonb FROM source_documents d JOIN last_scan s
      ON s.symbol=d.symbol OR (d.source='rss' AND d.meta->'symbols' ? s.symbol)
      WHERE d.fetched_at > s.scanned_at AND ($1::date IS NULL OR d.published_at >= $1::date)
    UNION ALL
    SELECT f.symbol,'new fact',f.fact_key,f.value FROM collected_facts f JOIN last_scan s ON s.symbol=f.symbol
      WHERE f.fact_key IN ('latest_earnings_8k','price_move_5d','volume_ratio_20d') AND f.computed_at > s.scanned_at AND ($1::date IS NULL OR f.as_of >= $1::date)`, [since ?? null]);
    process.stdout.write(`${JSON.stringify({ asOf: new Date().toISOString().slice(0, 10), ...detectSymbols(result.rows, order, max) })}\n`);
  } finally { await pool.end(); }
}
if (/(?:^|[/\\])detect\.(?:ts|js)$/.test(process.argv[1] ?? "")) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
