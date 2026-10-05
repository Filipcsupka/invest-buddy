import { describe, expect, it } from "vitest";
import { buildJudgeInput, pickSymbols, shapeSymbol, signalsFor } from "./judge-input";
import { baselineSchema } from "./portfolio-baseline";
import { sampleBaseline } from "../ideas/fixtures";

const bars = Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, close: 100 + i, high: 101 + i }));
const audit = (state: string, total: number, extra: object = {}) => ({ ticker: "X", asOf: "2026-10-05", technical: 8, fundamentals: 7, macro: 3, total, state, pullbackInUptrend: false, invalidReasons: [], inputs: { bars }, ruleHits: [{ id: "above_ma", matched: true }, { id: "dip", matched: false }], ...extra });
const row = (ticker: string, state: string, total: number, extra: object = {}) => ({ ticker, name: ticker, sector: "AI", tier: 1, audit: audit(state, total, { ticker, ...extra }) }) as never;
const c = (field: string, over: object = {}) => ({ symbol: "X", field, value: true, agreement: "agree", verified: true, reason: "r", carried_from: null, evidence_refs: [{ url: `https://sec.gov/${field}`, publishedAt: "2026-10-01", quote: "q" }], ...over }) as never;

describe("judge input", () => {
  it("sends held names, names with an earlier idea and Setup or Watch names only", () => {
    const rows = [row("A", "Setup met (>=18)", 19), row("B", "Ignore", 5), row("C", "Wait", 13), row("D", "Watch", 16), row("E", "Ignore", 4), row("F", "Criteria broken", 0)];
    expect(pickSymbols(rows, new Set(["E"]), new Set(["F"])).map((r) => r.ticker)).toEqual(["E", "A", "D", "F"]);
  });
  it("flags carried fields and keeps evidence urls of the symbol", () => {
    const s = shapeSymbol(row("X", "Watch", 16, { expiredFields: ["epsBeat"] }), [c("epsBeat", { carried_from: "2026-09-23", value: null }), c("guidanceRaised")], { ...sampleBaseline, positions: [{ symbol: "X", valueEur: 300 }] }, 1200, null, new Set(["https://sec.gov/epsBeat", "https://sec.gov/guidanceRaised"]));
    expect(s.carriedFrom).toBe("2026-09-23");
    expect(s.expiredFields).toEqual(["epsBeat"]);
    expect(s.held).toEqual({ valueEur: 300, weightPercent: 25 });
    expect(s.technicals).toBeNull();
    expect(s.evidence.map((e) => e.url)).toEqual(["https://sec.gov/epsBeat", "https://sec.gov/guidanceRaised"]);
    expect(s.matchedRules).toEqual(["above_ma"]);
  });
  it("builds the input from the database rows", async () => {
    const calls: string[] = [];
    const pool = { query: async (sql: string) => {
      calls.push(sql);
      if (sql.includes("FROM portfolio_baseline")) return { rows: [{ as_of: "2026-10-05", source: "manual", cash_eur: "600.00", monthly_contribution_eur: "200", positions: sampleBaseline.positions }] };
      if (sql.includes("FROM trade_ideas")) return { rows: [] };
      if (sql.includes("FROM score_results")) return { rows: [row("NVDA", "Setup met (>=18)", 19), row("ZZZ", "Ignore", 2)] };
      if (sql.includes("FROM source_documents")) return { rows: [{ url: "https://sec.gov/epsBeat" }] };
      if (sql.includes("FROM daily_bars")) return { rows: Array.from({ length: 260 }, (_, i) => ({ ticker: "NVDA", bar_date: new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10), open: String(50 + i * 0.3), high: String(51 + i * 0.3), low: String(49 + i * 0.3), close: String(50 + i * 0.3), volume: "1000000" })) };
      return { rows: [c("epsBeat", { symbol: "NVDA" }), c("revenueAccelerating", { symbol: "NVDA" })] };
    } };
    const input = await buildJudgeInput(pool as never, "2026-10-05", new Date("2026-10-05T20:00:00Z"));
    expect(input.symbols.map((s) => s.symbol)).toEqual(["NVDA"]);
    expect(input.portfolio?.cashEur).toBe(600);
    expect(input.portfolio?.investedEur).toBe(3030);
    expect(input.benchmark.symbol).toBe("CSPX");
    expect(calls.some((s) => s.includes("carried_from"))).toBe(true);
    expect(input.ruleConfigVersion).toBe("2026-10-05.1");
    expect(input.symbols[0].technicals?.regime).toBe("uptrend");
    expect(input.symbols[0].evidence.map((e) => e.url)).toEqual(["https://sec.gov/epsBeat"]);
    expect(calls.some((sql) => sql.includes("d.meta->>'display_allowed' = 'true'"))).toBe(true);
    expect(JSON.stringify(input)).not.toContain("costEur");
    expect(JSON.stringify(input.symbols)).not.toMatch(/"bars"|"open"/);
    const sig = input.signals.find((x) => x.symbol === "NVDA")!;
    expect(sig.action).toBe("HOLD");
    expect(sig.signature).toMatch(/^HOLD\|/);
  });
  it("does not pass a display_allowed=false or missing document to the judge", () => {
    const rows = [c("epsBeat", { evidence_refs: [{ url: "https://sec.gov/cleared" }, { url: "https://sec.gov/restricted" }, { url: "https://sec.gov/legacy" }] })];
    const symbol = shapeSymbol(row("X", "Watch", 16), rows, null, 0, null, new Set(["https://sec.gov/cleared"]));
    expect(symbol.evidence.map((e) => e.url)).toEqual(["https://sec.gov/cleared"]);
  });
  it("signals ignore cost basis and are stable for the same symbols in any order", () => {
    const rows = ([row("A", "Watch", 16), row("B", "Watch", 17)] as unknown as (Parameters<typeof shapeSymbol>[0] & { ticker: string })[]).map((r) => shapeSymbol(r, [c("epsBeat", { symbol: r.ticker }), c("revenueAccelerating", { symbol: r.ticker })], sampleBaseline, 3030, null));
    const p = { ...sampleBaseline, investedEur: 3030 };
    expect(signalsFor([...rows].reverse(), p)).toEqual(signalsFor(rows, p));
  });
  it("accepts the baseline shape, hand filled or from IBKR, and rejects loose data", () => {
    expect(baselineSchema.safeParse(sampleBaseline).success).toBe(true);
    expect(baselineSchema.safeParse({ ...sampleBaseline, source: "ibkr-mcp" }).success).toBe(true);
    expect(baselineSchema.safeParse({ ...sampleBaseline, cashEur: -1 }).success).toBe(false);
    expect(baselineSchema.safeParse({ ...sampleBaseline, positions: [{ symbol: "nvda", valueEur: 1 }] }).success).toBe(false);
    expect(baselineSchema.safeParse({ ...sampleBaseline, accountId: "U1" }).success).toBe(false);
  });
});
