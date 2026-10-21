import type pg from "pg";
import { putSnapshot } from "../../data/raw-store";
import { CapReached, type UsageLedger } from "../../data/usage";
import type { SourceHttp } from "./client";
import { AlphaVantageLimit, KEY_VARIABLE, redact, SOURCE } from "./alphavantage";
import { isDate, isoDate, marketTicker } from "./common";

export { KEY_VARIABLE };
export const CALENDAR_KEY = "earnings_calendar:12month";
export const CALENDAR_JOB = "earnings-calendar";
const calendarUrl = (key: string) => `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&horizon=12month&apikey=${encodeURIComponent(key)}`;

export interface CalendarRow { symbol: string; reportDate: string; fiscalDateEnding: string | null; estimate: number | null; currency: string | null; timeOfDay: string | null }

/** Splits one CSV line. Handles quoted fields with commas and doubled quotes. */
function splitLine(line: string): string[] {
  const out: string[] = [];
  let field = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { out.push(field); field = ""; }
    else field += c;
  }
  out.push(field);
  return out.map((value) => value.trim());
}

/** Parses the EARNINGS_CALENDAR CSV. A JSON answer is the limit or an error message. Rows without a valid report date are dropped. */
export function parseCalendar(text: string): CalendarRow[] {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    let answer: { Information?: string; Note?: string; "Error Message"?: string } = {};
    try { answer = JSON.parse(trimmed); } catch { /* fall through to the header check */ }
    if (answer.Information || answer.Note) throw new AlphaVantageLimit(`Alpha Vantage: ${answer.Information ?? answer.Note}`);
    throw new Error(`Alpha Vantage: ${answer["Error Message"] ?? "unexpected JSON answer"}`);
  }
  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim());
  const header = splitLine(lines[0] ?? "").map((name) => name.toLowerCase());
  const index = (name: string) => header.indexOf(name.toLowerCase());
  const [symbol, report] = [index("symbol"), index("reportDate")];
  if (symbol < 0 || report < 0) throw new Error("Alpha Vantage calendar: header has no symbol or reportDate column");
  const [fiscal, estimate, currency, time] = [index("fiscalDateEnding"), index("estimate"), index("currency"), index("timeOfTheDay")];
  const text0 = (cells: string[], i: number) => (i >= 0 && cells[i] ? cells[i] : null);
  const rows: CalendarRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitLine(line);
    const reportDate = cells[report];
    if (!cells[symbol] || !isDate(reportDate)) continue;
    const fiscalDate = text0(cells, fiscal);
    const est = text0(cells, estimate);
    rows.push({ symbol: cells[symbol], reportDate, fiscalDateEnding: isDate(fiscalDate) ? fiscalDate : null,
      estimate: est !== null && Number.isFinite(Number(est)) ? Number(est) : null, currency: text0(cells, currency), timeOfDay: text0(cells, time) });
  }
  return rows;
}

export interface CalendarResult { skipped?: string; requests: number; rows: number; universeRows: number; coveredRows: number; inserted: number }

/**
 * One request a day: the 12 month forward calendar. The whole CSV goes to the raw store; selected universe,
 * pool, baseline, and research tickers go to earnings_calendar_snapshots. Each observation is append-only.
 * A second run on the same UTC day sends no request unless `force` is set. The key never leaves this module.
 */
export async function collectEarningsCalendar(db: Pick<pg.Pool, "query">, http: Pick<SourceHttp, "get">, ledger: UsageLedger,
  options: { key: string | undefined; universe: string[]; additionalSymbols?: string[]; now?: Date; force?: boolean; dryRun?: boolean }): Promise<CalendarResult> {
  const key = options.key?.trim();
  if (!key) return { skipped: `${KEY_VARIABLE} is not set`, requests: 0, rows: 0, universeRows: 0, coveredRows: 0, inserted: 0 };
  const now = options.now ?? new Date();
  const observedOn = isoDate(now);
  if (!options.force && !options.dryRun) {
    const done = await db.query("SELECT 1 FROM raw_snapshots WHERE source_id=$1 AND key=$2 AND (fetched_at AT TIME ZONE 'UTC')::date=$3::date LIMIT 1", [SOURCE, CALENDAR_KEY, observedOn]);
    if (done.rows.length) return { skipped: `calendar already stored for ${observedOn}`, requests: 0, rows: 0, universeRows: 0, coveredRows: 0, inserted: 0 };
  }
  let body: string;
  try {
    if (!options.dryRun) await ledger.reserve(SOURCE, 1, { job: CALENDAR_JOB, credits: 1, now });
    body = await http.get(calendarUrl(key), { timeoutMs: 60_000, maxAttempts: 1, maxBytes: 20 * 1024 * 1024 });
  } catch (error) {
    if (error instanceof CapReached) return { skipped: error.message, requests: 0, rows: 0, universeRows: 0, coveredRows: 0, inserted: 0 };
    throw new Error(redact(error instanceof Error ? error.message : String(error), key));
  }
  const all = parseCalendar(body);
  const universeByMarket = new Map(options.universe.map((symbol) => [marketTicker(symbol), symbol]));
  const byMarket = new Map([...(options.additionalSymbols ?? []), ...options.universe].map((symbol) => [marketTicker(symbol), symbol]));
  const universeRows = all.filter((row) => universeByMarket.has(row.symbol)).length;
  const mine = all.flatMap((row) => { const symbol = byMarket.get(row.symbol); return symbol ? [{ ...row, symbol }] : []; });
  if (options.dryRun) return { requests: 1, rows: all.length, universeRows, coveredRows: mine.length, inserted: 0 };
  const raw = await putSnapshot(db, { sourceId: SOURCE, key: CALENDAR_KEY, body, contentType: "text/csv", fetchedAt: now, meta: { rows: all.length, horizon: "12month" } });
  let inserted = 0;
  for (const row of mine) {
    const result = await db.query(`INSERT INTO earnings_calendar_snapshots (observed_at, observed_on, ticker, report_date, fiscal_date_ending, estimate, currency, time_of_day, source_id, raw_snapshot_id)
      VALUES ($1,$2::date,$3,$4::date,$5::date,$6,$7,$8,$9,$10) ON CONFLICT (observed_on, ticker, report_date, source_id) DO NOTHING`,
      [now.toISOString(), observedOn, row.symbol, row.reportDate, row.fiscalDateEnding, row.estimate, row.currency, row.timeOfDay, SOURCE, raw.id]);
    inserted += result.rowCount ?? 0;
  }
  return { requests: 1, rows: all.length, universeRows, coveredRows: mine.length, inserted };
}
