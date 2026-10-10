import { describe, expect, it } from "vitest";
import type pg from "pg";
import { insiderFromFact, insiderMinNetBuyUsd, netBuyFromTransactions, DEFAULT_INSIDER_MIN_NET_BUY_USD, type InsiderTxRow } from "./insider";
import { loadInsider } from "../db/collectors";
import { reconcileField, type AgentFinding } from "../jobs/reconcile";

const asOf = "2026-10-06";
const buyDoc = (date = "2026-09-20", url = "https://www.sec.gov/Archives/edgar/data/1/a.xml") => ({ url, publishedAt: date, trades: [{ date, code: "P", shares: 1000 }] });
const fact = (value: unknown, date = "2026-10-05") => ({ asOf: date, value });
const agent = (name: "claude" | "codex", value: boolean | null): AgentFinding => ({ runId: `${name}-1`, runner: { name }, fundamentals: { insiderOrInstitutionalBuying: value }, evidence: { items: [] }, confidence: "high" });

describe("insiderFromFact", () => {
  it("is true for net buying above the threshold and cites the Form 4 urls", () => {
    const result = insiderFromFact(fact({ netShares: 5000, netDollars: 250_000 }), [buyDoc(), buyDoc("2026-09-25", "https://www.sec.gov/b.xml")], asOf);
    expect(result).toMatchObject({ value: true });
    expect(result?.refs.map((ref) => ref.url)).toEqual(["https://www.sec.gov/b.xml", "https://www.sec.gov/Archives/edgar/data/1/a.xml"]);
    expect(result?.refs[0]).toMatchObject({ claim: "fundamentals.insiderOrInstitutionalBuying", publishedAt: "2026-09-25" });
  });
  it("is false for net selling, zero buying, and buying below the threshold", () => {
    expect(insiderFromFact(fact({ netShares: -900, netDollars: -90_000 }), [], asOf)?.value).toBe(false);
    expect(insiderFromFact(fact({ netShares: 0, netDollars: 0 }), [], asOf)?.value).toBe(false);
    expect(insiderFromFact(fact({ netShares: 100, netDollars: DEFAULT_INSIDER_MIN_NET_BUY_USD }), [buyDoc()], asOf)?.value).toBe(false);
  });
  it("is unknown without a usable fact, with a stale fact, or when the dollars are only a lower bound", () => {
    expect(insiderFromFact(null, [], asOf)).toBeNull();
    expect(insiderFromFact(fact({ netShares: 1, netDollars: 1_000_000 }, "2026-09-06"), [buyDoc()], asOf)).toBeNull();
    expect(insiderFromFact(fact({ netShares: 1, netDollars: 1_000_000 }, "2026-10-10"), [buyDoc()], asOf)).toBeNull();
    // collect runs after the session it describes, so a fact dated up to 3 days after the scoring date still counts
    expect(insiderFromFact(fact({ netShares: -500, netDollars: -1000 }, "2026-10-07"), [], asOf)?.value).toBe(false);
    expect(insiderFromFact(fact({ netShares: "x" }), [], asOf)).toBeNull();
    expect(insiderFromFact(fact({ netShares: 500, netDollars: 1000, dollarsComplete: false }), [buyDoc()], asOf)?.value).toBeNull();
    expect(insiderFromFact(fact({ netShares: -500, netDollars: -1000, dollarsComplete: false }), [], asOf)?.value).toBe(false);
  });
  it("does not say true when no purchase filing inside 60 days can be cited", () => {
    const old = insiderFromFact(fact({ netShares: 5000, netDollars: 250_000 }), [buyDoc("2026-07-01")], asOf);
    expect(old).toMatchObject({ value: null, refs: [] });
    const sellOnly = { url: "https://www.sec.gov/s.xml", publishedAt: "2026-09-30", trades: [{ date: "2026-09-30", code: "S", shares: 10 }] };
    expect(insiderFromFact(fact({ netShares: 5000, netDollars: 250_000 }), [sellOnly], asOf)?.value).toBeNull();
  });
  it("reads the threshold from the environment and falls back to the default", () => {
    expect(insiderMinNetBuyUsd({ INSIDER_MIN_NET_BUY_USD: "5000" })).toBe(5000);
    expect(insiderMinNetBuyUsd({ INSIDER_MIN_NET_BUY_USD: "abc" })).toBe(DEFAULT_INSIDER_MIN_NET_BUY_USD);
    expect(insiderMinNetBuyUsd({})).toBe(DEFAULT_INSIDER_MIN_NET_BUY_USD);
  });
});

