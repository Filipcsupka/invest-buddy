import pg from "pg";
import { describe, expect, it } from "vitest";
import { MemoryUsageLedger } from "../../data/usage";
import { collectEarningsCalendar, parseCalendar } from "./alphavantage-calendar";
import { marketTicker } from "./common";
import { stubHttp } from "./testing";

/** Hand-written to match the documented EARNINGS_CALENDAR columns, not a captured live response. */
const HEADER = "symbol,name,reportDate,fiscalDateEnding,estimate,currency,timeOfTheDay";
const csv = (rows: string[]) => [HEADER, ...rows].join("\n");
const KEY = "AVCALKEY7SECRET";

describe("parseCalendar", () => {
  it("parses rows, quoted names, a blank estimate and a missing time", () => {
    const rows = parseCalendar(csv(['NVDA,NVIDIA Corp,2026-11-19,2026-10-31,1.25,USD,post-market', 'XYZ,"Block, Inc.",2026-11-06,2026-09-30,,USD,', "BAD,No date,,2026-09-30,1,USD,"]));
    expect(rows).toEqual([
      { symbol: "NVDA", reportDate: "2026-11-19", fiscalDateEnding: "2026-10-31", estimate: 1.25, currency: "USD", timeOfDay: "post-market" },
      { symbol: "XYZ", reportDate: "2026-11-06", fiscalDateEnding: "2026-09-30", estimate: null, currency: "USD", timeOfDay: null },
    ]);
  });
  it("treats a JSON answer as the limit or an error", () => {
    expect(() => parseCalendar(JSON.stringify({ Information: "rate limit is 25 requests per day" }))).toThrow(/25 requests per day/);
    expect(() => parseCalendar(JSON.stringify({ "Error Message": "Invalid API call" }))).toThrow(/Invalid API call/);
  });
  it("rejects a header without the needed columns", () => {
    expect(() => parseCalendar("foo,bar\n1,2")).toThrow(/header/);
  });
});

const universe = Array.from({ length: 36 }, (_, i) => `U${String(i).padStart(2, "0")}`);
const bigCsv = (shift = 0) => csv([
  ...universe.map((symbol, i) => `${symbol},Name ${i},2026-11-${String(10 + ((i + (i === 0 ? shift : 0)) % 15)).padStart(2, "0")},2026-09-30,${(i / 10).toFixed(2)},USD,pre-market`),
  ...Array.from({ length: 200 }, (_, i) => `OTH${i},Other ${i},2026-11-12,2026-09-30,0.5,USD,post-market`),
]);
const limits = { alphavantage: { dailyCap: 25, monthlyCostCapEur: 0 } };

describe("collectEarningsCalendar without a database", () => {
  it("sends nothing without a key", async () => {
    const http = stubHttp(() => "");
    const result = await collectEarningsCalendar({ query: async () => { throw new Error("no query"); } }, http, new MemoryUsageLedger(limits), { key: undefined, universe });
    expect(result).toMatchObject({ skipped: expect.stringContaining("ALPHA_VANTAGE_API_KEY"), requests: 0 });
    expect(http.calls).toHaveLength(0);
  });
  it("dry run counts universe rows, writes nothing and reserves nothing", async () => {
    const http = stubHttp(() => bigCsv());
    const ledger = new MemoryUsageLedger(limits);
    const result = await collectEarningsCalendar({ query: async () => { throw new Error("no query"); } }, http, ledger, { key: KEY, universe, dryRun: true });
    expect(result).toMatchObject({ rows: 236, universeRows: 36, inserted: 0 });
    expect(ledger.rows).toHaveLength(0);
  });
  it("hides the key in a failure and reports a reached cap as a skip", async () => {
    const failing = stubHttp(() => { throw new Error(`HTTP 500 at https://x/query?apikey=${KEY}`); });
    const error = await collectEarningsCalendar({ query: async () => ({ rows: [] }) as never }, failing, new MemoryUsageLedger(limits), { key: KEY, universe }).catch((e) => e as Error);
    expect(String(error)).not.toContain(KEY);
    const ledger = new MemoryUsageLedger({ alphavantage: { dailyCap: 0, monthlyCostCapEur: 0 } });
    const capped = await collectEarningsCalendar({ query: async () => ({ rows: [] }) as never }, stubHttp(() => bigCsv()), ledger, { key: KEY, universe });
    expect(capped.skipped).toMatch(/daily cap/);
  });
});

