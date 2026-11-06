/**
 * US-only selection inputs copied from the pre-market-universe tests (origin/main ac99665): src/universe/select.test.ts fixture(),
 * scripts/select-universe.test.ts row(), plus US code and floor edge cases. None carries exchange, currency or market cap, as before.
 * us-golden-expected.json holds what selectUniverse returned for them at that commit.
 */
import type { Candidate } from "../select";

export const base = (ticker: string, over: Partial<Candidate> = {}): Candidate => ({
  ticker, name: `${ticker} Corp`, sector: "Tech", cik: 1, forms: ["10-Q"], core: false, revenueQuarters: 8, yoyGrowthPct: 20,
  lastClose: 50, avgDollarVolume50: 50_000_000, barDays: 50, ...over,
});

export function fixture(): Candidate[] {
  const sectors = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const rows: Candidate[] = [];
  for (let i = 1; i <= 36; i++) rows.push(base(`C${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`, { core: true, sector: sectors[i % 8], yoyGrowthPct: i === 1 ? -5 : 10 }));
  for (let i = 0; i < 100; i++) rows.push(base(`G${String(i).padStart(3, "0")}`.replace(/\d/g, (d) => "ABCDEFGHIJ"[Number(d)]), { sector: sectors[i % 8], yoyGrowthPct: 20 + i }));
  for (let i = 0; i < 40; i++) rows.push(base(`L${String(i).padStart(2, "0")}`.replace(/\d/g, (d) => "ABCDEFGHIJ"[Number(d)]), { sector: sectors[i % 8], yoyGrowthPct: 1 + i / 10 }));
  for (let i = 0; i < 60; i++) rows.push(base(`X${String(i).padStart(2, "0")}`.replace(/\d/g, (d) => "ABCDEFGHIJ"[Number(d)]), { sector: "Crypto", yoyGrowthPct: 300 + i }));
  rows.push(base("LOWP", { lastClose: 5 }), base("LOWV", { avgDollarVolume50: 10_000_000 }), base("FORE", { forms: ["20-F", "6-K"] }),
    base("WARR", { name: "Foo Warrants" }), base("NEG", { yoyGrowthPct: -1 }), base("SHORT", { revenueQuarters: 3 }));
  return rows;
}

const row = (ticker: string, growth: number): Candidate => ({ ticker, name: `${ticker} Corp`, sector: "Tech", cik: 1, forms: ["10-K"], core: ticker === "AAA",
  revenueQuarters: 6, yoyGrowthPct: growth, lastClose: 20, avgDollarVolume50: 20_000_000, barDays: 50 });

const edges = (): Candidate[] => [
  base("BAC-PL"), base("XYZ.WS"), base("XYZ.U"), base("ABCW.R"), base("BRK.B"), base("BF-A"), base("TOOLONG"), base("abc"), base("A1B"),
  base("SUN"), base("SUNC"), base("NOFRM", { forms: [] }), base("EGHT", { forms: ["8-K"] }), base("NOBAR", { lastClose: null, avgDollarVolume50: null, barDays: 0 }),
  base("FEWB", { barDays: 49 }), base("NOGRW", { yoyGrowthPct: null }), base("NOREV", { revenueQuarters: 0 }), base("POOL", { revenueQuarters: 4, yoyGrowthPct: 35, lastClose: null, avgDollarVolume50: null, barDays: 0 }),
  base("TRST", { name: "Big Trust" }), base("CHEAP", { lastClose: 5.01 }), base("THIN", { avgDollarVolume50: 10_000_001 }), base("UNCL", { sector: "Unclassified", yoyGrowthPct: 90 }),
  base("CORE1", { core: true, forms: [], yoyGrowthPct: null }), base("DUPE"), base("DUPE", { yoyGrowthPct: 99 }),
];

export const GOLDEN_INPUTS: Record<string, () => Candidate[]> = {
  "d35-fixture": fixture,
  "d35-fixture-target-36": fixture,
  "select-universe-script": () => [row("AAA", 1), row("BBB", 30), row("CCC", 20)],
  "us-edges": edges,
};
