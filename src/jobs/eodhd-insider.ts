import { readFile } from "node:fs/promises";
import pg from "pg";
import { EodhdClient, EodhdHttpError, type Form4Filing, type Form4Page } from "../data-providers/eodhd/client";
import { loadUniverse } from "../db/universe";
import { PostgresCollectorRepository } from "../db/collectors";
import { runLoggedJob } from "./job-log";

const DAY = 86_400_000;
const shift = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const accessionPattern = /^\d{10}-\d{2}-\d{6}$/;
const dateOnly = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
const EMPTY_BACKOFF_DAYS = 30;
const PAGE_BUDGET = 5;
/** vendorEmpty: the last paid refresh found no Form 4 filing in the window (e.g. an ETF without a SEC CIK). */
export interface InsiderSubject { ticker: string; vendorSymbol: string; secCheckedAt: string | null; vendorCheckedAt: string | null; secFailed: boolean; vendorEmpty?: boolean }
export interface InsiderClient { form4(symbol: string, options: { offset: number; limit: number }): Promise<Form4Page>; getCallCosts(): Record<string, number> }

/** The daily SEC collector is primary. A recent successful SEC run makes the paid source unnecessary. */
export function dueForInsiderFallback(subject: InsiderSubject, today: string): boolean {
  const secFresh = subject.secCheckedAt !== null && subject.secCheckedAt >= shift(today, -2) && !subject.secFailed;
  const vendorStale = subject.vendorCheckedAt === null || subject.vendorCheckedAt < shift(today, subject.vendorEmpty ? -EMPTY_BACKOFF_DAYS : -2);
  return !secFresh && vendorStale;
}

export async function loadInsiderSubjects(db: Pick<pg.Pool, "query">, today: string): Promise<InsiderSubject[]> {
  const universe = (await loadUniverse(db, today, { collect: true })).map((row) => row.symbol);
  if (!universe.length) return [];
  const result = await db.query<{ ticker: string; vendor_symbol: string | null; sec_checked_at: string | null; vendor_checked_at: string | null; vendor_empty: boolean | null; sec_failed: boolean }>(`
    SELECT i.ticker, COALESCE(ids.vendor_symbols->>'eodhd', s.vendor_symbol) AS vendor_symbol,
      sr.checked_at::date::text AS sec_checked_at, er.attempted_at::date::text AS vendor_checked_at,
      COALESCE(er.empty, false) AS vendor_empty, false AS sec_failed
    FROM instruments i
    LEFT JOIN instrument_ids ids ON ids.ticker=i.ticker AND ids.valid_to IS NULL
    LEFT JOIN LATERAL (SELECT vendor_symbol FROM symbols WHERE code=i.ticker AND exchange='US' AND NOT delisted LIMIT 1) s ON true
    LEFT JOIN sec_insider_refresh sr ON sr.ticker=i.ticker AND sr.checked_at::date <= $2::date
    LEFT JOIN eodhd_insider_refresh er ON er.ticker=i.ticker
    WHERE i.ticker=ANY($1::text[]) AND (s.vendor_symbol IS NOT NULL OR ids.vendor_symbols->>'eodhd' LIKE '%.US')
    ORDER BY i.ticker`, [universe, today]);
  return result.rows.filter((row) => row.vendor_symbol?.endsWith(".US"))
    .map((row) => ({ ticker: row.ticker, vendorSymbol: row.vendor_symbol!, secCheckedAt: row.sec_checked_at,
      vendorCheckedAt: row.vendor_checked_at, secFailed: row.sec_failed, vendorEmpty: row.vendor_empty === true }));
}

/** Shares held after the trade. Vendor payloads can carry "N/A" or other junk here; that must not fail a symbol that was already billed. */
export function parseSharesAfter(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value);
  return null;
}

/** True when the pages read so far are newest-first and the last filing is already older than the cutoff. Anything else (unsorted, a missing date) is not proof, so paging continues. */
export function ordersOlderThan(pages: Form4Filing[][], cutoff: string): boolean {
  let prev: string | null = null, last: string | null = null;
  for (const page of pages) for (const filing of page) {
    const date = dateOnly(filing.filed_at);
    if (date === null || (prev !== null && date > prev)) return false;
    prev = last = date;
  }
  return last !== null && last < cutoff;
}

