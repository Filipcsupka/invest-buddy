import pg from "pg";
import { describe, expect, it } from "vitest";
import type { OHLCV } from "../engine";
import { detectFromBars, detectFromRevisions, snapRatio, type CorporateAction } from "../data/corporate-actions";
import { insertCorporateActions, insertMemoryCorporateActions } from "../db/corporate-actions";
import { detectAll, mergeNearby } from "./dq-corporate-actions";

const day = (i: number) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
const bar = (i: number, close: number, volume = 1000): OHLCV => ({ date: day(i), open: close, high: close, low: close, close, volume });
const series = (n: number, closeAt: (i: number) => number, volumeAt: (i: number) => number = () => 1000) => Array.from({ length: n }, (_, i) => bar(i, closeAt(i), volumeAt(i)));

describe("snapRatio", () => {
  it("snaps near-rational values and rejects others", () => {
    expect(snapRatio(4.03)).toBe(4);
    expect(snapRatio(10)).toBe(10);
    expect(snapRatio(1 / 10.1)).toBeCloseTo(0.1);
    expect(snapRatio(1.82)).toBeNull();
    expect(snapRatio(1.12)).toBeNull();
  });
});

describe("split detection from bars", () => {
  const split = series(60, (i) => i < 40 ? 400 : 100, (i) => i === 40 ? 5000 : 1000);
  it("a 4:1 fixture gives ratio 4 and one row", () => {
    const found = detectAll([{ ticker: "NVDA", bars: split }], new Map());
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ ticker: "NVDA", actionDate: day(40), kind: "split", ratio: 4, detectedBy: "heuristic" });
  });
  it("a normal 12% day does not", () => {
    expect(detectFromBars("NVDA", series(60, (i) => i < 40 ? 100 : 88, (i) => i === 40 ? 5000 : 1000))).toEqual([]);
  });
  it("a big drop without a volume spike or off a split ratio does not", () => {
    expect(detectFromBars("X", series(60, (i) => i < 40 ? 400 : 100))).toEqual([]);
    expect(detectFromBars("X", series(60, (i) => i < 40 ? 182 : 100, (i) => i === 40 ? 5000 : 1000))).toEqual([]);
  });
  it("a 1:10 reverse split is recorded with ratio 0.1", () => {
    const found = detectFromBars("X", series(60, (i) => i < 40 ? 5 : 50, (i) => i === 40 ? 5000 : 1000));
    expect(found[0]).toMatchObject({ kind: "reverse_split", ratio: 0.1 });
  });
  it("3:2 and 5:4 cannot move a close by 40%, so the bar path ignores them but still finds 2:3", () => {
    expect(detectFromBars("X", series(60, (i) => i < 40 ? 150 : 100, (i) => i === 40 ? 5000 : 1000))).toEqual([]);
    expect(detectFromBars("X", series(60, (i) => i < 40 ? 125 : 100, (i) => i === 40 ? 5000 : 1000))).toEqual([]);
    expect(snapRatio(1.5)).toBe(1.5);
    expect(detectFromBars("X", series(60, (i) => i < 40 ? 100 : 150, (i) => i === 40 ? 5000 : 1000))[0]).toMatchObject({ kind: "reverse_split", ratio: Math.round(1e6 / 1.5) / 1e6 });
  });
  it("re-run is idempotent", () => {
    const store: CorporateAction[] = [];
    const rows = detectAll([{ ticker: "NVDA", bars: split }], new Map());
    expect(insertMemoryCorporateActions(store, rows)).toBe(1);
    expect(insertMemoryCorporateActions(store, rows)).toBe(0);
    expect(store).toHaveLength(1);
  });
});

describe("split detection from revisions (D12)", () => {
  const revised = Array.from({ length: 30 }, (_, i) => ({ barDate: day(i), oldClose: 400, newClose: 100 }));
  const next = (after: string) => after < day(40) ? day(30) : null;
  it("whole history rescaled by 4 is a split at the next bar", () => {
    expect(detectFromRevisions("NVDA", revised, next)).toMatchObject([{ actionDate: day(30), kind: "split", ratio: 4, detail: { rule: "history_rescaled" } }]);
  });
  it("a few vendor corrections are not a split", () => {
    const few = revised.map((r, i) => i < 3 ? r : { ...r, oldClose: 100 });
    expect(detectFromRevisions("NVDA", few, next)).toEqual([]);
    expect(detectFromRevisions("NVDA", revised.slice(0, 5), next)).toEqual([]);
  });
});

describe("merge of nearby candidates", () => {
  const base = { ticker: "NVDA", kind: "split" as const, ratio: 4, amount: null, sourceId: "twelvedata", detectedBy: "heuristic" as const };
  it("one split seen by both paths a day apart is one row, the earliest", () => {
    const merged = mergeNearby([{ ...base, actionDate: "2026-02-11", detail: { rule: "history_rescaled" } }, { ...base, actionDate: "2026-02-10", detail: { rule: "close_move_volume_spike" } }]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ actionDate: "2026-02-10", detail: { mergedRules: ["close_move_volume_spike", "history_rescaled"] } });
  });
  it("keeps different ratios, tickers, kinds and dates more than 3 days apart", () => {
    const rows = [{ ...base, actionDate: "2026-02-10", detail: {} }, { ...base, ratio: 2, actionDate: "2026-02-10", detail: {} }, { ...base, ticker: "AMD", actionDate: "2026-02-10", detail: {} }, { ...base, actionDate: "2026-02-14", detail: {} }];
    expect(mergeNearby(rows)).toHaveLength(4);
  });
  it("detectAll merges a bar-path and a revision-path hit on the same split", () => {
    const bars = series(60, (i) => i < 40 ? 400 : 100, (i) => i === 40 ? 5000 : 1000);
    const revised = Array.from({ length: 30 }, (_, i) => ({ barDate: day(i + 10), oldClose: 400, newClose: 100 }));
    const found = detectAll([{ ticker: "NVDA", bars }], new Map([["NVDA", revised]]));
    expect(found).toHaveLength(1);
    expect(found[0].actionDate).toBe(day(40));
  });
});

describe("corporate_actions table (Postgres)", () => {
  it.skipIf(!process.env.TEST_DATABASE_URL)("insert is idempotent", async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
    try {
      await pool.query("BEGIN");
      await pool.query("INSERT INTO instruments (ticker,name,sector,tier,source) VALUES ('ZZCA','Test','Test',1,'guide')");
      const row: CorporateAction = { ticker: "ZZCA", actionDate: "2026-03-01", kind: "split", ratio: 4, amount: null, sourceId: "twelvedata", detectedBy: "heuristic", detail: { rule: "x" } };
      expect(await insertCorporateActions(pool, [row])).toBe(1);
      expect(await insertCorporateActions(pool, [row])).toBe(0);
    } finally { await pool.query("ROLLBACK"); await pool.end(); }
  });
});
