import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { growthPoolCandidates, hasStoredBars, poolCandidates, poolLane, type DiscoveryCandidate } from "./discovery";
import { DISCOVERY } from "./discovery-config";
import type { Growth, GrowthSnapshot } from "../collectors/sources/frames";
import type { PoolRow } from "../universe/pool";

const quarter = { year: 2026, q: 2 } as const;
const poolRow = (ticker: string, rank: number, name = `${ticker} Inc`): PoolRow => ({ cik: rank, name, concept: "Revenues", end: "2026-06-30", revenue: 100_000_000,
  yoyPercent: 60 - rank, qoqPercent: 5, priorYoyPercent: 40 - rank, accelerationPp: 20, ticker, rank });
const feedRow = (symbol: string, score: number, kind: "edgar" | "ownership" = "edgar"): DiscoveryCandidate => ({ symbol, name: `${symbol} Inc`, sector: "Discovery", theme: null, score,
  sources: [{ kind, url: `https://www.sec.gov/${symbol}`, detail: kind }] });

describe("hasStoredBars", () => {
  it("accepts 200 bars up to the age limit and rejects short, old or future history", () => {
    expect(hasStoredBars({ count: 260, newest: "2026-10-16" }, "2026-10-23", 7)).toBe(true);
    expect(hasStoredBars({ count: 260, newest: "2026-10-15" }, "2026-10-23", 7)).toBe(false);
    expect(hasStoredBars({ count: 199, newest: "2026-10-23" }, "2026-10-23", 7)).toBe(false);
    expect(hasStoredBars({ count: 260, newest: "2026-10-24" }, "2026-10-23", 7)).toBe(false);
    expect(hasStoredBars({ count: 260, newest: null }, "2026-10-23", 7)).toBe(false);
    expect(hasStoredBars(undefined, "2026-10-23", 7)).toBe(false);
  });
  it("covers a Sunday pool-bars run from the next Saturday discovery run", () => {
    // pool-bars on Sunday 2026-10-18 stores bars through Friday 2026-10-16; discovery on Saturday 2026-10-24 screens as of Friday 2026-10-23.
    expect(hasStoredBars({ count: 260, newest: "2026-10-16" }, "2026-10-23")).toBe(true);
  });
});

describe("poolCandidates", () => {
  it("keeps pool rank order, drops names without stored bars and carries the growth figures", () => {
    const stored = new Map([["AAA", { count: 260, newest: "2026-10-16" }], ["CCC", { count: 260, newest: "2026-10-22" }], ["DDD", { count: 120, newest: "2026-10-22" }]]);
    const rows = poolCandidates([poolRow("CCC", 1), poolRow("BBB", 2), poolRow("AAA", 3), poolRow("DDD", 4)], stored, "2026-10-23", quarter);
    expect(rows.map((row) => row.symbol)).toEqual(["CCC", "AAA"]);
    expect(rows[0]).toMatchObject({ sector: "Growth", score: 3, growth: { current: 59, prior: 39 }, sources: [{ kind: "pool", detail: "SEC growth pool rank 1, CY2026Q2" }] });
    expect(rows[0].sources[0].url).toBe("https://data.sec.gov/api/xbrl/frames/us-gaap/Revenues/USD/CY2026Q2.json#pool-CCC");
  });
});

