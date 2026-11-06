import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EodhdClient, EodhdHttpError } from "../data-providers/eodhd/client";
import { assignTradeKeys, congressStats, congressTrades, latestDisclosureDate, parseCongressTrades, upsertCongressTrades } from "../db/congress";
import { economicCalendar, latestIndicators, replaceEconomicEvents, upsertMacroIndicators, upsertUstRates, ustCurve } from "../db/economy";
import { migratedTestDb, type TestDb } from "../db/economy-testdb";
import {
  cryptoSymbols, markSentimentFetched, newsFeed, parseNews, pruneNews, sentimentQueue, sentimentSeries, topNewsTags, upsertNews, upsertSentiment,
} from "../db/news";
import { parseCongressArgs, runCongress, type CongressClient } from "./eodhd-congress";
import { parseEconomyArgs, runEconomy, type EconomyClient } from "./eodhd-economy";
import { parseNewsArgs, runNews, runSentiment, sentimentCandidates, type NewsClient } from "./eodhd-news";

/**
 * Storage and job runs for the flow views against every migration in PGlite. They share one file so the suite migrates once;
 * each block gets its own copy of the migrated database.
 */
const fixture = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "src/jobs/fixtures/eodhd-flow", name), "utf8")) as unknown;
const live = fixture("congress.json") as { data: Record<string, unknown>[] };

/** The real client with a canned fetch, so the call counter is the production one. */
function fakeClient<T>(reply: (url: URL) => unknown) {
  const urls: URL[] = [];
  const api = new EodhdClient({ apiKey: "test", fetch: async (input) => {
    const url = new URL(String(input));
    urls.push(url);
    const body = reply(url);
    return body instanceof Response ? body : Response.json(body);
  } });
  return { api: api as unknown as T, urls };
}

