import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import pg from "pg";
import { MemoryNavHistoryRepository, PostgresNavHistoryRepository } from "../db/portfolio-history";
import { MemoryPortfolioRepository } from "../db/portfolio";
import { runPortfolio } from "../jobs/portfolio";
import { buildIndexedSeries, navPointsFromXml, type NavPoint } from "./history";
import { normalizeFlex, parseFlexPortfolio } from "./model";

const daily = new URL("./fixtures/flex-daily.xml", import.meta.url);
const live = new URL("./fixtures/flex-live.xml", import.meta.url);
const provider = { bars: async () => [] };

describe("NAV history from Flex", () => {
  it("imports every per-day ChangeInNAV row", async () => {
    const points = navPointsFromXml(await readFile(daily, "utf8"));
    expect(points.map((p) => p.date)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-07", "2026-09-08"]);
    expect(points[2]).toEqual({ date: "2026-09-03", navEur: 52005, depositsEur: 1000, source: "flex-daily" });
  });

  it("stores only the two ends of a start and end report", async () => {
    expect(navPointsFromXml(await readFile(live, "utf8"))).toEqual([
      { date: "2026-09-01", navEur: 50000, depositsEur: 0, source: "flex-summary" },
      { date: "2026-09-30", navEur: 52000, depositsEur: 1000, source: "flex-summary" },
    ]);
  });

  it("reads reportDate rows, skips non-EUR and unusable rows", () => {
    const xml = `<FlexQueryResponse><FlexStatements><FlexStatement>
      <ChangeInNAV reportDate="20260105" endingValue="100" deposits="5" />
      <ChangeInNAV reportDate="20260106" endingValue="101" currency="USD" />
      <ChangeInNAV reportDate="20260107" endingValue="" />
      <ChangeInNAV reportDate="bad" endingValue="1" />
    </FlexStatement></FlexStatements></FlexQueryResponse>`;
    expect(navPointsFromXml(xml)).toEqual([{ date: "2026-01-05", navEur: 100, depositsEur: 5, source: "flex-daily" }]);
  });

  it("keeps parsing the baseline and weights from a daily report", async () => {
    const eur = parseFlexPortfolio(await readFile(daily, "utf8"));
    expect(eur.asOf).toBe("2026-09-08");
    expect(eur.nav).toEqual({ start: 50000, end: 52520, deposits: 1000 });
    const snapshot = await normalizeFlex(await readFile(daily, "utf8"), provider);
    expect(snapshot.series).toEqual([]);
    expect(snapshot.weights).toHaveLength(2);
    expect(JSON.stringify(snapshot)).not.toMatch(/PRIVATE-ACCOUNT|5\d{4}|benchmark/i);
  });
});

describe("indexed series", () => {
  const history: NavPoint[] = [
    { date: "2026-09-01", navEur: 1000, depositsEur: 0, source: "flex-daily" },
    { date: "2026-09-02", navEur: 1100, depositsEur: 0, source: "flex-daily" },
    { date: "2026-09-03", navEur: 1650, depositsEur: 500, source: "flex-daily" },
    { date: "2026-09-04", navEur: 1485, depositsEur: 0, source: "flex-daily" },
  ];
  it("chains daily returns net of deposits and indexes SPY on the nearest earlier bar", () => {
    const bars = [{ date: "2026-08-31", close: 400 }, { date: "2026-09-02", close: 410 }, { date: "2026-09-04", close: 420 }];
    const s = buildIndexedSeries(history, bars);
    // day 3: (1650 - 1100 - 500) / 1100 is about 4.5 %, day 4: 1485 / 1650 - 1 = -10 %
    expect(s.points.map((p) => p.portfolio)).toEqual([100, 110, 115, 103.5]);
    expect(s.twrPercent).toBe(3.5);
    expect(s.points.map((p) => p.benchmark)).toEqual([100, 102.5, 102.5, 105]);
    expect(s.benchmarkPercent).toBe(5);
  });
  it("drops the benchmark when no bar precedes the first date and has no return with one point", () => {
    const s = buildIndexedSeries(history, [{ date: "2026-09-02", close: 410 }]);
    expect(s.points.every((p) => p.benchmark === null)).toBe(true);
    expect(s.benchmarkPercent).toBeNull();
    expect(buildIndexedSeries(history.slice(0, 1), []).twrPercent).toBeNull();
  });
  it("matches the daily fixture", async () => {
    const s = buildIndexedSeries(navPointsFromXml(await readFile(daily, "utf8")), []);
    const expected = 100 * (51005 / 50500) * ((52005 - 51005 - 1000) / 51005 + 1) * (52525.05 / 52005) * (52000 / 52525.05) * (52520 / 52000);
    expect(s.points.at(-1)!.portfolio).toBeCloseTo(expected, 3);
  });
});

describe("history job", () => {
  it("upserts on every run, idempotently, and a summary never overwrites a daily row", async () => {
    const history = new MemoryNavHistoryRepository();
    process.env.FLEX_TOKEN = "T"; process.env.FLEX_QUERY_ID = "Q";
    const original = globalThis.fetch;
    const lines: string[] = [];
    const run = async (file: URL) => {
      const xml = await readFile(file, "utf8");
      globalThis.fetch = (async () => new Response(xml)) as typeof fetch;
      await runPortfolio(new MemoryPortfolioRepository(), 1, undefined, (l) => lines.push(l), history);
    };
    try {
      await run(daily);
      await run(daily);
      expect(await history.all()).toHaveLength(6);
      await run(live);
      const all = await history.all();
      expect(all.map((p) => p.date)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-07", "2026-09-08", "2026-09-30"]);
      expect(all[0]).toMatchObject({ navEur: 50500, source: "flex-daily" });
    } finally { globalThis.fetch = original; delete process.env.FLEX_TOKEN; delete process.env.FLEX_QUERY_ID; }
    expect(lines.join("\n")).toMatch(/nav history upserted points=6/);
    expect(lines.join("\n")).not.toMatch(/5\d{4}/);
  });
});

describe("Postgres NAV history", () => {
  it.skipIf(!process.env.TEST_DATABASE_URL)("upserts idempotently and protects daily rows", async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
    try {
      await pool.query("BEGIN");
      await pool.query("DELETE FROM portfolio_nav_history");
      const repo = new PostgresNavHistoryRepository(pool);
      const rows: NavPoint[] = [{ date: "2026-09-01", navEur: 100, depositsEur: 0, source: "flex-daily" }, { date: "2026-09-02", navEur: 101.5, depositsEur: 2, source: "flex-daily" }];
      await repo.upsert(rows);
      await repo.upsert(rows);
      await repo.upsert([{ date: "2026-09-01", navEur: 999, depositsEur: 0, source: "flex-summary" }, { date: "2026-09-03", navEur: 102, depositsEur: 0, source: "flex-summary" }]);
      expect(await repo.all()).toEqual([...rows, { date: "2026-09-03", navEur: 102, depositsEur: 0, source: "flex-summary" }]);
      await repo.upsert([{ date: "2026-09-03", navEur: 103, depositsEur: 0, source: "flex-daily" }]);
      expect((await repo.all())[2]).toMatchObject({ navEur: 103, source: "flex-daily" });
    } finally { await pool.query("ROLLBACK"); await pool.end(); }
  });
});