describe("earnings_calendar_snapshots (Postgres)", () => {
  /** Needs a migrated TEST_DATABASE_URL. The work runs in a transaction that is rolled back, since the table is append-only. */
  async function inTransaction(fn: (db: pg.PoolClient, tickers: string[]) => Promise<void>) {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const tickers = (await client.query<{ ticker: string }>("SELECT ticker FROM universe_membership WHERE valid_to IS NULL AND list <> 'benchmark' ORDER BY ticker LIMIT 36")).rows.map((row) => row.ticker);
      await fn(client, tickers);
    } finally { await client.query("ROLLBACK").catch(() => undefined); client.release(); await pool.end(); }
  }
  const calendar = (tickers: string[], dates: string[]) => csv([
    ...tickers.map((ticker, i) => `${marketTicker(ticker)},${ticker} Inc,${dates[i] ?? "2026-11-12"},2026-09-30,1.5,USD,post-market`),
    ...Array.from({ length: 200 }, (_, i) => `OTH${i},Other ${i},2026-11-12,2026-09-30,0.5,USD,post-market`),
  ]);
  const day1 = new Date("2026-10-11T06:15:00Z"), day2 = new Date("2026-10-12T06:15:00Z");

  it.skipIf(!process.env.TEST_DATABASE_URL)("stores universe rows only, adds none on a rerun, adds a row when a date moves", () => inTransaction(async (db, tickers) => {
    expect(tickers.length).toBeGreaterThanOrEqual(30);
    const ledger = new MemoryUsageLedger(limits);
    const run = (body: string, now: Date, force = false) => collectEarningsCalendar(db, stubHttp(() => body), ledger, { key: KEY, universe: tickers, now, force });
    const count = async () => Number((await db.query("SELECT count(*) AS n FROM earnings_calendar_snapshots")).rows[0].n);

    const first = await run(calendar(tickers, []), day1);
    expect(first).toMatchObject({ rows: tickers.length + 200, universeRows: tickers.length, inserted: tickers.length, requests: 1 });
    expect(await count()).toBe(tickers.length);
    expect(ledger.rows).toHaveLength(1);
    expect(Number((await db.query("SELECT count(*) AS n FROM raw_snapshots WHERE source_id='alphavantage' AND key='earnings_calendar:12month' AND size_bytes > 0")).rows[0].n)).toBeGreaterThanOrEqual(1);

    // Same day: no second request. Forced: the request is sent but the rows already exist.
    expect(await run(calendar(tickers, []), day1)).toMatchObject({ requests: 0, skipped: expect.stringContaining("already stored") });
    expect(await run(calendar(tickers, []), day1, true)).toMatchObject({ inserted: 0 });
    expect(await count()).toBe(tickers.length);

    // Next day with one date moved: every ticker is a new observation, the moved date is visible next to the old one.
    const moved = tickers.map((_, i) => (i === 0 ? "2026-11-20" : "2026-11-12"));
    await run(calendar(tickers, moved), day2);
    const history = await db.query("SELECT observed_on::text AS d, report_date::text AS r FROM earnings_calendar_snapshots WHERE ticker=$1 ORDER BY observed_on", [tickers[0]]);
    expect(history.rows).toEqual([{ d: "2026-10-11", r: "2026-11-12" }, { d: "2026-10-12", r: "2026-11-20" }]);
    expect(ledger.rows).toHaveLength(3);
  }));

  it.skipIf(!process.env.TEST_DATABASE_URL)("rows cannot be changed or deleted", () => inTransaction(async (db, tickers) => {
    await collectEarningsCalendar(db, stubHttp(() => calendar(tickers, [])), new MemoryUsageLedger(limits), { key: KEY, universe: tickers, now: day1 });
    await db.query("SAVEPOINT s");
    await expect(db.query("UPDATE earnings_calendar_snapshots SET estimate = 9")).rejects.toThrow(/immutable/);
    await db.query("ROLLBACK TO s");
    await expect(db.query("DELETE FROM earnings_calendar_snapshots")).rejects.toThrow(/immutable/);
  }));
});