function withDb(name: string, body: (ctx: () => TestDb) => void) {
  describe(name, () => {
    let ctx: TestDb;
    beforeAll(async () => { ctx = await migratedTestDb(); }, 180_000);
    afterAll(async () => { await ctx.db.close(); });
    body(() => ctx);
  });
}
withDb("economy storage (PGlite)", (ctx) => {

  it("replaces one country's window, removing a moved release and keeping other countries", async () => {
    const base = { comparison: null, period: "Nov", actual: null, previous: 1, estimate: 2, change: null, changePct: null };
    const first = [{ ...base, key: "US|A||Nov|2026-11-10T13:30:00.000Z", country: "US", type: "A", eventAt: "2026-11-10T13:30:00.000Z" },
      { ...base, key: "US|B||Nov|2026-11-12T13:30:00.000Z", country: "US", type: "B", eventAt: "2026-11-12T13:30:00.000Z" }];
    const client = await ctx().pool.connect();
    expect(await replaceEconomicEvents(client, "US", "2026-11-01", "2026-11-30", first)).toEqual({ written: 2, removed: 0 });
    await replaceEconomicEvents(client, "DE", "2026-11-01", "2026-11-30", [{ ...base, key: "DE|C||Nov|2026-11-12T07:00:00.000Z", country: "DE", type: "C", eventAt: "2026-11-12T07:00:00.000Z" }]);
    const moved = [first[0], { ...first[1], key: "US|B||Nov|2026-11-13T13:30:00.000Z", eventAt: "2026-11-13T13:30:00.000Z" }];
    expect(await replaceEconomicEvents(client, "US", "2026-11-01", "2026-11-30", moved)).toEqual({ written: 1, removed: 1 });
    expect(await replaceEconomicEvents(client, "US", "2026-11-01", "2026-11-30", moved)).toEqual({ written: 0, removed: 0 });
    const all = await economicCalendar({ from: "2026-11-01T00:00:00Z", to: "2026-12-01T00:00:00Z" }, ctx().pool);
    expect(all.map((row) => `${row.country}:${row.type}:${row.eventAt}`)).toEqual(["US:A:2026-11-10T13:30:00Z", "DE:C:2026-11-12T07:00:00Z", "US:B:2026-11-13T13:30:00Z"]);
    expect((await economicCalendar({ from: "2026-11-01T00:00:00Z", to: "2026-12-01T00:00:00Z", country: "DE" }, ctx().pool)).map((row) => row.type)).toEqual(["C"]);
    const display = await ctx().pool.query<{ display_allowed: boolean; source_id: string }>("SELECT DISTINCT display_allowed, source_id FROM economic_events");
    expect(display.rows).toEqual([{ display_allowed: false, source_id: "eodhd" }]);
  });

  it("prefers the display-cleared Treasury value for the same day and computes week and month comparisons", async () => {
    const row = (date: string, tenor: string, rate: number) => ({ curve: "yield" as const, date, tenor, rate, raw: { date, tenor, rate } });
    await upsertUstRates(ctx().pool, [row("2026-10-06", "3M", 4.0), row("2026-10-06", "10Y", 4.5), row("2026-10-29", "10Y", 4.6),
      row("2026-11-05", "3M", 4.1), row("2026-11-05", "2Y", 4.2), row("2026-11-05", "10Y", 4.7)]);
    expect(await upsertUstRates(ctx().pool, [row("2026-11-05", "10Y", 4.7)])).toBe(0);
    await ctx().pool.query(`INSERT INTO macro_observations (series_id,obs_date,value,realtime_start,source_id,source_url)
      VALUES ('TSY_10Y','2026-11-05',4.72,'2026-11-05','treasury','https://home.treasury.gov/')`);
    const view = await ustCurve("yield", ctx().pool);
    expect(view.latest).toEqual({ date: "2026-11-05", points: [{ tenor: "3M", rate: 4.1, source: "eodhd" }, { tenor: "2Y", rate: 4.2, source: "eodhd" }, { tenor: "10Y", rate: 4.72, source: "treasury" }] });
    expect(view.weekAgo?.date).toBe("2026-10-29");
    expect(view.monthAgo?.date).toBe("2026-10-06");
    expect((await ustCurve("bill", ctx().pool)).latest).toBeNull();
  });

  it("keeps the newest non-null indicator value per country", async () => {
    await upsertMacroIndicators(ctx().pool, [
      { country: "USA", indicator: "gdp_growth_annual", date: "2025-12-31", value: null, countryName: "United States", indicatorName: "GDP growth (annual %)" },
      { country: "USA", indicator: "gdp_growth_annual", date: "2024-12-31", value: 2.79, countryName: "United States", indicatorName: "GDP growth (annual %)" },
    ]);
    expect(await latestIndicators(ctx().pool)).toEqual([{ country: "USA", countryName: "United States", indicator: "gdp_growth_annual", indicatorName: "GDP growth (annual %)", date: "2024-12-31", value: 2.79 }]);
  });
});

withDb("congressional trades storage (PGlite)", (ctx) => {

  it("upserts once, filters by ticker, member and chamber, and reports counts", async () => {
    const rows = assignTradeKeys(parseCongressTrades(live).rows);
    expect(await upsertCongressTrades(ctx().pool, rows)).toBe(3);
    expect(await upsertCongressTrades(ctx().pool, rows)).toBe(0);
    expect(await latestDisclosureDate(ctx().pool)).toBe("2026-10-27");
    expect((await congressTrades({ ticker: "MCD" }, ctx().pool)).map((row) => row.owner)).toEqual(["Spouse"]);
    expect(await congressTrades({ member: "sessi" }, ctx().pool)).toHaveLength(3);
    expect(await congressTrades({ member: "s000250" }, ctx().pool)).toHaveLength(3);
    expect(await congressTrades({ member: "100%_" }, ctx().pool)).toHaveLength(0);
    expect(await congressTrades({ chamber: "senate" }, ctx().pool)).toHaveLength(0);
    const stats = await congressStats(36500, ctx().pool);
    expect(stats).toEqual({ trades: 3, members: 1, purchases: 0, sales: 3, latest: "2026-10-27" });
    const raw = await ctx().pool.query<{ display_allowed: boolean; source: string }>("SELECT DISTINCT display_allowed, raw->'source'->>'source_system' AS source FROM congress_trades");
    expect(raw.rows).toEqual([{ display_allowed: false, source: "house" }]);
  });
});

