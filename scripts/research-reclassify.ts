import pg from "pg";
import { CLASS_RANK, classifyHost, displayQuoteAllowed, irDomainsFor } from "../src/research/sources";
import { gradeFinding, type ItemResult } from "../src/research/verify";
import type { SourceClass } from "../src/research/types";

type Evidence = { url: string; sourceName?: string; sourceClassHint?: SourceClass; verify?: Partial<ItemResult> | null };
export interface FindingRow {
  id: number; symbol: string; source_class: SourceClass | null; confirmed: boolean; display_quote: boolean; evidence: Evidence[];
}

const sourceClass = (value: unknown): SourceClass | null =>
  value === "primary" || value === "press" || value === "aggregator" || value === "social" ? value : null;
const stronger = (a: SourceClass | null, b: SourceClass | null): SourceClass | null =>
  !a ? b : !b || CLASS_RANK[a] >= CLASS_RANK[b] ? a : b;

/** Regrade stored verification results without fetching or lowering a source class. */
export function reclassifyFinding(row: FindingRow): { sourceClass: SourceClass | null; confirmed: boolean; displayQuote: boolean; evidence: Evidence[] } | null {
  const irDomains = irDomainsFor(row.symbol);
  const evidence = row.evidence.map(item => {
    if (!item.verify) return item;
    const url = item.verify.canonicalUrl ?? item.url;
    let host = "";
    try { host = new URL(url).hostname; } catch { /* Keep the stored result for malformed URLs. */ }
    const nextClass = stronger(sourceClass(item.verify.sourceClass), host ? classifyHost(host, irDomains) : null)!;
    const displayQuote = !!item.verify.displayQuote || (host ? displayQuoteAllowed(host, nextClass) && item.verify.status === "verified" : false);
    return { ...item, verify: { ...item.verify, sourceClass: nextClass, displayQuote,
      hintMismatch: item.sourceClassHint === undefined ? item.verify.hintMismatch : item.sourceClassHint !== nextClass } };
  });
  const items = evidence.filter(item => item.verify).map(item => ({
    ...item.verify, url: item.url, status: item.verify!.status ?? "fetch_failed", sourceClass: sourceClass(item.verify!.sourceClass) ?? "aggregator",
    displayQuote: !!item.verify!.displayQuote, canonicalUrl: item.verify!.canonicalUrl,
  })) as ItemResult[];
  const grade = items.length ? gradeFinding(items) : null;
  const next = { sourceClass: stronger(row.source_class, grade?.sourceClass ?? null),
    confirmed: row.confirmed || !!grade?.confirmed, displayQuote: row.display_quote || !!grade?.displayQuote, evidence };
  return next.sourceClass !== row.source_class || next.confirmed !== row.confirmed || next.displayQuote !== row.display_quote
    || JSON.stringify(next.evidence) !== JSON.stringify(row.evidence) ? next : null;
}

export async function runResearchReclassify(pool: pg.Pool, apply = false): Promise<void> {
  const db = apply ? await pool.connect() : pool;
  try {
    if (apply) await db.query("BEGIN");
    const rows = (await db.query<FindingRow>(`SELECT id,symbol,source_class,confirmed,display_quote,evidence
      FROM research_findings WHERE verification_status <> 'pending' ORDER BY symbol,id${apply ? " FOR UPDATE" : ""}`)).rows;
    const summaries = new Map<string, { before: Record<string, number>; after: Record<string, number>; confirmed: number; displayQuote: number; changed: number }>();
    for (const row of rows) {
      const next = reclassifyFinding(row);
      const summary = summaries.get(row.symbol) ?? { before: {}, after: {}, confirmed: 0, displayQuote: 0, changed: 0 };
      summary.before[row.source_class ?? "null"] = (summary.before[row.source_class ?? "null"] ?? 0) + 1;
      const after = next?.sourceClass ?? row.source_class ?? "null";
      summary.after[after] = (summary.after[after] ?? 0) + 1;
      if (next) {
        summary.changed++;
        if (!row.confirmed && next.confirmed) summary.confirmed++;
        if (!row.display_quote && next.displayQuote) summary.displayQuote++;
        if (apply) await db.query(`UPDATE research_findings SET source_class=$2,confirmed=$3,display_quote=$4,evidence=$5::jsonb WHERE id=$1`,
          [row.id, next.sourceClass, next.confirmed, next.displayQuote, JSON.stringify(next.evidence)]);
      }
      summaries.set(row.symbol, summary);
    }
    if (apply) await db.query("COMMIT");
    for (const [symbol, summary] of summaries) process.stdout.write(`${apply ? "applied" : "dry-run"} ${symbol}: ${JSON.stringify(summary)}\n`);
    process.stdout.write(`${apply ? "applied" : "dry-run"}: ${rows.length} findings, ${[...summaries.values()].reduce((sum, s) => sum + s.changed, 0)} changed\n`);
  } catch (error) {
    if (apply) await db.query("ROLLBACK");
    throw error;
  } finally { if (apply) (db as pg.PoolClient).release(); }
}

if (/(?:^|[/\\])research-reclassify\.(?:ts|js)$/.test(process.argv[1] ?? "")) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== "--apply")) throw new Error("Usage: npm run research:reclassify [-- --apply]");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  void runResearchReclassify(pool, args.includes("--apply"))
    .catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
}
