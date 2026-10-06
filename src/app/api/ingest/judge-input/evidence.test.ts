import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const rows = vi.hoisted(() => ({ sql: [] as string[] }));
const audit = { ticker: "NVDA", asOf: "2026-10-05", technical: 8, fundamentals: 7, macro: 3, total: 19, state: "Setup met (>=18)", pullbackInUptrend: false, invalidReasons: [], ruleHits: [] };
const xbrl = "https://data.sec.gov/api/xbrl/companyfacts/CIK0001045810.json";
const av = "https://www.alphavantage.co/query?function=EARNINGS&symbol=NVDA#2026-0";
const cons = (field: string, agreement: string, url: string) => ({ symbol: "NVDA", field, value: true, agreement, verified: true, reason: "r", carried_from: null, evidence_refs: [{ url, publishedAt: "2026-10-05" }] });
vi.mock("pg", () => ({ default: { Pool: class {
  async end() {}
  async query(sql: string) {
    rows.sql.push(sql);
    if (sql.includes("FROM portfolio_baseline") || sql.includes("FROM trade_ideas") || sql.includes("FROM daily_bars")) return { rows: [] };
    if (sql.includes("FROM score_results")) return { rows: [{ ticker: "NVDA", name: "NVIDIA", sector: "AI", tier: 1, audit }] };
    if (sql.includes("FROM consensus_findings")) return { rows: [cons("revenueAccelerating", "xbrl_override", xbrl), cons("epsBeat", "data_rule", av)] };
    if (sql.includes("doc_type")) return { rows: [{ symbol: "NVDA", doc_type: "8-K EX-99.1", url: "https://www.sec.gov/Archives/edgar/data/1045810/ex991.htm", published_at: "2026-08-26" }, { symbol: "NVDA", doc_type: "10-Q", url: "https://www.sec.gov/Archives/edgar/data/1045810/q.htm", published_at: "2026-08-26" }] };
    return { rows: [] };
  }
} } }));
import { GET } from "./route";

const original = { token: process.env.INGEST_TOKEN, db: process.env.DATABASE_URL };
beforeEach(() => { process.env.INGEST_TOKEN = "secret"; process.env.DATABASE_URL = "postgresql://example"; });
afterEach(() => {
  if (original.token === undefined) delete process.env.INGEST_TOKEN; else process.env.INGEST_TOKEN = original.token;
  if (original.db === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = original.db;
});

describe("judge-input route evidence", () => {
  it("returns labelled links from deterministic sources and never a non-displayable one", async () => {
    const res = await GET(new Request("http://localhost/api/ingest/judge-input?asOf=2026-10-05", { headers: { authorization: "Bearer secret" } }));
    const body = await res.json();
    const ev = body.symbols[0].evidence as { url: string; label: string | null }[];
    expect(ev.map((e) => e.label).sort()).toEqual(["10-Q", "Earnings release", "SEC XBRL"]);
    expect(JSON.stringify(body)).not.toContain("alphavantage");
    expect(rows.sql.some((s) => s.includes("doc_type") && s.includes("display_allowed"))).toBe(true);
  });
});
