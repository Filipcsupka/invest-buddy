import { describe, expect, it } from "vitest";
import { parseAutoPromoteArgs, selectAutoCandidates } from "./discovery-auto-promote";

const fake = (done: number, rows: { symbol: string; name: string; rule_score: number; rule_state: string; week_start: string }[]) =>
  ({ query: async (sql: string) => (sql.includes("count(*)") ? { rows: [{ n: String(done) }] } : { rows }) }) as never;
const row = (symbol: string, rule_score: number, name = `${symbol} Inc.`) => ({ symbol, name, rule_score, rule_state: "Watch", week_start: "2026-10-19" });

describe("discovery auto-promote", () => {
  it("parses caps and dry run, rejects unknown options", () => {
    expect(parseAutoPromoteArgs([])).toEqual({ dryRun: false, cap: 2, weeklyCap: 6 });
    expect(parseAutoPromoteArgs(["--dry-run", "--cap", "1", "--weekly-cap", "3"])).toEqual({ dryRun: true, cap: 1, weeklyCap: 3 });
    expect(() => parseAutoPromoteArgs(["--cap", "x"])).toThrow();
    expect(() => parseAutoPromoteArgs(["--all"])).toThrow();
  });
  it("takes the best rule scores up to the run cap", async () => {
    const out = await selectAutoCandidates(fake(0, [row("AAA", 12), row("BBB", 16), row("CCC", 13)]), "2026-10-20", 2, 6);
    expect(out.map(r => r.symbol)).toEqual(["BBB", "CCC"]);
  });
  it("stops at the weekly cap and counts what was already promoted this week", async () => {
    expect(await selectAutoCandidates(fake(6, [row("AAA", 12)]), "2026-10-20", 2, 6)).toEqual([]);
    expect((await selectAutoCandidates(fake(5, [row("AAA", 12), row("BBB", 13)]), "2026-10-20", 2, 6)).map(r => r.symbol)).toEqual(["BBB"]);
  });
  it("skips non-common securities by name", async () => {
    const out = await selectAutoCandidates(fake(0, [row("XYZW", 14, "XYZ Acquisition Corp Warrants"), row("GOOD", 12)]), "2026-10-20", 2, 6);
    expect(out.map(r => r.symbol)).toEqual(["GOOD"]);
  });
});
