import pg from "pg";
import { describe, expect, it } from "vitest";
import type { OHLCV } from "../engine";
import { MemoryPriceRepository, PostgresPriceRepository } from "../db/prices";
import type { MarketDataProvider } from "../data/providers";
import { DailyLimitError } from "../data/twelvedata";
import { priceTickers, runPrices } from "./prices";

const bar = (date: string, close = 100): OHLCV => ({ date, open: close, high: close + 1, low: close - 1, close, volume: 1000 });
const series = (n: number, close = 100) => Array.from({ length: n }, (_, i) => bar(new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10), close));
const provider = (fn: (t: string) => Promise<OHLCV[]>): MarketDataProvider => ({ bars: fn });

describe("priceTickers", () => {
  it("includes the extended offline universe plus SPY", () => {
    const t = priceTickers();
    expect(t).toHaveLength(37);
    expect(t).toContain("SPY");
    expect(t).toContain("NVDA");
    expect(t).toContain("PCVX");
  });
});

describe("runPrices", () => {
  it("stores bars idempotently and records one run", async () => {
    const repo = new MemoryPriceRepository();
    const p = provider(async () => series(5));
    const first = await runPrices(p, repo, ["NVDA", "SPY"]);
    expect(first).toMatchObject({ exitCode: 0, succeeded: 2, failed: 0, barsWritten: 10 });
    const second = await runPrices(p, repo, ["NVDA", "SPY"]);
    expect(second.barsWritten).toBe(0);
    expect(repo.bars.get("NVDA")?.size).toBe(5);
    expect(repo.runs).toHaveLength(2);
    expect(repo.runs[0]).toMatchObject({ requested: 2, succeeded: 2, failed: 0, barsWritten: 10, stoppedReason: null });
  });
  it("updates a revised bar", async () => {
    const repo = new MemoryPriceRepository();
    await runPrices(provider(async () => series(3, 100)), repo, ["NVDA"]);
    const r = await runPrices(provider(async () => series(3, 101)), repo, ["NVDA"]);
    expect(r.barsWritten).toBe(3);
  });
  it("never overwrites existing bars with fewer bars", async () => {
    const repo = new MemoryPriceRepository();
    await runPrices(provider(async () => series(10)), repo, ["NVDA"]);
    const r = await runPrices(provider(async () => series(10).filter((_, i) => i % 2 === 0).map((b) => ({ ...b, close: b.close }))), repo, ["NVDA"]);
    expect(r.failed).toBe(1);
    expect(r.failures[0].reason).toMatch(/kept stored bars/);
    expect(repo.bars.get("NVDA")?.size).toBe(10);
  });
  it("exits non-zero when more than 10 percent of tickers fail", async () => {
    const tickers = Array.from({ length: 20 }, (_, i) => `T${i}`);
    const failing = (n: number) => provider(async (t) => { if (Number(t.slice(1)) < n) throw new Error("boom"); return series(3); });
    expect((await runPrices(failing(2), new MemoryPriceRepository(), tickers)).exitCode).toBe(0);
    const bad = await runPrices(failing(3), new MemoryPriceRepository(), tickers);
    expect(bad.exitCode).toBe(1);
    expect(bad.failures).toHaveLength(3);
  });
  it("records the daily-limit stop and marks the rest as not fetched", async () => {
    const repo = new MemoryPriceRepository();
    const p = provider(async (t) => { if (t === "B") throw new DailyLimitError(); return series(3); });
    const r = await runPrices(p, repo, ["A", "B", "C", "D"]);
    expect(r.succeeded).toBe(1);
    expect(r.failed).toBe(3);
    expect(r.exitCode).toBe(1);
    expect(r.stoppedReason).toMatch(/daily/i);
    expect(repo.runs[0].failures.map((f) => f.ticker)).toEqual(["B", "C", "D"]);
  });
  it("writes nothing in dry-run", async () => {
    const repo = new MemoryPriceRepository();
    const r = await runPrices(provider(async () => series(3)), repo, ["NVDA"], { dryRun: true });
    expect(r.succeeded).toBe(1);
    expect(repo.bars.size).toBe(0);
    expect(repo.runs).toHaveLength(0);
  });
  it("writes source twelvedata and the vendor symbol with each batch", async () => {
    const repo = new MemoryPriceRepository();
    await runPrices(provider(async () => series(3)), repo, ["NVDA", "SQ"]);
    expect(repo.provenance.get("NVDA")).toEqual({ sourceId: "twelvedata", vendorSymbol: "NVDA" });
    expect(repo.provenance.get("SQ")).toEqual({ sourceId: "twelvedata", vendorSymbol: "XYZ" });
  });
  it.skipIf(!process.env.TEST_DATABASE_URL)("stores source_id twelvedata, vendor symbol and fetch time in daily_bars (Postgres)", async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
    try {
      await pool.query("BEGIN");
      await pool.query("INSERT INTO instruments (ticker,name,sector,tier,source) VALUES ('ZZPV','Prov test','Test',NULL,'sample extension') ON CONFLICT (ticker) DO NOTHING");
      const repo = new PostgresPriceRepository(pool);
      await runPrices(provider(async () => series(3)), repo, ["ZZPV"]);
      const rows = await pool.query<{ source_id: string; vendor_symbol: string; fetched: boolean }>("SELECT source_id, vendor_symbol, fetched_at IS NOT NULL AS fetched FROM daily_bars WHERE ticker='ZZPV'");
      expect(rows.rows).toHaveLength(3);
      for (const row of rows.rows) expect(row).toEqual({ source_id: "twelvedata", vendor_symbol: "ZZPV", fetched: true });
      expect((await pool.query("SELECT count(*)::int AS n FROM daily_bars WHERE source_id IS NULL")).rows[0].n).toBe(0);
    } finally { await pool.query("ROLLBACK"); await pool.end(); }
  });
  it("logs first sight of each bar and no revisions when the same data is run twice", async () => {
    const repo = new MemoryPriceRepository();
    const p = provider(async () => series(4));
    await runPrices(p, repo, ["NVDA"]);
    const second = await runPrices(p, repo, ["NVDA"]);
    expect(second.barsRevised).toBe(0);
    expect(repo.revisions.filter((r) => r.kind === "superseded")).toHaveLength(0);
    expect(repo.revisions.filter((r) => r.kind === "first")).toHaveLength(4);
  });
  it("logs old values for one changed close and for a split-like scale of the whole history", async () => {
    const repo = new MemoryPriceRepository();
    await runPrices(provider(async () => series(5, 100)), repo, ["NVDA"]);
    const one = series(5, 100); one[2] = bar(one[2].date, 101);
    const r1 = await runPrices(provider(async () => one), repo, ["NVDA"]);
    expect(r1.barsRevised).toBe(1);
    expect(repo.runs[1].barsRevised).toBe(1);
    expect(repo.revisions.filter((r) => r.kind === "superseded").map((r) => [r.date, r.close])).toEqual([[one[2].date, 100]]);
    const r2 = await runPrices(provider(async () => series(5, 50)), repo, ["NVDA"]);
    expect(r2.barsRevised).toBe(5);
    expect(repo.revisions.filter((r) => r.kind === "superseded")).toHaveLength(6);
  });
  it("does not log revisions in dry-run", async () => {
    const repo = new MemoryPriceRepository();
    await runPrices(provider(async () => series(3)), repo, ["NVDA"], { dryRun: true });
    expect(repo.revisions).toHaveLength(0);
  });
  it.skipIf(!process.env.TEST_DATABASE_URL)("logs first sight and revisions, blocks UPDATE and DELETE, and counts bars_revised (Postgres)", async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
    const t = "ZZRV";
    const revisions = async (kind: string) => (await pool.query<{ bar_date: string; close: string }>("SELECT to_char(bar_date,'YYYY-MM-DD') AS bar_date, close::text FROM daily_bar_revisions WHERE ticker=$1 AND kind=$2 ORDER BY bar_date", [t, kind])).rows;
    try {
      await pool.query("INSERT INTO instruments (ticker,name,sector,tier,source) VALUES ($1,'Revision test','Test',NULL,'sample extension') ON CONFLICT (ticker) DO NOTHING", [t]);
      await pool.query("DELETE FROM daily_bars WHERE ticker=$1", [t]);
      const repo = new PostgresPriceRepository(pool);
      const first = await runPrices(provider(async () => series(5, 100)), repo, [t]);
      expect(first.barsRevised).toBe(0);
      const firstCount = (await revisions("first")).length;
      expect(firstCount).toBe(5);
      expect((await revisions("superseded"))).toHaveLength(0);

      const same = await runPrices(provider(async () => series(5, 100)), repo, [t]);
      expect(same.barsRevised).toBe(0);
      expect(await revisions("superseded")).toHaveLength(0);
      expect(await revisions("first")).toHaveLength(firstCount);

      const one = series(5, 100); one[2] = bar(one[2].date, 101);
      expect((await runPrices(provider(async () => one), repo, [t])).barsRevised).toBe(1);
      expect(await revisions("superseded")).toEqual([{ bar_date: one[2].date, close: "100" }]);

      const scaled = await runPrices(provider(async () => series(5, 50)), repo, [t]);
      expect(scaled.barsRevised).toBe(5);
      expect(await revisions("superseded")).toHaveLength(6);
      expect(await revisions("first")).toHaveLength(firstCount);
      expect((await pool.query("SELECT bars_revised FROM price_ingest_runs ORDER BY id DESC LIMIT 1")).rows[0].bars_revised).toBe(5);

      await expect(pool.query("UPDATE daily_bar_revisions SET close = 1 WHERE ticker=$1", [t])).rejects.toThrow(/immutable/);
      await expect(pool.query("DELETE FROM daily_bar_revisions WHERE ticker=$1", [t])).rejects.toThrow(/immutable/);
    } finally { await pool.end(); }
  });
});
