import { describe, expect, it } from "vitest";
import { ruleGroups } from "../src/i18n/rules";
import { formatReplay, parseArgs, runReplay } from "./shortlist-replay";

const hits = (...met: string[]) => ruleGroups.flatMap((group) => group.rules).map((rule) => ({ id: rule.id, label: rule.id, detail: "", points: rule.points, matched: met.includes(rule.id), unknown: rule.id === "catalyst" }));
const bars = (end: number) => Array.from({ length: 64 }, (_, i) => { const close = 50 + (end - 50) * i / 63; return { date: "", open: close, close, high: close * 1.01, low: close * 0.99, volume: 1_000_000 }; });
const audit = (ticker: string, end: number, met: string[]) => ({ ticker, asOf: "2026-11-10", state: "Setup met (>=18)", total: 17, ruleHits: hits(...met), inputs: { bars: bars(end) } });
const setup = ["revenue-acceleration", "earnings", "above-ma", "uptrend", "green-volume", "dip"];

function fakeDb() {
  const sql: string[] = [];
  const client = {
    query: async (text: string) => {
      sql.push(text);
      if (text.startsWith("SELECT DISTINCT s.as_of")) return { rows: [{ as_of: "2026-11-10" }] };
      if (text.includes("FROM score_results s JOIN instruments i")) return { rows: [
        { ticker: "LEAD", name: "Lead", sector: "Unclassified", tier: 1, source: "guide", list: "core", audit: audit("LEAD", 120, setup) },
        { ticker: "LAG", name: "Lag", sector: "Biotech", tier: 1, source: "guide", list: "core", audit: audit("LAG", 50, setup) },
        ...Array.from({ length: 8 }, (_, i) => ({ ticker: `W${i}`, name: "W", sector: "Unclassified", tier: 1, source: "guide", list: "core", audit: audit(`W${i}`, 60 + i, ["revenue-acceleration"]) })),
      ] };
      if (text.includes("FROM instruments i")) return { rows: [{ ticker: "LEAD", instrument_sector: "Unclassified", vendor_sector: "Technology", vendor_industry: "Semiconductors", currency: "USD" }] };
      if (text.includes("earnings_calendar_snapshots")) return { rows: text.includes("AS \"latestPull\"") ? [{ latestPull: "2026-11-09" }] : [{ ticker: "LEAD", observedOn: "2026-11-09", reportDate: "2026-11-12", fiscalDateEnding: null, timeOfDay: null }] };
      return { rows: [] };
    },
    release: () => undefined,
  };
  return { db: { connect: async () => client } as never, sql };
}

describe("shortlist replay", () => {
  it("parses dates, days and names, and rejects anything else", () => {
    expect(parseArgs([])).toEqual({ from: null, to: null, days: 5, names: false });
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

  it("formats an empty replay", () => {
    expect(formatReplay([])).toContain("| Date | Scored |");
  });
});
