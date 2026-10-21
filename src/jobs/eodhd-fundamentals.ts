import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { EodhdClient, EodhdHttpError, type EarningsCalendar, type Fundamentals } from "../data-providers/eodhd/client";
import { parseEodhdCalendar, parseEodhdFundamentals } from "../data-providers/eodhd/fundamentals";
import { insertFundamentals } from "../collectors/sources/companyfacts";
import { insertEpsHistory } from "../db/eps-history";
import { PostgresCollectorRepository } from "../db/collectors";
import { document } from "../collectors/types";
import { EPS_FACT_KEY } from "../data/eps";
import { freshnessDays } from "../data/evidence";
import { putSnapshot } from "../data/raw-store";
import { runLoggedJob } from "./job-log";
import { loadUniverse } from "../db/universe";
import { eodhdClassification } from "../universe/sector";

const SOURCE = "eodhd";
const DAY = 86_400_000;
const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export interface Subject { ticker: string; vendorSymbol: string }
export interface RefreshState { attemptedAt: string; latestReportDate: string | null; lastExpectedReportDate?: string | null }
export interface FundamentalsClient { fundamentals(symbol: string, filter?: string): Promise<Fundamentals>; earningsCalendar(options: { from: string; to: string }): Promise<EarningsCalendar>; getCallCosts(): Record<string, number> }
export interface RunOptions { dryRun?: boolean; maxSymbols?: number; filter?: string; only?: string[]; subjects?: Subject[]; now?: Date }

/** Match reports within three days, retry a missed expected report after 14 days, and refresh every 100 days without a calendar match. */
export function dueForRefresh(expected: string | null, state: RefreshState | undefined, today: string): boolean {
  if (!state) return true;
  if (state.attemptedAt.slice(0, 10) <= shift(today, -100)) return true;
  if (!expected || (state.latestReportDate ?? "") >= shift(expected, -3)) return false;
  if (state.lastExpectedReportDate !== expected) return true;
  return state.attemptedAt.slice(0, 10) <= shift(today, -14);
}

export async function loadSubjects(db: Pick<pg.Pool, "query">, only?: string[]): Promise<Subject[]> {
  const universe = (await loadUniverse(db, undefined, { collect: true })).map((row) => row.symbol).filter((ticker) => !only || only.includes(ticker));
  if (!universe.length) return [];
  const result = await db.query<{ ticker: string; vendor_symbol: string | null }>(`SELECT i.ticker,
    COALESCE(ids.vendor_symbols->>'eodhd', s.vendor_symbol) AS vendor_symbol
    FROM instruments i
    LEFT JOIN instrument_ids ids ON ids.ticker=i.ticker AND ids.valid_to IS NULL
    LEFT JOIN LATERAL (SELECT vendor_symbol FROM symbols WHERE NOT delisted AND
      (vendor_symbol=i.ticker OR (exchange='US' AND code=i.ticker))
      ORDER BY CASE WHEN vendor_symbol=i.ticker THEN 0 ELSE 1 END, exchange LIMIT 1) s ON true
    WHERE i.ticker=ANY($1::text[]) ORDER BY i.ticker`, [universe]);
  const missing = result.rows.filter((row) => !row.vendor_symbol);
  if (missing.length) throw new Error(`Missing EODHD symbol for ${missing.map((row) => row.ticker).join(", ")}; run symbols:sync or set instrument_ids.vendor_symbols.eodhd`);
  return result.rows.map((row) => ({ ticker: row.ticker, vendorSymbol: row.vendor_symbol! }));
}

async function states(db: Pick<pg.Pool, "query">): Promise<Map<string, RefreshState>> {
  const result = await db.query<{ ticker: string; attempted_at: string; latest_report_date: string | null; last_expected_report_date: string | null }>(
    `SELECT ticker,to_char(attempted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS attempted_at,
      latest_report_date::text,last_expected_report_date::text FROM eodhd_fundamentals_refresh`);
  return new Map(result.rows.map((row) => [row.ticker, { attemptedAt: row.attempted_at, latestReportDate: row.latest_report_date,
    lastExpectedReportDate: row.last_expected_report_date }]));
}

/**
 * Stores General.Sector and General.Industry on the listing's symbols row. `sector_observed_on` keeps the day the current pair was
 * first stored, so a score date before that day does not read it. Only a non-null field overwrites; a missing one keeps the stored
 * value, so a payload without either field (a narrow filter) changes nothing.
 */
