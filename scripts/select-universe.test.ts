import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCandidates, parseArgs, writeReport } from "./select-universe";
import type { Candidate } from "../src/universe/select";

const row = (ticker: string, growth: number): Candidate => ({ ticker, name: `${ticker} Corp`, sector: "Tech", cik: 1, forms: ["10-K"], core: ticker === "AAA",
  revenueQuarters: 6, yoyGrowthPct: growth, lastClose: 20, avgDollarVolume50: 20_000_000, barDays: 50 });

describe("select-universe script", () => {
  it("validates arguments", () => {
    expect(() => parseArgs([])).toThrow();
    expect(() => parseArgs(["--as-of", "2026-11-16", "--target", "10"])).toThrow();
    expect(() => parseArgs(["--as-of", "2026-11-16", "--write", "1"])).toThrow();
    expect(parseArgs(["--as-of", "2026-11-16"])).toMatchObject({ target: 150, out: "tmp/universe" });
  });
  it("writes the same files twice", () => {
    const input = [row("AAA", 1), row("BBB", 30), row("CCC", 20)];
    const out = mkdtempSync(join(tmpdir(), "d35-"));
    const first = writeReport(input, { asOf: "2026-11-16", out, target: 36 });
    const csv = readFileSync(join(out, "selected.csv"), "utf8");
    expect(writeReport([...input].reverse(), { asOf: "2026-11-16", out, target: 36 })).toEqual(first);
    expect(readFileSync(join(out, "selected.csv"), "utf8")).toBe(csv);
    expect(csv.split("\n")[1]).toContain("AAA");
    expect(readFileSync(join(out, "review.md"), "utf8")).toContain("Dry run. Nothing was written to the database.");
  });
  it("only issues SELECT statements", async () => {
    const sql: string[] = [];
    const db = { query: async (text: string) => { sql.push(text); return { rows: [] }; } } as never;
    expect(await loadCandidates(db, "2026-11-16", new Map())).toEqual([]);
    expect(sql.length).toBeGreaterThan(4);
    expect(sql.every((s) => /^\s*SELECT/i.test(s))).toBe(true);
  });
});
