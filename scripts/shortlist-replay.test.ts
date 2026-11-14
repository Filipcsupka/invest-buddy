import { describe, expect, it } from "vitest";
import { ruleGroups } from "../src/i18n/rules";
import { sectorConcentration } from "../src/engine/shortlist";
import { formatReplay, largestGroup, parseArgs, runReplay } from "./shortlist-replay";

const hits = (...met: string[]) => ruleGroups.flatMap((group) => group.rules).map((rule) => ({ id: rule.id, label: rule.id, detail: "", points: rule.points, matched: met.includes(rule.id), unknown: rule.id === "catalyst" }));
const bars = (end: number) => Array.from({ length: 64 }, (_, i) => { const close = 50 + (end - 50) * i / 63; return { date: "", open: close, close, high: close * 1.01, low: close * 0.99, volume: 1_000_000 }; });
const audit = (ticker: string, end: number, met: string[]) => ({ ticker, asOf: "2026-11-10", state: "Setup met (>=18)", total: 17, ruleHits: hits(...met), inputs: { bars: bars(end) } });
const setup = ["revenue-acceleration", "earnings", "above-ma", "uptrend", "green-volume", "dip"];

function fakeDb(snapshot: { asOf: string; weights: { symbol: string; weightPercent: number }[] } | null = null) {
  const sql: string[] = [];
  const client = {
    query: async (text: string) => {
      sql.push(text);
      if (text.includes("FROM portfolio_snapshots")) return { rows: snapshot ? [{ snapshot }] : [] };
      if (text.startsWith("SELECT DISTINCT s.as_of")) return { rows: [{ as_of: "2026-11-10" }] };
      if (text.includes("FROM score_results s JOIN instruments i")) return { rows: [
        { ticker: "LEAD", name: "Lead", sector: "Unclassified", tier: 1, source: "guide", list: "core", audit: audit("LEAD", 120, setup) },
        { ticker: "LAG", name: "Lag", sector: "Biotech", tier: 1, source: "guide", list: "core", audit: audit("LAG", 50, setup) },
        ...Array.from({ length: 8 }, (_, i) => ({ ticker: `W${i}`, name: "W", sector: "Unclassified", tier: 1, source: "guide", list: "core", audit: audit(`W${i}`, 60 + i, ["revenue-acceleration"]) })),
      ] };
      if (text.includes("FROM instruments i")) return { rows: [
        { ticker: "LEAD", instrument_sector: "Unclassified", vendor_sector: "Technology", vendor_industry: "Semiconductors", currency: "USD" },
        { ticker: "NVDA", instrument_sector: "AI & semiconductors", vendor_sector: "Technology", vendor_industry: "Semiconductors", currency: "USD" },
        { ticker: "ISRG", instrument_sector: "Unclassified", vendor_sector: "Healthcare", vendor_industry: "Medical Instruments & Supplies", currency: "USD" },
      ] };
      if (text.includes("earnings_calendar_snapshots")) return { rows: text.includes("AS \"latestPull\"") ? [{ latestPull: "2026-11-09" }] : [{ ticker: "LEAD", observedOn: "2026-11-09", reportDate: "2026-11-12", fiscalDateEnding: null, timeOfDay: null }] };
      return { rows: [] };
    },
    release: () => undefined,
  };
  return { db: { connect: async () => client } as never, sql };
}

describe("shortlist replay", () => {
  it("parses dates, days and names, and rejects anything else", () => {
    expect(parseArgs([])).toEqual({ from: null, to: null, days: 5, names: false, top: 6 });
    expect(parseArgs(["--top", "8"]).top).toBe(8);
    expect(() => parseArgs(["--top", "0"])).toThrow("--top");
    expect(parseArgs(["--from", "2026-11-07", "--to", "2026-11-10", "--names"])).toMatchObject({ from: "2026-11-07", to: "2026-11-10", names: true });
    expect(() => parseArgs(["--from", "11/07"])).toThrow("--from needs a date");
    expect(() => parseArgs(["--days", "0"])).toThrow("--days");
    expect(() => parseArgs(["--write"])).toThrow("Unknown argument");
  });

  it("runs inside a rolled-back read-only transaction and writes nothing", async () => {
    const { db, sql } = fakeDb();
    const out = await runReplay(db, parseArgs(["--names"]));
    expect(sql[0]).toBe("BEGIN TRANSACTION READ ONLY");
    expect(sql.at(-1)).toBe("ROLLBACK");
    expect(sql.some((text) => /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE)\b/i.test(text))).toBe(false);
    expect(out).toContain("| 2026-11-10 | 10 | 2 | 2 | 1 | 1 | 1 |");
    expect(out).toContain("2026-11-10 kept: 1. LEAD (Technology)");
    expect(out).toContain("2026-11-10 dropped: LAG RS_LOW");
  });

  it("prints the top names without a lens when no portfolio snapshot is stored", async () => {
    const { db } = fakeDb();
    const out = await runReplay(db, parseArgs([]));
    expect(out).toContain("| Date | Kept | Model snapshot | Themes above cap |");
    expect(out).toContain("| 2026-11-10 | 1 | none | no lens | no lens | 0 | LEAD (ai-semis) | no lens |");
  });

  it("applies the model portfolio lens from the newest snapshot on or before the date", async () => {
    const { db, sql } = fakeDb({ asOf: "2026-11-07", weights: [{ symbol: "NVDA", weightPercent: 60 }, { symbol: "ISRG", weightPercent: 40 }] });
    const out = await runReplay(db, parseArgs(["--names"]));
    expect(sql.find((text) => text.includes("FROM portfolio_snapshots"))).toContain("as_of <= $1::date");
    expect(out).toContain("| 2026-11-10 | 1 | 2026-11-07 | ai-semis 60%, healthcare 40% | Technology 60%, Healthcare 40% | 0 | LEAD (ai-semis, over) | none |");
    expect(out).toContain("Model portfolio 2026-11-07 by theme: ai-semis 60%, healthcare 40%.");
    expect(out).toContain("2026-11-10 lens order: 1. LEAD (ai-semis, over)");
    expect(sql.some((text) => /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE)\b/i.test(text))).toBe(false);
  });

  it("formats an empty replay", () => {
    expect(formatReplay([])).toContain("| Date | Scored |");
  });
});

describe("largest sector group", () => {
  const rows = (spec: [string, number][]) => spec.flatMap(([sector, n]) => Array.from({ length: n }, (_, i) => ({ ticker: `${sector}${i}`, sector: sector as never })));
  it("reports Unknown when it is the biggest bucket, though the lens lists it last", () => {
    expect(largestGroup(sectorConcentration(rows([["Technology", 2], ["Unknown", 5]])))).toMatchObject({ sector: "Unknown", count: 5 });
  });
  it("prefers a named group on a tie and handles an empty list", () => {
    expect(largestGroup(sectorConcentration(rows([["Unknown", 3], ["Energy", 3]])))).toMatchObject({ sector: "Energy" });
    expect(largestGroup(sectorConcentration([]))).toBeNull();
  });
});