export async function storeClassification(db: Pick<pg.Pool, "query">, vendorSymbol: string, value: { sector: string | null; industry: string | null }, today: string) {
  if (!value.sector && !value.industry) return;
  await db.query(`UPDATE symbols SET sector=COALESCE($2,sector),industry=COALESCE($3,industry),
    sector_observed_on=CASE WHEN sector IS NOT DISTINCT FROM COALESCE($2,sector) AND industry IS NOT DISTINCT FROM COALESCE($3,industry) AND sector_observed_on IS NOT NULL
      THEN sector_observed_on ELSE $4::date END
    WHERE vendor_symbol=$1`, [vendorSymbol, value.sector || null, value.industry || null, today]);
}

export async function runEodhdFundamentals(db: pg.Pool | null, api: FundamentalsClient, options: RunOptions = {}) {
  const now = options.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const from = shift(today, -14), to = shift(today, 90);
  const subjects = options.subjects ?? (db ? await loadSubjects(db, options.only) : []);
  if (!subjects.length) return { calendarRows: 0, due: 0, refreshed: 0, facts: 0, eps: 0, calls: 0, failures: 0, failedSymbols: "", stoppedEarly: false };
  const byVendor = new Map(subjects.map((row) => [row.vendorSymbol, row.ticker]));
  const calendar = await api.earningsCalendar({ from, to }); // One bulk call for the whole window.
  const observations = parseEodhdCalendar(calendar, from, to).flatMap((row) => {
    const ticker = byVendor.get(row.vendorSymbol);
    return ticker ? [{ ...row, ticker }] : [];
  });
  if (db && !options.dryRun) {
    const raw = await putSnapshot(db, { sourceId: SOURCE, key: `earnings-calendar:${from}:${to}`, body: JSON.stringify(calendar), contentType: "application/json", fetchedAt: now });
    for (const row of observations) await db.query(`INSERT INTO earnings_calendar_snapshots
      (observed_at,observed_on,ticker,report_date,fiscal_date_ending,estimate,currency,time_of_day,source_id,raw_snapshot_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (observed_on,ticker,report_date,source_id) DO NOTHING`,
      [now, today, row.ticker, row.reportDate, row.fiscalDateEnding, row.estimate, row.currency, row.timeOfDay, SOURCE, raw.id]);
  }
  const expected = new Map<string, string>();
  for (const row of observations) if (row.reportDate <= today && row.reportDate > (expected.get(row.ticker) ?? "")) expected.set(row.ticker, row.reportDate);
  const last = db ? await states(db) : new Map<string, RefreshState>();
  const due = subjects.filter((row) => dueForRefresh(expected.get(row.ticker) ?? last.get(row.ticker)?.lastExpectedReportDate ?? null, last.get(row.ticker), today));
  const picked = due.slice(0, options.maxSymbols ?? 25);
  let facts = 0, eps = 0, refreshed = 0, stoppedEarly = false;
  const failed: string[] = [];
  const repo = db ? new PostgresCollectorRepository(db) : null;
  for (const row of picked) {
    try {
      const payload = await api.fundamentals(row.vendorSymbol, options.filter);
      const parsed = parseEodhdFundamentals(payload, row.ticker, today);
      if (db && !options.dryRun) {
        await putSnapshot(db, { sourceId: SOURCE, key: `fundamentals:${row.vendorSymbol}`, body: JSON.stringify(payload), contentType: "application/json", fetchedAt: now });
        await insertFundamentals(db, parsed.rows, SOURCE);
        await storeClassification(db, row.vendorSymbol, eodhdClassification(payload.General), today);
        if (parsed.earnings.length) await insertEpsHistory(db, { symbol: row.ticker, ticker: row.vendorSymbol, quarters: parsed.earnings,
          rawBody: JSON.stringify(payload.Earnings?.History ?? {}), fetchedAt: now.toISOString() }, SOURCE);
        const latest = parsed.earnings.filter((item) => item.reportedEps !== null).at(-1);
        if (latest?.reportedDate) {
          const url = `https://eodhd.com/api/v1.1/fundamentals/${encodeURIComponent(row.vendorSymbol)}#${latest.reportedDate}`;
          const doc = document({ source: SOURCE, sourceId: SOURCE, symbol: row.ticker, docType: "EPS surprise", url,
            publishedAt: `${latest.reportedDate}T00:00:00Z`, body: `${row.ticker} EPS report dated ${latest.reportedDate}.`,
            meta: { display_allowed: false, fiscalDateEnding: latest.fiscalDateEnding } });
          const stored = await repo!.upsertDocument(doc);
          await repo!.upsertFact({ symbol: row.ticker, key: EPS_FACT_KEY, asOf: latest.reportedDate,
            value: { reportedDate: latest.reportedDate, fiscalDateEnding: latest.fiscalDateEnding, reportedEps: latest.reportedEps,
              estimatedEps: latest.estimatedEps, surprisePercent: latest.surprisePct, source: SOURCE, displayAllowed: false },
            documentIds: [stored.id], expiresAt: shift(latest.reportedDate, freshnessDays.epsBeat), sourceId: SOURCE });
        }
        await db.query(`INSERT INTO eodhd_fundamentals_refresh (ticker,attempted_at,latest_report_date,last_expected_report_date)
          VALUES ($1,$2,$3,$4) ON CONFLICT (ticker) DO UPDATE SET attempted_at=EXCLUDED.attempted_at,
            latest_report_date=GREATEST(eodhd_fundamentals_refresh.latest_report_date,EXCLUDED.latest_report_date),
            last_expected_report_date=EXCLUDED.last_expected_report_date`,
        [row.ticker, now, latest?.reportedDate ?? null, expected.get(row.ticker) ?? last.get(row.ticker)?.lastExpectedReportDate ?? null]);
      }
      facts += parsed.rows.length;
      eps += parsed.earnings.length;
      refreshed++;
    } catch (error) {
      failed.push(row.ticker);
      const reason = error instanceof EodhdHttpError ? `HTTP ${error.status}` : error instanceof Error ? error.name : "error";
      process.stderr.write(`${JSON.stringify({ event: "eodhd_fundamentals_symbol_failed", ticker: row.ticker, reason })}\n`);
      if (error instanceof EodhdHttpError && [401, 402, 403].includes(error.status)) {
        stoppedEarly = true;
        break;
      }
    }
  }
  return { calendarRows: observations.length, due: due.length, refreshed, facts, eps,
    failures: failed.length, failedSymbols: failed.join(","), stoppedEarly,
    calls: Object.values(api.getCallCosts()).reduce((n, cost) => n + cost, 0) };
}