withDb("news storage (PGlite)", (ctx) => {

  it("stores headlines once, filters by ticker and tag, and prunes old ones", async () => {
    const now = new Date().toISOString();
    const rows = parseNews(fixture("news-tag.json")).rows.map((row) => ({ ...row, publishedAt: now }));
    expect(await upsertNews(ctx().pool, rows)).toBe(3);
    expect(await upsertNews(ctx().pool, rows)).toBe(0);
    expect((await newsFeed({ ticker: "mrna" }, ctx().pool)).map((item) => item.title)).toEqual([rows[0].title]);
    expect(await newsFeed({ ticker: "DTE.XETRA" }, ctx().pool)).toHaveLength(1);
    expect(await newsFeed({ ticker: "DTE.X" }, ctx().pool)).toHaveLength(0);
    expect(await newsFeed({ tag: "telecom" }, ctx().pool)).toHaveLength(1);
    expect((await topNewsTags(7, 2, ctx().pool))[0]).toEqual({ tag: "EARNINGS", count: 3 });
    await upsertNews(ctx().pool, [{ ...rows[0], link: "https://old.example/a", publishedAt: "2020-01-01T00:00:00.000Z" }]);
    expect(await pruneNews(ctx().pool, 120)).toBe(1);
    const columns = await ctx().pool.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name='news_items'");
    expect(columns.rows.map((row) => row.column_name)).not.toContain("content");
  });

  it("stores daily sentiment, orders the fetch queue and reads a series", async () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(await upsertSentiment(ctx().pool, [{ symbol: "AAPL.US", date: today, score: 0.5, count: 3 }])).toBe(1);
    expect(await upsertSentiment(ctx().pool, [{ symbol: "AAPL.US", date: today, score: 0.5, count: 3 }])).toBe(0);
    await markSentimentFetched(ctx().pool, ["AAPL.US"]);
    expect((await sentimentQueue(ctx().pool, ["AAPL.US", "MSFT.US"])).map((row) => [row.symbol, row.lastFetched])).toEqual([["MSFT.US", null], ["AAPL.US", today]]);
    expect(await sentimentSeries("aapl.us", 30, ctx().pool)).toEqual([{ date: today, score: 0.5, count: 3 }]);
    expect(await cryptoSymbols(ctx().pool)).toContain("BTC-USD.CC");
  });
});


const ECONOMY_NOW = new Date("2026-11-06T05:10:00Z");
const economyReplies = (url: URL) => {
  if (url.pathname === "/api/economic-events") return url.searchParams.get("country") === "US" ? fixture("events-upcoming.json") : [];
  if (url.pathname === "/api/ust/bill-rates") return fixture("ust-bill.json");
  if (url.pathname === "/api/ust/long-term-rates") return fixture("ust-long.json");
  if (url.pathname === "/api/ust/real-yield-rates") return fixture("ust-real.json");
  if (url.pathname === "/api/ust/yield-rates") return { meta: { total: 2 }, data: [{ date: "2026-11-05", tenor: "2Y", rate: 4.2 }, { date: "2026-11-05", tenor: "10Y", rate: 4.7 }], links: {} };
  if (url.pathname.startsWith("/api/macro-indicator/")) return fixture("macro-usa.json");
  return new Response("not found", { status: 404 });
};
const CONGRESS_NOW = new Date("2026-11-06T06:25:00Z");

