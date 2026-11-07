import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applySelection, loadCandidates, parseArgs, selectionSummary, writeReport } from "./select-universe";
import { selectUniverse } from "../src/universe/select";
import type { Candidate } from "../src/universe/select";

const row = (ticker: string, growth: number): Candidate => ({ ticker, name: `${ticker} Corp`, sector: "Tech", cik: 1, forms: ["10-K"], core: ticker === "AAA",
  revenueQuarters: 6, yoyGrowthPct: growth, lastClose: 20, avgDollarVolume50: 20_000_000, barDays: 50 });

describe("select-universe script", () => {
  it("validates arguments", () => {
    expect(() => parseArgs([])).toThrow();
    expect(() => parseArgs(["--as-of", "2026-11-16", "--target", "10"])).toThrow();
    expect(() => parseArgs(["--as-of", "2026-11-16", "--write", "1"])).toThrow();
    expect(parseArgs(["--as-of", "2026-11-16"])).toMatchObject({ target: 150, out: "tmp/universe" });
    expect(parseArgs(["--dry-run", "--as-of", "2026-11-16"]).dryRun).toBe(true);
    expect(parseArgs(["--as-of", "2026-11-16", "--target", "5000"]).target).toBe(5000);
    expect(() => parseArgs(["--as-of", "2026-11-16", "--target", "5001"])).toThrow();
  });
  it("needs actor, reason and a cap to apply", () => {
    const base = ["--as-of", "2026-11-06", "--target", "500"];
    expect(() => parseArgs([...base, "--apply"])).toThrow();
    expect(() => parseArgs([...base, "--actor", "owner"])).toThrow(/needs --apply/);
    expect(() => parseArgs([...base, "--apply", "--dry-run", "--actor", "owner", "--reason", "E8", "--max-adds", "10"])).toThrow();
    expect(() => parseArgs([...base, "--apply", "--actor", "owner", "--reason", "E8", "--max-adds", "10", "--date", "2026-11-05"])).toThrow();
    expect(() => parseArgs([...base, "--apply", "--actor", "owner", "--reason", "E8", "--max-adds", "10", "--input", "x.json"])).toThrow();
    expect(parseArgs([...base, "--apply", "--actor", "owner", "--reason", "E8", "--max-adds", "10", "--date", "2026-11-07"]))
      .toMatchObject({ dryRun: false, apply: { actor: "owner", reason: "E8", maxAdds: 10, date: "2026-11-07" } });
  });
  it("summarises counts per exchange and reason", () => {
    const input = [row("AAA", 1), row("BBB", 30), { ...row("SAP.XETRA", 10), exchange: "XETRA", securityType: null, revenueQuarters: 0 }];
    const summary = selectionSummary(input, selectUniverse(input, { target: 36 }));
    expect(summary).toMatchObject({ candidates: 3, selected: 2, adds: 1, selectedByExchange: { US: 2 }, excludedByReason: { no_revenue_history: 1 },
      excludedByExchangeAndReason: { "XETRA:no_revenue_history": 1 } });
  });
  it("adds proposed names to extended up to the cap and skips members", async () => {
    const sql: { text: string; params?: unknown[] }[] = [];
    const client = { query: async (text: string, params?: unknown[]) => { sql.push({ text, params }); return { rows: [], rowCount: 0 }; }, release: () => undefined };
    const db = { connect: async () => client, query: async () => ({ rows: [{ ticker: "BBB" }] }) } as never;
    const selection = selectUniverse([row("AAA", 1), row("BBB", 30), row("CCC", 20), row("DDD", 10)], { target: 36 });
    const result = await applySelection(db, selection, { actor: "owner", reason: "E8", maxAdds: 1, date: "2026-11-07" });
    expect(result).toEqual({ added: ["CCC"], skipped: ["BBB"], failed: [] });
    const insert = sql.find((q) => q.text.includes("INSERT INTO universe_membership"));
    expect(insert?.params).toEqual(["CCC", "extended", null, "2026-11-07", "E8", expect.any(String), "owner", "US"]);
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
