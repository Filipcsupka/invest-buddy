import { describe, expect, it } from "vitest";
import oldSamples from "../src/research/fixtures/old-samples.json";
import type { OldSample } from "../src/research/old-samples";
import {
  computeMeasures, countDateDropped, formatReport, loadRows, parseEvalArgs,
  type EvalFinding, type EvalItem, type EvalRows, type EvalRun,
} from "./research-eval";

const samples = oldSamples.samples as OldSample[];
const DISC = "11111111-1111-4111-8111-111111111111";
const DEEP = "22222222-2222-4222-8222-222222222222";
const run = (id: string, run_type: string, as_of: string, extra: Partial<EvalRun> = {}): EvalRun =>
  ({ id, run_type, as_of, status: "ok", cost_usd: 1, input_tokens: 100, output_tokens: 50, cache_read_tokens: 0, cache_creation_tokens: 0, ...extra });
const item = (over: Partial<EvalItem> & { status?: string; sourceClass?: string; pageDate?: string } = {}): EvalItem => {
  const { status = "verified", sourceClass = "primary", pageDate, ...rest } = over;
  return { url: "https://ir.example.com/a", publishedAt: "2026-10-08", quote: "Orders were 48 million", ...rest, verify: { status, sourceClass, ...(pageDate ? { pageDate } : {}) } };
};
const finding = (symbol: string, kind: string, over: Partial<EvalFinding> = {}): EvalFinding => ({
  run_id: DEEP, symbol, kind, claim: `${symbol} ${kind}`, verification_status: "verified", source_class: "primary", confirmed: true, lead: false,
  evidence: [item()], figures: [], ...over,
});
const allDeep = () => samples.map((s) => finding(s.ticker, s.kind));
const get = (rows: EvalRows, id: string, options = {}) => computeMeasures(rows, samples, options).measures.find((m) => m.id === id)!;
const rows = (over: Partial<EvalRows> = {}): EvalRows => ({
  runs: [run(DISC, "weekly_discovery", "2026-10-04"), run(DEEP, "deep_dive", "2026-10-09")], findings: allDeep(), candidates: [], events: [], ...over,
});

describe("candidate recall", () => {
  it("counts sample names found by the discovery run, not dropped", () => {
    const cands = ["MRVL", "GMAB", "GFS", "INTT"].map((symbol) => ({ symbol, state: "DISCOVERED", first_run_id: DISC }));
    expect(get(rows({ candidates: cands }), "recall")).toMatchObject({ verdict: "pass", result: "4 of 6" });
    const few = [...cands.slice(0, 3), { symbol: "INTT", state: "DROPPED", first_run_id: DISC }, { symbol: "XYZ", state: "WATCH", first_run_id: DISC }];
    expect(get(rows({ candidates: few }), "recall")).toMatchObject({ verdict: "fail", result: "3 of 6" });
  });
  it("is not measured without a discovery run", () => {
    expect(get(rows({ runs: [run(DEEP, "deep_dive", "2026-10-09")] }), "recall").verdict).toBe("not measured");
  });
});

describe("trigger measures", () => {
  it("passes when all six triggers are found on primary sources", () => {
    expect(get(rows(), "trigger")).toMatchObject({ verdict: "pass", result: "6 of 6" });
    expect(get(rows(), "primary")).toMatchObject({ verdict: "pass", result: "6 of 6" });
  });
  it("fails on a missing trigger and on two non-primary ones", () => {
    const f = allDeep().filter((x) => x.symbol !== "GFS");
    f[0] = { ...f[0], source_class: "press" }; f[1] = { ...f[1], verification_status: "lead_only", source_class: "social" };
    const r = rows({ findings: f });
    expect(get(r, "trigger")).toMatchObject({ verdict: "fail", result: "5 of 6" });
    expect(get(r, "primary")).toMatchObject({ verdict: "fail", result: "3 of 6" });
  });
  it("needs the right kind", () => {
    const f = allDeep().map((x) => (x.symbol === "MEDCL" ? { ...x, kind: "product" } : x));
    expect(get(rows({ findings: f }), "trigger").result).toBe("5 of 6");
  });
  it("is not measured without a deep dive", () => {
    expect(get(rows({ runs: [run(DISC, "weekly_discovery", "2026-10-04")] }), "trigger").verdict).toBe("not measured");
  });
});

describe("quote failures", () => {
  it("uses the 10% limit", () => {
    const mk = (bad: number) => [finding("MRVL", "guidance", { evidence: Array.from({ length: 10 }, (_, i) => item({ status: i < bad ? "quote_not_found" : "verified" })) })];
    expect(get(rows({ findings: mk(1) }), "quotes")).toMatchObject({ verdict: "pass", result: "1 of 10 items (10.0%)" });
    expect(get(rows({ findings: mk(2) }), "quotes").verdict).toBe("fail");
  });
  it("is not measured before verification", () => {
    expect(get(rows({ findings: [finding("MRVL", "guidance", { evidence: [{ url: "u", publishedAt: null, quote: "q" }] })] }), "quotes").verdict).toBe("not measured");
  });
});