export function parseEodhdInsider(filing: Form4Filing, today: string) {
  if (!accessionPattern.test(filing.accession_number)) throw new Error("invalid Form 4 accession");
  const filedAt = dateOnly(filing.filed_at);
  if (!filedAt || filedAt > today) throw new Error("invalid or future Form 4 filing date");
  return (filing.non_derivative ?? []).flatMap((tx, index) => {
    if (tx.transaction_code !== "P" && tx.transaction_code !== "S") return [];
    const date = dateOnly(tx.transaction_date);
    const shares = tx.shares_amount;
    if (!date || date > filedAt || typeof shares !== "number" || !Number.isFinite(shares) || shares <= 0) throw new Error("invalid Form 4 P/S line");
    const price = tx.price_per_share;
    const ownerCik = typeof tx.reporting_owner_cik === "string" && /^\d+$/.test(tx.reporting_owner_cik) ? tx.reporting_owner_cik : null;
    const ownerName = typeof tx.reporting_owner_name === "string" ? tx.reporting_owner_name : null;
    const reportingOwners = [{ cik: ownerCik, name: ownerName, isDirector: tx.is_director ?? null,
      isOfficer: tx.is_officer ?? null, isTenPercentOwner: tx.is_ten_percent_owner ?? null, isOther: null }];
    return [{ lineNo: index + 1, ownerCik, ownerName, reportingOwners, isDirector: tx.is_director ?? null,
      isOfficer: tx.is_officer ?? null, isTenPercentOwner: tx.is_ten_percent_owner ?? null,
      transactionDate: date, code: tx.transaction_code, shares, price: typeof price === "number" && Number.isFinite(price) && price >= 0 ? price : null,
      acquiredDisposed: tx.acquired_or_disposed === "A" || tx.acquired_or_disposed === "D" ? tx.acquired_or_disposed : null,
      sharesAfter: parseSharesAfter(tx.shares_owned_after), filedAt }];
  });
}

export async function runEodhdInsider(db: Pick<pg.Pool, "query"> | null, api: InsiderClient | null,
  options: { dryRun?: boolean; subjects?: InsiderSubject[]; today?: string; maxSymbols?: number; fixture?: boolean } = {}) {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const subjects = options.subjects ?? (db ? await loadInsiderSubjects(db, today) : []);
  const due = subjects.filter((row) => dueForInsiderFallback(row, today));
  const picked = due.slice(0, options.maxSymbols ?? 10);
  if (!api) return { universe: subjects.length, due: due.length, planned: picked.length, estimatedCalls: picked.length * 10, refreshed: 0, rows: 0, failures: [] as string[], incomplete: [] as string[] };
  let refreshed = 0, rows = 0;
  const failures: string[] = [], incomplete: string[] = [];
  const cutoff = shift(today, -90);
  for (const subject of picked) {
    try {
      const pages: Form4Filing[][] = [];
      let complete = false;
      for (let pageNo = 0; pageNo < PAGE_BUDGET && !complete; pageNo++) {
        const page = await api.form4(subject.vendorSymbol, { offset: pageNo * 100, limit: 100 });
        if (!Array.isArray(page.data)) throw new Error("invalid Form 4 page");
        pages.push(page.data);
        // Stop early only when the pages so far prove newest-first order and reach past the window.
        complete = !page.links?.next || ordersOlderThan(pages, cutoff);
      }
      const filings = pages.flat();
      if (!complete) incomplete.push(subject.ticker);
      const parsed = filings.filter((filing) => { const date = dateOnly(filing.filed_at); return date !== null && date >= cutoff && date <= today; })
        .map((filing) => ({ accession: filing.accession_number, lines: parseEodhdInsider(filing, today) }));
      if (db && !options.dryRun) {
        for (const filing of parsed) for (const line of filing.lines) await db.query(`INSERT INTO insider_transactions
          (accession,line_no,ticker,owner_cik,owner_name,reporting_owners,is_director,is_officer,is_ten_percent_owner,is_other,
           transaction_date,code,shares,price,acquired_disposed,derivative,shares_after,filed_at,plan_10b5_1,source_id,display_allowed,first_observed_at)
          SELECT $1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,NULL,$10,$11,$12,$13,$14,false,$15,$16,'unknown','eodhd',false,now()
          WHERE NOT EXISTS (SELECT 1 FROM insider_transactions WHERE accession=$1 AND source_id='sec')
          ON CONFLICT (accession,line_no) DO NOTHING`, [filing.accession,line.lineNo,subject.ticker,line.ownerCik,line.ownerName,
          JSON.stringify(line.reportingOwners),line.isDirector,line.isOfficer,line.isTenPercentOwner,line.transactionDate,line.code,
          line.shares,line.price,line.acquiredDisposed,line.sharesAfter,line.filedAt]);
        // A partial history would understate the 90-day net, so only a complete read feeds the fact.
        if (complete && parsed.some((filing) => filing.lines.length)) {
          const repo = new PostgresCollectorRepository(db as pg.Pool);
          const net = await repo.insiderNetBuy(subject.ticker, today);
          if (net?.sourceId === "eodhd") await repo.upsertFact({ symbol: subject.ticker, key: "insider_net_buy_90d", asOf: today,
            value: { netShares: net.netShares, netDollars: net.netDollars, ...(net.dollarsComplete ? {} : { dollarsComplete: false }) },
            documentIds: [], sourceId: "eodhd" });
        }
        await db.query(`INSERT INTO eodhd_insider_refresh (ticker,attempted_at,empty) VALUES ($1,now(),$2)
          ON CONFLICT (ticker) DO UPDATE SET attempted_at=EXCLUDED.attempted_at, empty=EXCLUDED.empty`, [subject.ticker, complete && !parsed.length]);
      }
      refreshed++;
      rows += parsed.reduce((n, filing) => n + filing.lines.length, 0);
    } catch (error) {
      failures.push(subject.ticker);
      const reason = error instanceof EodhdHttpError ? `HTTP ${error.status}` : error instanceof Error ? error.message : "error";
      process.stderr.write(`${JSON.stringify({ event: "eodhd_insider_symbol_failed", ticker: subject.ticker, reason })}\n`);
      if (error instanceof EodhdHttpError && [401, 402, 403].includes(error.status)) break;
    }
  }
  return { universe: subjects.length, due: due.length, planned: picked.length,
    estimatedCalls: picked.length * 10, refreshed, rows, failures, incomplete, calls: api.getCallCosts()["sec-filings/form4"] ?? 0 };
}

