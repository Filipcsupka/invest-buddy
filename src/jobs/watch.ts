import { runLoggedJob } from "./job-log";
import pg from "pg";
import { loadUniverse } from "../db/universe";
import { companyCiks } from "../collectors/edgar";
import { getText } from "../collectors/http";
import { requireSecUserAgent } from "../collectors/sec-user-agent";
import { loadStoredCiks, loadVendorSymbols, resolveCik } from "../data/security-master";

export interface WatchedFiling { cik: number; symbol: string; accession: string; form: string; items: string; filedAt: string }
export interface RecentFilings { form: string[]; accessionNumber: string[]; filingDate: string[]; items?: string[] }
export function submissionRows(symbol: string, cik: number, recent: RecentFilings): WatchedFiling[] {
  return recent.form.flatMap((form, i) => /^\d{10}-\d{2}-\d{6}$/.test(recent.accessionNumber[i] ?? "") && /^\d{4}-\d{2}-\d{2}$/.test(recent.filingDate[i] ?? "")
    ? [{ cik, symbol, accession: recent.accessionNumber[i], form, items: recent.items?.[i] ?? "", filedAt: recent.filingDate[i] }] : []);
}

/** Insert-only accession cursor. A repeated poll returns no filings even if SEC retains the same recent list. */
export async function storeWatchRows(db: Pick<pg.Pool, "query">, rows: WatchedFiling[]): Promise<WatchedFiling[]> {
  if (!rows.length) return [];
  const result = await db.query<{ cik: string; accession: string }>(`INSERT INTO filing_watch (cik,symbol,accession,form,items,filed_at)
    SELECT (x->>'cik')::bigint,x->>'symbol',x->>'accession',x->>'form',x->>'items',(x->>'filedAt')::date
    FROM jsonb_array_elements($1::jsonb) x ON CONFLICT (cik,accession) DO NOTHING RETURNING cik,accession`, [JSON.stringify(rows)]);
  const inserted = new Set(result.rows.map((r) => `${r.cik}:${r.accession}`));
  return rows.filter((r) => inserted.has(`${r.cik}:${r.accession}`));
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  requireSecUserAgent(process.env.SEC_USER_AGENT);
  const ciks = await companyCiks();
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let count = 0, missing = 0;
  try {
    const stored = await loadStoredCiks(pool), secSymbols = await loadVendorSymbols(pool, "sec");
    for (const company of await loadUniverse(pool)) {
      const cik = resolveCik(company.symbol, stored, ciks, secSymbols);
      if (!cik) { process.stderr.write(`${company.symbol}: no CIK\n`); missing++; continue; }
      const url = `https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`;
      const json = JSON.parse(await getText(url)) as { filings: { recent: RecentFilings } };
      const added = await storeWatchRows(pool, submissionRows(company.symbol, cik, json.filings.recent));
      count += added.length;
      process.stdout.write(`${company.symbol}: ${added.length ? added.map((r) => `${r.form} ${r.accession}`).join(", ") : "none"}\n`);
    }
  } finally { await pool.end(); }
  process.stdout.write(`watch: ${count} new filings\n`);
  if (missing) process.exitCode = 1;
  return { filings: count, missingCiks: missing, failures: missing };
}
if (/(?:^|[/\\])watch\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("watch", main);