withDb("eodhd-economy run (PGlite)", (ctx) => {

  it("stores events, rates and indicators, logs calls, and skips fresh indicators on a rerun", async () => {
    const options = parseEconomyArgs(["--countries", "US,DE", "--indicator-countries", "USA", "--indicators", "gdp_growth_annual"]);
    const first = fakeClient<EconomyClient>(economyReplies);
    const result = await runEconomy(ctx().pool, first.api, options, ECONOMY_NOW);
    expect(result).toMatchObject({ requests: 2 + 4 + 1, events: 4, failedRequests: 0, skippedRows: 0, capped: false, calls: 2 + 4 + 10 });
    expect(result.ustRows).toBeGreaterThan(20);
    expect(first.urls.find((url) => url.pathname === "/api/economic-events")?.searchParams.get("from")).toBe("2026-10-23");
    expect(first.urls.find((url) => url.pathname === "/api/ust/yield-rates")?.searchParams.get("filter[year]")).toBe("2026");
    const log = await ctx().pool.query<{ calls: number }>("SELECT calls FROM eodhd_call_log WHERE job='eodhd-economy' AND run_date=CURRENT_DATE");
    expect(log.rows[0].calls).toBe(16);

    const second = fakeClient<EconomyClient>(economyReplies);
    const again = await runEconomy(ctx().pool, second.api, options, ECONOMY_NOW);
    expect(second.urls.some((url) => url.pathname.startsWith("/api/macro-indicator/"))).toBe(false);
    expect(again).toMatchObject({ events: 0, ustRows: 0, indicatorRows: 0, calls: 6 });
  });

  it("stops before the daily cap, counting calls already logged today", async () => {
    const { api, urls } = fakeClient<EconomyClient>(economyReplies);
    // 22 calls are already logged from the test above; a cap of 25 leaves room for three one-call requests.
    const result = await runEconomy(ctx().pool, api, parseEconomyArgs(["--part", "ust", "--max-calls", "25"]), ECONOMY_NOW);
    expect(urls).toHaveLength(3);
    expect(result).toMatchObject({ capped: true, requests: 3 });
  });

  it("stops every later request after an authorization failure and logs the attempted calls", async () => {
    const { api, urls } = fakeClient<EconomyClient>(() => new Response("denied", { status: 403 }));
    const result = await runEconomy(ctx().pool, api, parseEconomyArgs(["--max-calls", "5000"]), ECONOMY_NOW);
    expect(urls).toHaveLength(1);
    expect(result).toMatchObject({ failedRequests: 1, failures: 1 });
    expect(new EodhdHttpError(403, "economic-events").status).toBe(403);
  });
});