export function parseArgs(args: string[]) {
  const options: { dryRun: boolean; maxSymbols: number; fixturePath?: string; today?: string } = { dryRun: false, maxSymbols: 10 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") options.dryRun = true;
    else if (args[i] === "--fixture") options.fixturePath = args[++i];
    else if (args[i] === "--max-symbols") options.maxSymbols = Number(args[++i]);
    else if (args[i] === "--as-of") options.today = args[++i];
    else throw new Error(`Unknown EODHD insider option ${args[i]}`);
  }
  if (!Number.isInteger(options.maxSymbols) || options.maxSymbols < 1 || options.maxSymbols > 50) throw new Error("--max-symbols needs 1..50");
  if (options.fixturePath && !options.dryRun) throw new Error("--fixture requires --dry-run");
  if (options.today && (!options.dryRun || !/^\d{4}-\d{2}-\d{2}$/.test(options.today))) throw new Error("--as-of needs --dry-run and YYYY-MM-DD");
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const db = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
  if (!db && !options.fixturePath) throw new Error("DATABASE_URL is required outside fixture dry-run");
  try {
    const page = options.fixturePath ? JSON.parse(await readFile(options.fixturePath, "utf8")) as Form4Page : null;
    const api: InsiderClient | null = page ? { form4: async () => ({ ...page, links: { next: null } }), getCallCosts: () => ({ "sec-filings/form4": 10 }) }
      : options.dryRun ? null : new EodhdClient();
    if (!options.dryRun && !process.env.EODHD_API_KEY) throw new Error("EODHD_API_KEY is required");
    const subjects = !db && page ? [{ ticker: "AAPL", vendorSymbol: "AAPL.US", secCheckedAt: null, vendorCheckedAt: null, secFailed: true }] : undefined;
    const result = await runEodhdInsider(db, api, { ...options, subjects });
    process.stdout.write(`eodhd-insider: ${JSON.stringify(result)}${options.dryRun ? " (dry run)" : ""}\n`);
    if (result.failures.length) process.exitCode = 1;
    if (result.incomplete?.length) process.stderr.write(`${JSON.stringify({ event: "eodhd_insider_incomplete", tickers: result.incomplete })}\n`);
  } finally { await db?.end(); }
}
if (/(?:^|[/\\])eodhd-insider\.(?:ts|js)$/.test(process.argv[1] ?? ""))
  void runLoggedJob("eodhd-insider", main, { store: process.argv.includes("--dry-run") ? null : undefined });