export function parseArgs(args: string[]) {
  const options: RunOptions & { fixtureDir?: string } = { dryRun: false, maxSymbols: 25 };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--fixture-dir") options.fixtureDir = args[++i];
    else if (arg === "--only") options.only = (args[++i] ?? "").split(",").filter(Boolean);
    else if (arg === "--max-symbols") options.maxSymbols = Number(args[++i]);
    else if (arg === "--filter") options.filter = args[++i];
    else if (arg === "--as-of") {
      const date = args[++i];
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new Error("--as-of needs YYYY-MM-DD");
      options.now = new Date(`${date}T12:00:00Z`);
    }
    else throw new Error(`Unknown eodhd-fundamentals option ${arg}`);
  }
  if (!Number.isInteger(options.maxSymbols) || options.maxSymbols! < 1 || options.maxSymbols! > 100) throw new Error("--max-symbols needs 1..100");
  if (options.now && !options.dryRun) throw new Error("--as-of is for dry-run only");
  if (options.fixtureDir && (!options.dryRun || !options.only?.length)) throw new Error("--fixture-dir needs --dry-run and --only");
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const db = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
  if (!db && !options.fixtureDir) throw new Error("DATABASE_URL is required outside fixture dry-run");
  const api: FundamentalsClient = options.fixtureDir ? {
    earningsCalendar: () => readFile(join(options.fixtureDir!, "earnings.json"), "utf8").then((x) => JSON.parse(x) as EarningsCalendar),
    fundamentals: (symbol) => readFile(join(options.fixtureDir!, `${symbol}.json`), "utf8").then((x) => JSON.parse(x) as Fundamentals),
    getCallCosts: () => ({}),
  } : new EodhdClient();
  if (!db) options.subjects = options.only!.map((vendorSymbol) => ({ ticker: vendorSymbol.split(".")[0], vendorSymbol }));
  try {
    const result = await runEodhdFundamentals(db, api, options);
    process.stdout.write(`eodhd-fundamentals: ${JSON.stringify(result)}${options.dryRun ? " (dry run)" : ""}\n`);
    if (result.failures) process.exitCode = 1;
    return result;
  } finally { await db?.end(); }
}
if (/(?:^|[/\\])eodhd-fundamentals\.(?:ts|js)$/.test(process.argv[1] ?? ""))
  void runLoggedJob("eodhd-fundamentals", main, { store: process.argv.includes("--dry-run") ? null : undefined });