describe("poolLane", () => {
  const stored = new Map(["AAA", "BBB", "CCC", "DDDDW", "EEE"].map((t) => [t, { count: 260, newest: "2026-10-22" }]));
  const pool = poolCandidates([poolRow("AAA", 1), poolRow("BBB", 2), poolRow("DDDDW", 3), poolRow("EEE", 4, "Eagle Acquisition Corp"), poolRow("CCC", 5)], stored, "2026-10-23", quarter);

  it("skips known names and non-common securities, and merges feed rows for pool names", () => {
    const { lane, feed, skipped } = poolLane(pool, [feedRow("AAA", 4), feedRow("ZZZ", 2), feedRow("CCC", 2, "ownership")], new Set(["BBB"]), 10);
    expect(lane.map((row) => row.symbol)).toEqual(["AAA", "CCC"]);
    expect(lane[0].score).toBe(7);
    expect(lane[0].sources.map((source) => source.kind)).toEqual(["pool", "edgar"]);
    expect(lane[1].sources.map((source) => source.kind)).toEqual(["pool", "ownership"]);
    expect(feed.map((row) => row.symbol)).toEqual(["ZZZ"]);
    expect(skipped).toEqual([{ symbol: "DDDDW", reason: "warrant symbol" }, { symbol: "EEE", reason: "SPAC (blank check company)" }]);
  });
  it("cuts the lane at the limit and leaves feed rows for names past it in the feed", () => {
    const { lane, feed } = poolLane(pool, [feedRow("CCC", 2)], new Set(), 1);
    expect(lane.map((row) => row.symbol)).toEqual(["AAA"]);
    expect(feed.map((row) => row.symbol)).toEqual(["CCC"]);
  });
  it("does not change the input rows", () => {
    const before = JSON.stringify(pool);
    poolLane(pool, [feedRow("AAA", 4)], new Set(), 10);
    expect(JSON.stringify(pool)).toBe(before);
  });
});

describe("growthPoolCandidates", () => {
  it("ranks the pool without held names and keeps only names with stored bars as of the run date", async () => {
    const growth: Growth[] = [1, 2, 3].map((cik) => ({ cik, name: `Co ${cik}`, concept: "Revenues", end: "2026-06-30", revenue: 100_000_000, yoyPercent: 50 - cik, qoqPercent: 5, priorYoyPercent: 40 - cik, accelerationPp: 10 }));
    const snapshot: GrowthSnapshot = { quarter, growth, tickers: { byCik: new Map([[1, { cik: 1, ticker: "HELD", title: "" }], [2, { cik: 2, ticker: "BBB", title: "" }], [3, { cik: 3, ticker: "CCC", title: "" }]]), byTicker: new Map() } };
    const queries: { sql: string; params?: unknown[] }[] = [];
    const db = { query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      if (sql.includes("universe_membership")) return { rows: [{ ticker: "HELD" }] };
      return { rows: [{ symbol: "BBB", count: "250", newest: "2026-10-16" }, { symbol: "CCC", count: "250", newest: "2026-10-01" }] };
    } };
    const rows = await growthPoolCandidates(db as never, Promise.resolve(snapshot), "2026-10-23");
    expect(rows.map((row) => row.symbol)).toEqual(["BBB"]);
    expect(queries[1].params).toEqual([["BBB", "CCC"], "2026-10-23"]);
  });
});

describe("discovery request budget", () => {
  it("fits the Twelve Data rate and the job deadline, and stays inside the non-prices share", () => {
    const manifest = readFileSync(join(process.cwd(), "deploy/gitops/gitops/apps/invest-buddy/base/collector-cronjobs.yaml"), "utf8")
      .split(/^---$/m).find((doc) => /name: invest-buddy-discovery\n/.test(doc)) ?? "";
    const deadlineMin = Number(/activeDeadlineSeconds: (\d+)/.exec(manifest)?.[1]) / 60;
    const twelveDataMin = DISCOVERY.preScreenTopK / 7;
    // Leaves at least half the deadline for the SEC feeds, profile reads (4 a second) and the pool lane.
    expect(twelveDataMin).toBeLessThanOrEqual(deadlineMin / 2);
    // Saturday also carries the prices job (151 names with the D36 adds) on the 800 a day plan; discovery may use 700.
    expect(DISCOVERY.preScreenTopK + 151).toBeLessThanOrEqual(800);
    expect(DISCOVERY.preScreenTopK).toBeLessThanOrEqual(700);
    expect(DISCOVERY.maxCandidatesPerWeek).toBe(10);
  });
});
