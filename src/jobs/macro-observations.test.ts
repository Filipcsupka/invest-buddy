import pg from "pg";
import { describe, expect, it } from "vitest";
import { fredObservationsUrl, parseFredMacro, parseTreasuryCurve } from "../collectors/macro-observations";
import { stubHttp } from "../collectors/sources/testing";
import { checkSeriesNotes, FRED_MACRO_SERIES, TREASURY_SERIES_IDS } from "../data/macro-series";
import { MemoryUsageLedger } from "../data/usage";
import { MemoryCollectorRepository, PostgresCollectorRepository } from "../db/collectors";
import { storedMacroSeries } from "../db/macro-observations";
import { migrate } from "../../scripts/migrate";
import { MemoryBackfillStore, runBackfill } from "./backfill";
import { createMacroFredBackfillJob, createMacroTreasuryBackfillJob, storeDailyMacroObservations } from "./macro-observations";

const NOW = new Date("2026-10-09T10:00:00Z");
const fred = (rows: [string, string][], vintage = "2026-10-09") => JSON.stringify({ observations: rows.map(([date, value]) => ({ realtime_start: vintage, realtime_end: vintage, date, value })) });
const TSY = `Date,"1 Mo","3 Mo","2 Yr","10 Yr"\n10/09/2026,4.13,4.25,4.80,4.30\n10/08/2026,4.14,,4.75,4.22\nnot a date,1,2,3,4\n`;
const idOf = (url: string) => /series_id=([A-Z0-9]+)/.exec(url)![1];

describe("macro observation parsers", () => {
  it("keeps numeric FRED rows with their vintage and drops '.'", () => {
    const rows = parseFredMacro("DGS10", fred([["2026-10-08", "4.22"], ["2026-10-07", "."], ["2026-10-06", "4.1"]], "2026-10-09"), "2026-10-10");
    expect(rows.map((r) => [r.obsDate, r.value, r.realtimeStart])).toEqual([["2026-10-06", 4.1, "2026-10-09"], ["2026-10-08", 4.22, "2026-10-09"]]);
    expect(rows[0]).toMatchObject({ seriesId: "DGS10", sourceId: "fred", sourceUrl: "https://fred.stlouisfed.org/series/DGS10" });
  });
  it("falls back to the fetch date when FRED sends no vintage", () => {
    expect(parseFredMacro("X", JSON.stringify({ observations: [{ date: "2026-10-08", value: "1" }] }), "2026-10-10")[0].realtimeStart).toBe("2026-10-10");
  });
  it("parses the Treasury curve into three series and skips blanks", () => {
    const rows = parseTreasuryCurve(TSY);
    expect(new Set(rows.map((r) => r.seriesId))).toEqual(new Set(TREASURY_SERIES_IDS));
    expect(rows.find((r) => r.seriesId === "TSY_2Y" && r.obsDate === "2026-10-09")).toMatchObject({ value: 4.8, sourceId: "treasury", realtimeStart: "2026-10-09" });
    expect(rows.some((r) => r.seriesId === "TSY_3M" && r.obsDate === "2026-10-08")).toBe(false);
    expect(rows).toHaveLength(5);
  });
  it("rejects a Treasury file without the expected columns", () => {
    expect(() => parseTreasuryCurve("Date,Foo\n10/09/2026,1\n")).toThrow(/missing an expected column/);
  });
});

describe("copyright check", () => {
  it("rejects a series whose notes mention copyright and one that was not checked", () => {
    const result = checkSeriesNotes(["DGS10", "BAD", "NOTES_MISSING"], { DGS10: "Source: Board of Governors", BAD: "Copyright, 2016, Some Owner. Used with permission." });
    expect(result.storable).toEqual(["DGS10"]);
    expect(result.rejected).toEqual([{ id: "BAD", reason: "notes mention copyright" }, { id: "NOTES_MISSING", reason: "notes not checked" }]);
  });
});

describe("daily macro observations", () => {
  const fredGet = (value = "4.2") => async () => fred([["2026-10-08", value], ["2026-10-09", "4.3"]]);
  const http = stubHttp(() => TSY);
  it("stores the series list from fixtures, a second run adds nothing, a revision adds one vintage row", async () => {
    const repo = new MemoryCollectorRepository();
    const first = await storeDailyMacroObservations(repo, { key: "secret-key", http, get: fredGet(), now: NOW });
    expect(first.failures).toEqual([]);
    expect(new Set(repo.macroObservations.map((r) => r.seriesId))).toEqual(new Set([...FRED_MACRO_SERIES.map((s) => s.id), ...TREASURY_SERIES_IDS]));
    expect(JSON.stringify(repo.macroObservations)).not.toContain("secret-key");
    const count = repo.macroObservations.length;
    expect((await storeDailyMacroObservations(repo, { key: "secret-key", http, get: fredGet(), now: NOW })).written).toBe(0);
    expect(repo.macroObservations).toHaveLength(count);
    const later = await storeDailyMacroObservations(repo, { key: "secret-key", http, get: async (url) => fred([["2026-10-08", idOf(url) === "DGS10" ? "4.25" : "4.2"]], "2026-10-20"), now: new Date("2026-10-20T10:00:00Z") });
    expect(later.written).toBe(1);
    const dgs10 = repo.macroObservations.filter((r) => r.seriesId === "DGS10" && r.obsDate === "2026-10-08");
    expect(dgs10.map((r) => [r.value, r.realtimeStart])).toEqual([[4.2, "2026-10-09"], [4.25, "2026-10-20"]]);
  });
  it("reports a failing source and still stores the rest; no key skips FRED", async () => {
    const repo = new MemoryCollectorRepository();
    const result = await storeDailyMacroObservations(repo, { key: "k", http, get: async (url) => { if (idOf(url) === "DGS2") throw new Error("down"); return fred([["2026-10-09", "1"]]); }, now: NOW });
    expect(result.failures).toEqual(["macro DGS2: down"]);
    expect(repo.macroObservations.some((r) => r.seriesId === "DGS10")).toBe(true);
    const noKey = new MemoryCollectorRepository();
    expect((await storeDailyMacroObservations(noKey, { http, now: NOW })).failures).toEqual([]);
    expect(new Set(noKey.macroObservations.map((r) => r.sourceId))).toEqual(new Set(["treasury"]));
  });
  it("builds the FRED url with the key only in the query", () => {
    expect(fredObservationsUrl("k", "DGS2", { start: "2023-10-01", end: "2023-12-31" })).toBe("https://api.stlouisfed.org/fred/series/observations?series_id=DGS2&api_key=k&file_type=json&sort_order=asc&observation_start=2023-10-01&observation_end=2023-12-31");
  });
});