withDb("eodhd-congress run (PGlite)", (ctx) => {

  it("pages each disclosure window, excludes future trade dates, stores rows and restarts one window back", async () => {
    const page = (offset: number) => offset === 0 ? { data: [...Array(34)].flatMap(() => live.data).slice(0, 100), meta: { total: 103 }, links: { next: "/api/congressional-trades?page%5Boffset%5D=100" } }
      : { data: live.data.slice(0, 3), meta: { total: 103 }, links: {} };
    const { api, urls } = fakeClient<CongressClient>((url) => url.searchParams.get("disclosure_date_from") === "2026-10-23" ? page(Number(url.searchParams.get("page[offset]"))) : { data: [], meta: { total: 0 }, links: {} });
    const result = await runCongress(ctx().pool, api, parseCongressArgs(["--initial-days", "14"]), CONGRESS_NOW);
    expect(urls.map((url) => `${url.searchParams.get("disclosure_date_from")}..${url.searchParams.get("disclosure_date_to")}:${url.searchParams.get("page[offset]")}`))
      .toEqual(["2026-10-23..2026-10-29:0", "2026-10-23..2026-10-29:100", "2026-10-30..2026-11-05:0", "2026-11-06..2026-11-06:0"]);
    expect(urls.every((url) => url.searchParams.get("transaction_date_to") === "2026-11-06" && url.searchParams.get("page[limit]") === "100")).toBe(true);
    // A full page of repeated trades from one filing plus three more: identical trades get ordinal keys, so 103 rows.
    expect(result).toMatchObject({ from: "2026-10-23", requests: 4, fetched: 103, written: 103, failedRequests: 0, skippedRows: 0, capped: false, calls: 40 });
    const stored = await ctx().pool.query<{ n: number }>("SELECT count(*)::int AS n FROM congress_trades");
    expect(stored.rows[0].n).toBe(103);
    const third = fakeClient<CongressClient>(() => ({ data: [], meta: { total: 0 }, links: {} }));
    expect((await runCongress(ctx().pool, third.api, parseCongressArgs([]), CONGRESS_NOW)).from).toBe("2026-10-20");
  });

  it("stops at the daily cap", async () => {
    const { api, urls } = fakeClient<CongressClient>(() => ({ data: [], meta: { total: 0 }, links: {} }));
    const logged = (await ctx().pool.query<{ calls: number }>("SELECT calls FROM eodhd_call_log WHERE job='eodhd-congress' AND run_date=CURRENT_DATE")).rows[0].calls;
    const result = await runCongress(ctx().pool, api, parseCongressArgs(["--from", "2026-01-01", "--max-calls", String(logged + 20)]), CONGRESS_NOW);
    expect(urls).toHaveLength(2);
    expect(result).toMatchObject({ capped: true, windowsDone: 2 });
  });
});

withDb("eodhd-news runs (PGlite)", (ctx) => {

  it("reads the general feed and each tag, stores headlines without bodies and logs five calls per request", async () => {
    const { api, urls } = fakeClient<NewsClient>((url) => url.searchParams.get("t") ? fixture("news-tag.json") : fixture("news-general.json"));
    const result = await runNews(ctx().pool, api, parseNewsArgs(["--tags", "earnings"]), new Date());
    expect(urls.map((url) => [url.searchParams.get("s"), url.searchParams.get("t"), url.searchParams.get("limit")])).toEqual([[null, null, "100"], [null, "earnings", "100"]]);
    expect(result).toMatchObject({ requests: 2, fetched: 6, failedRequests: 0, calls: 10 });
    const log = await ctx().pool.query<{ calls: number }>("SELECT calls FROM eodhd_call_log WHERE job='eodhd-news'");
    expect(log.rows[0].calls).toBe(10);
  });

  it("batches sentiment symbols, counts five calls per symbol, and serves the waiting symbols first after a cap", async () => {
    const { api, urls } = fakeClient<NewsClient>(() => fixture("sentiments.json"));
    const options = parseNewsArgs(["--mode", "sentiment", "--batch", "2", "--max-calls", "12", "--no-universe"]);
    const candidates = await sentimentCandidates(ctx().pool, { ...options, symbols: ["AAPL.US"] }, new Date().toISOString().slice(0, 10));
    expect(candidates.slice(0, 2)).toEqual(["AAPL.US", "BTC-USD.CC"]);
    const first = await runSentiment(ctx().pool, api, options, ["AAPL.US", "BTC-USD.CC", "ETH-USD.CC"], new Date());
    expect(urls.map((url) => url.searchParams.get("s"))).toEqual(["AAPL.US,BTC-USD.CC"]);
    expect(first).toMatchObject({ requests: 1, symbolsFetched: 2, written: 7, capped: true, calls: 10 });
    const next = fakeClient<NewsClient>(() => ({ "ETH-USD.CC": [] }));
    const second = await runSentiment(ctx().pool, next.api, { ...options, maxCalls: 100 }, ["AAPL.US", "BTC-USD.CC", "ETH-USD.CC"], new Date());
    expect(next.urls.map((url) => url.searchParams.get("s"))).toEqual(["ETH-USD.CC,AAPL.US", "BTC-USD.CC"]);
    expect(second).toMatchObject({ symbolsFetched: 3, calls: 15 });
  });
});
