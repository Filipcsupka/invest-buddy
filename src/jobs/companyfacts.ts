import pg from "pg";
import { loadUniverse } from "../db/universe";
import { loadStoredCiks, loadVendorSymbols, resolveCik } from "../data/security-master";
import { collectCompanyfacts } from "../collectors/sources/companyfacts";
import { defaultHttp, type SourceHttp } from "../collectors/sources/client";
import { loadTickers } from "../collectors/sources/sec";
import { requireSecUserAgent } from "../collectors/sec-user-agent";
import { PostgresUsageLedger } from "../data/usage";
import { runLoggedJob } from "./job-log";
import type { BackfillJob } from "./backfill";

type Db = Pick<pg.Pool, "query">;
export interface CompanyfactsSubject { ticker: string; cik: number }
export async function companyfactsSubjects(db: Db, http: SourceHttp, only?: string[], watchSince?: string): Promise<CompanyfactsSubject[]> {
  let universe = await loadUniverse(db, undefined, { collect: true });
  if (only) {
    const known = new Set(universe.map((row) => row.symbol));
    const unknown = only.filter((ticker) => !known.has(ticker));
    if (unknown.length) throw new Error(`Unknown universe ticker(s): ${unknown.join(", ")}`);
    universe = universe.filter((row) => only.includes(row.symbol));
  }
  if (watchSince) {
    const watched = await db.query<{ symbol: string }>(`SELECT DISTINCT symbol FROM filing_watch
      WHERE form IN ('10-Q','10-K','10-Q/A','10-K/A') AND filed_at >= $1::date`, [watchSince]);
    const symbols = new Set(watched.rows.map((row) => row.symbol));
    universe = universe.filter((row) => symbols.has(row.symbol));
  }
  const stored = await loadStoredCiks(db);
  const secSymbols = await loadVendorSymbols(db, "sec");
  const tickers = universe.some((row) => !stored.has(row.symbol)) ? (await loadTickers(http)).byTicker : undefined;
  const secCiks = tickers && new Map([...tickers].map(([key, value]) => [key, value.cik]));
  const out = universe.map((row) => ({ ticker: row.symbol, cik: resolveCik(row.symbol, stored, secCiks, secSymbols) }));
  const missing = out.filter((row) => !row.cik).map((row) => row.ticker);
  if (missing.length) throw new Error(`Missing SEC CIK for ${missing.join(", ")}`);
  return out as CompanyfactsSubject[];
}

/** One SEC request per subject, so the generic backfill runner saves completion after each ticker. */
export function createCompanyfactsBackfillJob(db: Db, http: SourceHttp = defaultHttp()): BackfillJob {
  let subjects: CompanyfactsSubject[] | undefined;
  return { name: "companyfacts", source: "sec",
    async subjects() { subjects = await companyfactsSubjects(db, http); return subjects.map((row) => row.ticker); },
    async step(ticker) {
      const row = subjects?.find((entry) => entry.ticker === ticker);
      if (!row) throw new Error(`Unknown companyfacts subject ${ticker}`);
      await collectCompanyfacts(db, http, row.ticker, row.cik);
      return { cursor: { cik: row.cik }, done: true };
    },
  };
}

export function parseCompanyfactsArgs(args: string[]) {
  const options: { dryRun: boolean; only?: string[]; watchSince?: string } = { dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--only") options.only = (args[++i] ?? "").split(",").filter(Boolean);
    else if (arg === "--watch-since") options.watchSince = args[++i];
    else throw new Error(`Unknown companyfacts option ${arg}`);
  }
  if (options.watchSince && !/^\d{4}-\d{2}-\d{2}$/.test(options.watchSince)) throw new Error("--watch-since needs YYYY-MM-DD");
  if (options.only && !options.only.length) throw new Error("--only needs a ticker");
  return options;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  requireSecUserAgent(process.env.SEC_USER_AGENT);
  const options = parseCompanyfactsArgs(process.argv.slice(2));
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const http = defaultHttp();
  const ledger = new PostgresUsageLedger(pool);
  let bytes = 0, facts = 0, inserted = 0, symbols = 0;
  try {
    for (const row of await companyfactsSubjects(pool, http, options.only, options.watchSince)) {
      if (!options.dryRun) await ledger.reserve("sec", 1, { job: "companyfacts" });
      const result = await collectCompanyfacts(pool, http, row.ticker, row.cik, options.dryRun);
      bytes += result.bytes; facts += result.facts; inserted += result.inserted; symbols++;
      process.stdout.write(`${row.ticker}: ${result.bytes} bytes, ${result.facts} facts, ${result.inserted} inserted\n`);
    }
  } finally { await pool.end(); }
  process.stdout.write(`companyfacts: ${symbols} symbols, ${bytes} bytes, ${facts} facts, ${inserted} inserted${options.dryRun ? " (dry run)" : ""}\n`);
  return { symbols, bytes, facts, inserted };
}

if (/(?:^|[/\\])companyfacts\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("companyfacts", main);
