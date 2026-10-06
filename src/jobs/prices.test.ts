import { describe, expect, it } from "vitest";
import type { OHLCV } from "../engine";
import { MemoryPriceRepository } from "../db/prices";
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
});