describe("macro backfill through the runner", () => {
  const ledger = () => new MemoryUsageLedger({ fred: { dailyCap: null, monthlyCostCapEur: 0 }, treasury: { dailyCap: null, monthlyCostCapEur: 0 } });
  const urls: string[] = [];
  const get = async (url: string) => { urls.push(url); return fred([["2024-01-02", "4"]]); };
  it("dry run plans every series and stores nothing", async () => {
    const repo = new MemoryCollectorRepository(), store = new MemoryBackfillStore();
    const result = await runBackfill(createMacroFredBackfillJob(repo, "k", get, () => NOW), store, ledger(), { dryRun: true });
    expect(result.plan?.map((p) => p.subject)).toEqual(FRED_MACRO_SERIES.map((s) => s.id));
    expect(repo.macroObservations).toHaveLength(0);
    expect(store.writes).toBe(0);
    expect(urls).toHaveLength(0);
  });
  it("stops at a request cap, resumes at the next year and finishes at the current year", async () => {
    const repo = new MemoryCollectorRepository(), store = new MemoryBackfillStore();
    urls.length = 0;
    const job = () => createMacroFredBackfillJob(repo, "k", get, () => NOW);
    const first = await runBackfill(job(), store, ledger(), { only: ["DGS10"], maxRequests: 2 });
    expect(first).toMatchObject({ status: "paused", requests: 2 });
    expect(urls[0]).toContain("observation_start=2023-10-01&observation_end=2023-12-31");
    expect(urls[1]).toContain("observation_start=2024-01-01&observation_end=2024-12-31");
    expect(await store.load("macro-fred", "DGS10")).toMatchObject({ status: "paused", cursor: { year: 2025 } });
    const second = await runBackfill(job(), store, ledger(), { only: ["DGS10"] });
    expect(second).toMatchObject({ status: "completed", requests: 2, subjectsDone: 1 });
    expect(urls).toHaveLength(4);
    expect(urls[3]).toContain("observation_end=2026-12-31");
  });
  it("backfills the Treasury curve by year from the history start", async () => {
    const repo = new MemoryCollectorRepository(), store = new MemoryBackfillStore(), tsy = stubHttp(() => TSY);
    const result = await runBackfill(createMacroTreasuryBackfillJob(repo, tsy, () => NOW), store, ledger());
    expect(result).toMatchObject({ status: "completed", requests: 4, subjectsDone: 1 });
    expect(tsy.calls.map((c) => c.url.match(/\/(\d{4})\/all/)![1])).toEqual(["2023", "2024", "2025", "2026"]);
    expect(repo.macroObservations.every((r) => r.obsDate >= "2023-10-01")).toBe(true);
  });
});

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("macro_observations on postgres", () => {
  it("writes once, keeps a revision as a new vintage and reads the newest vintage per date", async () => {
    await migrate(url!);
    const pool = new pg.Pool({ connectionString: url, max: 1 });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const repo = new PostgresCollectorRepository(client as never);
      const row = { seriesId: "TEST_D24", obsDate: "2026-10-08", value: 4.2, realtimeStart: "2026-10-09", sourceId: "fred" as const, sourceUrl: "https://fred.stlouisfed.org/series/TEST_D24" };
      expect(await repo.upsertMacroObservations([row])).toBe(1);
      expect(await repo.upsertMacroObservations([row])).toBe(0);
      expect(await repo.upsertMacroObservations([{ ...row, value: 4.25, realtimeStart: "2026-10-20" }])).toBe(1);
      expect(await storedMacroSeries(client as unknown as pg.Pool, "TEST_D24", "2026-10-09", 10)).toEqual([{ date: "2026-10-08", value: 4.25 }]);
      expect(await storedMacroSeries(client as unknown as pg.Pool, "TEST_D24", "2026-10-07", 10)).toEqual([]);
    } finally { await client.query("ROLLBACK"); client.release(); await pool.end(); }
  });
});