describe("reconcile with Form 4 data", () => {
  const buy = insiderFromFact(fact({ netShares: 5000, netDollars: 250_000 }), [buyDoc()], asOf)!;
  const sell = insiderFromFact(fact({ netShares: -5, netDollars: -500_000 }), [], asOf)!;
  it("confirms an agreeing agent and keeps agree", async () => {
    const verify = async () => true;
    const withEvidence = [agent("claude", true), agent("codex", true)].map((item) => ({ ...item, evidence: { items: [{ claim: "fundamentals.insiderOrInstitutionalBuying", url: "https://x.example/a", publishedAt: "2026-09-20", fiscalPeriod: "Q3", quote: "bought" }] } }));
    const result = await reconcileField("NVDA", "insiderOrInstitutionalBuying", asOf, withEvidence, verify, null, buy);
    expect(result).toMatchObject({ value: true, verified: true, agreement: "agree" });
    expect(result.reason).toContain("confirmed by SEC data");
    expect(result.evidenceRefs.map((ref) => ref.url)).toEqual(["https://www.sec.gov/Archives/edgar/data/1/a.xml"]);
  });
  it("sources the flag when agents are single or unknown", async () => {
    const result = await reconcileField("NVDA", "insiderOrInstitutionalBuying", asOf, [agent("claude", null)], async () => false, null, buy);
    expect(result).toMatchObject({ value: true, verified: true, agreement: "xbrl_override" });
  });
  it("overrides a conflicting agent claim and says so", async () => {
    const result = await reconcileField("NVDA", "insiderOrInstitutionalBuying", asOf, [agent("claude", true), agent("codex", true)], async () => true, null, sell);
    expect(result).toMatchObject({ value: false, verified: true, agreement: "xbrl_override", agentValues: { claude: { value: true }, codex: { value: true } } });
    expect(result.reason).toContain("overrides agent claim");
  });
  it("leaves the agent consensus alone with no Form 4 result, and does not touch other fields", async () => {
    expect(await reconcileField("NVDA", "insiderOrInstitutionalBuying", asOf, [agent("claude", false)], async () => true, null, null)).toMatchObject({ value: null, agreement: "single" });
    expect(await reconcileField("NVDA", "epsBeat", asOf, [agent("claude", true)], async () => true, null, buy)).toMatchObject({ value: null, agreement: "single" });
  });
});

describe("loadInsider", () => {
  it("uses the fresh fact and only display-allowed Form 4 documents of the symbol", async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const pool = { query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return sql.includes("collected_facts")
        ? { rows: [{ as_of: "2026-10-05", value: { netShares: 5000, netDollars: 250000 }, document_ids: ["7"] }] }
        : { rows: [{ url: "https://www.sec.gov/f.xml", published: "2026-09-28", meta: { trades: [{ date: "2026-09-27", code: "P", shares: 5000 }] } }] };
    } } as unknown as pg.Pool;
    expect(await loadInsider(pool, "NVDA", asOf)).toMatchObject({ value: true, refs: [{ url: "https://www.sec.gov/f.xml" }] });
    expect(calls[0].sql).toContain("insider_net_buy_90d");
    expect(calls[1].sql).toContain("meta->>'display_allowed'='true'");
    expect(calls[1].sql).toContain("doc_type='4'");
  });
  it("is null without a fact", async () => {
    const pool = { query: async () => ({ rows: [] }) } as unknown as pg.Pool;
    expect(await loadInsider(pool, "NVDA", asOf)).toBeNull();
  });
});

describe("netBuyFromTransactions (stored Form 4 lines)", () => {
  const line = (code: string, shares: number, price: number | null, extra: Partial<InsiderTxRow> = {}): InsiderTxRow =>
    ({ accession: "0000000001-26-000001", ticker: "NVDA", transactionDate: "2026-09-20", filedAt: "2026-09-22", code, shares, price, derivative: false, ...extra });
  it("net buy: P adds, S subtracts", () => {
    expect(netBuyFromTransactions([line("P", 1000, 10), line("S", 200, 12, { accession: "0000000001-26-000002" })], asOf))
      .toEqual({ netShares: 800, netDollars: 7600, dollarsComplete: true, accessions: ["0000000001-26-000001", "0000000001-26-000002"] });
  });
  it("net sell is negative", () => {
    expect(netBuyFromTransactions([line("P", 100, 10), line("S", 500, 10)], asOf)).toMatchObject({ netShares: -400, netDollars: -4000 });
  });
  it("none: no line in the 90 day window means null, so the extractor stays the fallback", () => {
    expect(netBuyFromTransactions([], asOf)).toBeNull();
    expect(netBuyFromTransactions([line("P", 100, 10, { transactionDate: "2026-06-01", filedAt: "2026-06-03" })], asOf)).toBeNull();
    expect(netBuyFromTransactions([line("P", 100, 10, { filedAt: "2026-10-09" })], asOf)).toBeNull();
  });
  it("only grants and exercises: lines exist but net is 0, never a buy", () => {
    const result = netBuyFromTransactions([line("A", 5000, 0), line("M", 300, 5), line("F", 100, 50), line("G", 10, null), line("P", 900, 10, { derivative: true })], asOf);
    expect(result).toEqual({ netShares: 0, netDollars: 0, dollarsComplete: true, accessions: [] });
  });
  it("a trade without a price adds shares and flags the dollars as incomplete", () => {
    expect(netBuyFromTransactions([line("P", 100, 10), line("P", 50, null)], asOf)).toMatchObject({ netShares: 150, netDollars: 1000, dollarsComplete: false });
  });
});
