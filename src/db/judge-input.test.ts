import { describe, expect, it } from "vitest";
import { buildJudgeInput, collectEvidence, MAX_EVIDENCE_PER_SYMBOL, pickSymbols, shapeSymbol, signalsFor } from "./judge-input";
import { baselineSchema } from "./portfolio-baseline";
import { sampleBaseline } from "../ideas/fixtures";
import { SIGNAL_RULES } from "../engine/signals";

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
      if (sql.includes("FROM source_documents") && sql.includes("doc_type")) return { rows: [{ symbol: "NVDA", doc_type: "8-K EX-99.1", url: "https://sec.gov/ex991", published_at: "2026-09-30" }, { symbol: "NVDA", doc_type: "10-Q", url: "https://sec.gov/10q", published_at: "2026-08-26" }] };
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
    expect(input.ruleConfigVersion).toBe(SIGNAL_RULES.version);
    expect(input.symbols[0].technicals?.regime).toBe("uptrend");
    expect(input.symbols[0].evidence.map((e) => [e.url, e.label])).toEqual([["https://sec.gov/epsBeat", null], ["https://sec.gov/ex991", "Earnings release"], ["https://sec.gov/10q", "10-Q"]]);
    expect(calls.some((sql) => sql.includes("d.meta->>'display_allowed' = 'true'"))).toBe(true);
    expect(JSON.stringify(input)).not.toContain("costEur");
    expect(JSON.stringify(input.symbols)).not.toMatch(/"bars"|"open"/);
    const sig = input.signals.find((x) => x.symbol === "NVDA")!;
    expect(sig.action).toBe("WATCH");
    expect(sig.signature).toMatch(/^WATCH\|/);
  });
  it("does not pass a display_allowed=false or missing document to the judge", () => {
    const rows = [c("epsBeat", { evidence_refs: [{ url: "https://sec.gov/cleared" }, { url: "https://sec.gov/restricted" }, { url: "https://sec.gov/legacy" }] })];
    const symbol = shapeSymbol(row("X", "Watch", 16), rows, null, 0, null, new Set(["https://sec.gov/cleared"]));
    expect(symbol.evidence.map((e) => e.url)).toEqual(["https://sec.gov/cleared"]);
  });
  it("collects evidence from every verified finding, SEC XBRL and Form 4 included, and labels it", () => {
    const xbrl = "https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json";
    const f4 = "https://www.sec.gov/Archives/edgar/data/1/form4.xml";
    const rows = [
      c("revenueAccelerating", { agreement: "xbrl_override", evidence_refs: [{ url: xbrl, publishedAt: "2026-10-05" }] }),
      c("insiderOrInstitutionalBuying", { agreement: "xbrl_override", evidence_refs: [{ url: f4, publishedAt: "2026-09-20", fiscalPeriod: "Form 4 trades, 90 days to 2026-10-01" }] }),
      c("epsBeat", { agreement: "data_rule", evidence_refs: [{ url: "https://www.alphavantage.co/query?function=EARNINGS&symbol=X#2026-0", publishedAt: "2026-10-01" }] }),
      c("dataTailwind", { agreement: "data_rule", evidence_refs: [{ url: "https://fred.stlouisfed.org/series/DGS10" }, { url: "https://www.cboe.com/vix" }] }),
      c("guidanceRaised", { agreement: "disputed", verified: false, evidence_refs: [{ url: "https://sec.gov/disputed", publishedAt: "2026-10-04" }] }),
      c("productCatalyst", { agreement: "single", verified: false, evidence_refs: [{ url: "https://sec.gov/single", publishedAt: "2026-10-04" }] }),
    ];
    const ev = collectEvidence(rows, new Set([f4, "https://sec.gov/disputed", "https://sec.gov/single"]));
    expect(ev.map((e) => [e.url, e.label])).toEqual([[xbrl, "SEC XBRL"], [f4, "Form 4"]]);
  });
  it("adds earnings release and 10-Q, dedupes by url, sorts newest first and caps", () => {
    const rows = Array.from({ length: 10 }, (_, i) => c(`f${i}`, { evidence_refs: [{ url: `https://sec.gov/d${i}`, publishedAt: `2026-09-${String(10 + i).padStart(2, "0")}` }, { url: "https://sec.gov/dup", publishedAt: "2026-09-01" }] }));
    const cleared = new Set([...rows.flatMap((r) => (r as { evidence_refs: { url: string }[] }).evidence_refs.map((e) => e.url)), "https://sec.gov/ex991"]);
    const ev = collectEvidence(rows, cleared, [{ url: "https://sec.gov/ex991", docType: "8-K EX-99.1", publishedAt: "2026-10-02" }, { url: "https://sec.gov/10q", docType: "10-Q", publishedAt: "2026-08-03" }, { url: "https://sec.gov/d3", docType: "10-Q", publishedAt: "2026-09-13" }]);
    expect(ev).toHaveLength(MAX_EVIDENCE_PER_SYMBOL);
    expect(ev[0]).toMatchObject({ url: "https://sec.gov/ex991", label: "Earnings release" });
    expect(new Set(ev.map((e) => e.url)).size).toBe(ev.length);
    expect(ev.map((e) => e.publishedAt)).toEqual([...ev.map((e) => e.publishedAt)].sort().reverse());
    expect(ev.map((e) => e.url)).not.toContain("https://sec.gov/10q");
    expect(collectEvidence([], new Set(), [{ url: "https://sec.gov/10q", docType: "10-Q", publishedAt: "2026-08-03" }])[0].label).toBe("10-Q");
  });
  it("signals ignore cost basis and are stable for the same symbols in any order", () => {
    const rows = ([row("A", "Watch", 16), row("B", "Watch", 17)] as unknown as (Parameters<typeof shapeSymbol>[0] & { ticker: string })[]).map((r) => shapeSymbol(r, [c("epsBeat", { symbol: r.ticker }), c("revenueAccelerating", { symbol: r.ticker })], sampleBaseline, 3030, null));
    const p = { ...sampleBaseline, investedEur: 3030 };
    expect(signalsFor([...rows].reverse(), p)).toEqual(signalsFor(rows, p));
  });
  it("the baseline never changes a signature: it holds the action, ratings and tier, not the EUR band", () => {
    const rows = ([row("A", "Setup met (>=18)", 19), row("B", "Watch", 16)] as unknown as (Parameters<typeof shapeSymbol>[0] & { ticker: string })[]).map((r) => shapeSymbol(r, [c("epsBeat", { symbol: r.ticker }), c("revenueAccelerating", { symbol: r.ticker })], sampleBaseline, 3030, null));
    const key = (s: ReturnType<typeof signalsFor>[number]) => [s.symbol, s.action, s.sizeTier, s.signature];
    expect(signalsFor(rows, null).map(key)).toEqual(signalsFor(rows, { ...sampleBaseline, investedEur: 3030 }).map(key));
    expect(signalsFor(rows.map((s) => ({ ...s, held: { valueEur: 300, weightPercent: 10 } })), { ...sampleBaseline, investedEur: 3030 }).map(key)).toEqual(signalsFor(rows.map((s) => ({ ...s, held: null })), null).map(key));
    for (const s of signalsFor(rows, null)) {
      expect(s.signature).toBe(`${s.action}|${s.ratings.company}|${s.ratings.entry}|${s.ratings.catalyst}|${s.sizeTier}`);
      expect([s.amountMinEur, s.amountMaxEur]).toEqual([0, 0]);
    }
  });
  it("accepts the baseline shape, hand filled or from IBKR, and rejects loose data", () => {
    expect(baselineSchema.safeParse(sampleBaseline).success).toBe(true);
    expect(baselineSchema.safeParse({ ...sampleBaseline, source: "ibkr-mcp" }).success).toBe(true);
    expect(baselineSchema.safeParse({ ...sampleBaseline, cashEur: -1 }).success).toBe(false);
    expect(baselineSchema.safeParse({ ...sampleBaseline, positions: [{ symbol: "nvda", valueEur: 1 }] }).success).toBe(false);
    expect(baselineSchema.safeParse({ ...sampleBaseline, accountId: "U1" }).success).toBe(false);
  });
});