describe("figures", () => {
  it("needs every figure in a verified quote", () => {
    const ok = finding("INTT", "earnings", { figures: [{ label: "Orders", value: "48 million", evidenceIndex: 0 }] });
    expect(get(rows({ findings: [ok] }), "figures")).toMatchObject({ verdict: "pass", result: "1 of 1 (100.0%)" });
    const wrong = finding("INTT", "earnings", { figures: [{ label: "Orders", value: "49 million", evidenceIndex: 0 }, { label: "x", value: "5", evidenceIndex: 3 }] });
    expect(get(rows({ findings: [ok, wrong] }), "figures")).toMatchObject({ verdict: "fail", result: "1 of 3 (33.3%)" });
    const unverified = finding("INTT", "earnings", { figures: [{ label: "Orders", value: "48", evidenceIndex: 0 }], evidence: [item({ status: "fetch_failed" })] });
    expect(get(rows({ findings: [unverified] }), "figures").verdict).toBe("fail");
  });
  it("is not measured without figures", () => {
    expect(get(rows(), "figures").verdict).toBe("not measured");
  });
});

describe("social and unconfirmed", () => {
  it("fails a verified fact that is a lead or social", () => {
    expect(get(rows(), "social")).toMatchObject({ verdict: "pass", result: "0 of 6 verified facts" });
    const f = [...allDeep(), finding("GFS", "contract", { source_class: "social" })];
    expect(get(rows({ findings: f }), "social").verdict).toBe("fail");
  });
  it("checks the UNCONFIRMED flag on single non-primary claims", () => {
    const press = (confirmed: boolean) => finding("GFS", "contract", { source_class: "press", confirmed, evidence: [item({ sourceClass: "press" })] });
    expect(get(rows({ findings: [press(false)] }), "unconfirmed")).toMatchObject({ verdict: "pass", result: "1 of 1 (100.0%)" });
    expect(get(rows({ findings: [press(true)] }), "unconfirmed").verdict).toBe("fail");
    const two = finding("GFS", "contract", { source_class: "press", confirmed: true, evidence: [item({ sourceClass: "press", url: "https://a.com/1" }), item({ sourceClass: "press", url: "https://b.com/1" })] });
    expect(get(rows({ findings: [two] }), "unconfirmed").verdict).toBe("not measured");
  });
});

describe("repeat alerts", () => {
  const daily = [run("d1", "daily_watch", "2026-10-12"), run("d2", "daily_watch", "2026-10-13")];
  const ev = (symbol: string, kind: string, at: string) => ({ symbol, kind, at, reason: null });
  it("is not measured without two consecutive days", () => {
    expect(get(rows({ runs: [daily[0]] }), "repeats").verdict).toBe("not measured");
    expect(get(rows({ runs: [daily[0], run("d3", "daily_watch", "2026-10-15")] }), "repeats").verdict).toBe("not measured");
  });
  it("counts a day-2 alert without a change", () => {
    const base = [ev("MRVL", "alert_sent", "2026-10-12 09:00:00+00"), ev("MRVL", "alert_sent", "2026-10-13 09:00:00+00")];
    expect(get(rows({ runs: daily, events: base }), "repeats")).toMatchObject({ verdict: "fail" });
    expect(get(rows({ runs: daily, events: [...base, ev("MRVL", "finding_verified", "2026-10-13 08:00:00+00")] }), "repeats").verdict).toBe("pass");
  });
});

describe("cost, owner measures and date rule", () => {
  it("needs owner for cost without caps, then checks given caps", () => {
    expect(get(rows(), "cost").verdict).toBe("needs owner");
    expect(get(rows(), "cost", { maxTokens: 1000, maxCostUsd: 2 }).verdict).toBe("pass");
    expect(get(rows(), "cost", { maxTokens: 100 }).verdict).toBe("fail");
    expect(get(rows(), "cost", { maxCostUsd: 0.5 }).verdict).toBe("fail");
  });
  it("never invents the owner measures", () => {
    expect(get(rows(), "grade").verdict).toBe("needs owner");
    expect(get(rows(), "links")).toMatchObject({ verdict: "needs owner" });
  });
  it("counts items dated after the run date", () => {
    const f = [finding("MRVL", "guidance", { evidence: [item({ publishedAt: "2026-10-12" }), item({ pageDate: "2026-10-20" }), item()] })];
    expect(countDateDropped({ runs: [run(DEEP, "deep_dive", "2026-10-09")], findings: f })).toBe(2);
    expect(computeMeasures(rows({ findings: f }), samples).dateDropped).toBe(2);
  });
  it("prints every measure and the dropped count", () => {
    const out = formatReport(computeMeasures(rows(), samples));
    expect(out).toContain("Evidence items dropped by the date rule: 0");
    expect(out.match(/^\| (?!Measure|---)/gm)).toHaveLength(11);
    expect(out).toContain("needs owner");
  });
});

describe("args and loader", () => {
  it("parses run ids and caps", () => {
    expect(parseEvalArgs([DISC, "--max-tokens", "5000", "--max-cost-usd", "1.5"])).toEqual({ runIds: [DISC], options: { maxTokens: 5000, maxCostUsd: 1.5 } });
    expect(() => parseEvalArgs([])).toThrow("run id");
    expect(() => parseEvalArgs(["nope"])).toThrow("Unexpected");
    expect(() => parseEvalArgs([DISC, "--max-tokens", "x"])).toThrow("number");
  });
  it("issues SELECTs only", async () => {
    const seen: string[] = [];
    const db = { query: async (sql: string) => { seen.push(sql.trim()); return { rows: [] }; } };
    const loaded = await loadRows(db, [DISC]);
    expect(loaded).toEqual({ runs: [], findings: [], candidates: [], events: [] });
    expect(seen).toHaveLength(4);
    expect(seen.every((sql) => /^SELECT\b/i.test(sql))).toBe(true);
  });
});
