import type pg from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { fixtureBars, instruments } from "../data/fixtures";
import { DatabaseUniverseProvider } from "../data/db-provider";
import type { ConsensusRow } from "../data/carry-forward";
import type { ScoreRepository, ScoredInstrument } from "../db/types";
import { runDaily } from "./daily";
import { runReconcile } from "./reconcile";

type Row = ConsensusRow & { symbol: string };
const agents = { claude: { value: true, runId: "c1" }, codex: { value: true, runId: "x1" } };
const base = (field: string, over: Partial<Row> = {}): Row => ({ symbol: "AMD", field, as_of: "2026-09-20", value: true, agreement: "agree", agent_values: agents, evidence_refs: [], verified: true, reason: "ok", carried_from: null, ...over });
/** AMD history: three fields in window on 2026-10-05, two outside. */
const history = (): Row[] => [
  base("epsBeat", { evidence_refs: [{ url: "https://sec.gov/eps", publishedAt: "2026-09-15" }] }),
  base("guidanceRaised", { value: false, evidence_refs: [] }),
  base("productCatalyst", { evidence_refs: [{ url: "https://sec.gov/launch", publishedAt: "2026-09-10" }] }),
  base("insiderOrInstitutionalBuying", { evidence_refs: [{ url: "https://sec.gov/f4", publishedAt: "2026-08-01" }] }),
  base("narrativeChanged", { value: false, as_of: "2026-10-04", carried_from: "2026-09-01", reason: "Carried from 2026-09-01: none" }),
];
const withEnv = async <T>(flag: string | undefined, fn: () => Promise<T>) => { const old = process.env.CARRY_FORWARD; if (flag === undefined) delete process.env.CARRY_FORWARD; else process.env.CARRY_FORWARD = flag; try { return await fn(); } finally { if (old === undefined) delete process.env.CARRY_FORWARD; else process.env.CARRY_FORWARD = old; } };
afterEach(() => { delete process.env.CARRY_FORWARD; });

/** Minimal Postgres stand-in: scan findings, one in-memory consensus table, and a recording client. */
function fakePool(table: Row[], scans: { symbol: string; run_id: string; runner: { name: "claude" | "codex" }; fundamentals: Record<string, unknown>; evidence: { items: unknown[] }; confidence: string }[] = []) {
  const sqls: string[] = [];
  const writes: { sql: string; params: unknown[] }[] = [];
  const query = async (sql: string, params: unknown[] = []) => {
    sqls.push(sql);
    if (sql.includes("FROM scan_findings")) return { rows: scans };
    if (sql.includes("FROM macro_findings")) return { rows: [] };
    if (sql.includes("FROM daily_bars")) return { rows: fixtureBars("AMD").map((b) => ({ bar_date: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume })) };
    if (sql.includes("FROM instruments")) return { rows: [{ ...instruments[0], ticker: "AMD" }] };
    if (sql.includes("FROM consensus_findings")) {
      const asOf = params.at(-1) as string | null;
      const macroOnly = sql.includes("field IN ('sectorRotationIntoGrowth','dataTailwind')");
      const lt = sql.includes("as_of < $1");
      const latest = new Map<string, Row>();
      for (const r of [...table].sort((a, b) => b.as_of.localeCompare(a.as_of))) {
        const symbolMatch = lt || r.symbol === params[0];
        const dateOk = lt ? r.as_of < (params[0] as string) : asOf === null || r.as_of <= asOf;
        const fieldOk = !macroOnly || ["sectorRotationIntoGrowth", "dataTailwind"].includes(r.field);
        const key = lt ? `${r.symbol}:${r.field}` : r.field;
        if (symbolMatch && dateOk && fieldOk && !latest.has(key)) latest.set(key, r);
      }
      return { rows: [...latest.values()].map((r) => ({ ...r, as_of: r.as_of })) };
    }
    return { rows: [] };
  };
  const client = { query: async (sql: string, params: unknown[] = []) => { if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [] }; writes.push({ sql, params }); return { rows: [] }; }, release() {} };
  return { pool: { query, connect: async () => client } as unknown as pg.Pool, sqls, writes };
}
const nvdaScan = (name: "claude" | "codex") => ({ symbol: "NVDA", run_id: `${name}-1`, runner: { name }, fundamentals: { epsBeat: false }, evidence: { items: [] }, confidence: "high" });
const legacyUpsert = `INSERT INTO consensus_findings (symbol,field,as_of,value,agreement,agent_values,evidence_refs,verified,reason)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9)
      ON CONFLICT (symbol,field,as_of) DO UPDATE SET value=EXCLUDED.value,agreement=EXCLUDED.agreement,agent_values=EXCLUDED.agent_values,evidence_refs=EXCLUDED.evidence_refs,verified=EXCLUDED.verified,reason=EXCLUDED.reason,reconciled_at=now()`;
const consensusWrites = (w: { sql: string; params: unknown[] }[]) => w.filter((x) => x.sql.includes("INTO consensus_findings"));
const noSec = async () => null;

describe("reconcile carry-forward", () => {
  it("flag off: writes only scanned symbols with the original SQL and ignores history", async () => {
    const { pool, sqls, writes } = fakePool(history(), [nvdaScan("claude"), nvdaScan("codex")]);
    const count = await withEnv(undefined, () => runReconcile(pool, "2026-10-05", async () => true, noSec));
    expect(count).toBe(10);
    const rows = consensusWrites(writes);
    expect(rows).toHaveLength(10);
    expect(rows.every((w) => w.sql === legacyUpsert && w.params.length === 9 && w.params[0] === "NVDA")).toBe(true);
    expect(sqls.some((s) => s.includes("carried_from"))).toBe(false);
  });
  it("flag on: carries in-window fields, expires the rest, tags carried_from, leaves scanned symbols alone", async () => {
    const { pool, writes } = fakePool(history(), [nvdaScan("claude"), nvdaScan("codex")]);
    const count = await withEnv("on", () => runReconcile(pool, "2026-10-05", async () => true, noSec));
    const rows = consensusWrites(writes);
    const amd = Object.fromEntries(rows.filter((w) => w.params[0] === "AMD").map((w) => [w.params[1] as string, w.params]));
    expect(count).toBe(10 + 5);
    expect(Object.keys(amd).sort()).toEqual(["epsBeat", "guidanceRaised", "insiderOrInstitutionalBuying", "narrativeChanged", "productCatalyst"]);
    expect(amd.epsBeat).toMatchObject({ 3: true, 4: "agree", 7: true, 8: expect.stringContaining("Carried from 2026-09-20"), 2: "2026-10-05", 9: "2026-09-20" });
    expect(amd.guidanceRaised).toMatchObject({ 3: false, 9: "2026-09-20" });
    expect(amd.productCatalyst).toMatchObject({ 3: true, 9: "2026-09-20" });
    expect(amd.insiderOrInstitutionalBuying).toMatchObject({ 3: null, 4: "single", 7: false, 6: "[]", 9: "2026-09-20" });
    expect(amd.narrativeChanged).toMatchObject({ 3: null, 4: "single", 9: "2026-09-01" });
    expect(rows.filter((w) => w.params[0] === "NVDA").every((w) => w.sql.includes("carried_from=NULL") && w.params.length === 9)).toBe(true);
  });
  it("flag on: a symbol with findings on the date is reconciled, not carried", async () => {
    const amdScan = (name: "claude" | "codex") => ({ ...nvdaScan(name), symbol: "AMD", run_id: `amd-${name}` });
    const { pool, writes } = fakePool(history(), [amdScan("claude"), amdScan("codex")]);
    await withEnv("on", () => runReconcile(pool, "2026-10-05", async () => true, noSec));
    expect(consensusWrites(writes).every((w) => w.params.length === 9)).toBe(true);
  });
  it("flag on: never reads rows dated on or after the requested date", async () => {
    const { pool, writes } = fakePool([base("epsBeat", { as_of: "2026-10-05" })]);
    await withEnv("on", () => runReconcile(pool, "2026-10-05", async () => true, noSec));
    expect(consensusWrites(writes)).toHaveLength(0);
  });
});

const provider = (table: Row[], asOf: string, carry?: boolean) => { const { pool, sqls } = fakePool(table); return { provider: new DatabaseUniverseProvider(pool, asOf, carry), sqls }; };

describe("daily carry-forward", () => {
  it("flag off: uses the original queries and ignores field windows", async () => {
    const { provider: p, sqls } = provider(history(), "2026-10-05", false);
    const f = await p.fundamentals("AMD");
    await p.macro("AMD");
    expect(f).toMatchObject({ epsBeat: true, productCatalyst: true, insiderOrInstitutionalAccumulation: true });
    expect(sqls.some((s) => s.includes("carried_from"))).toBe(false);
    const origin = p.provenance.get("AMD")!;
    expect(origin.carriedFrom).toBeUndefined();
    expect(origin.expiredFields).toBeUndefined();
    expect(origin.fingerprintRows[0]).not.toHaveProperty("carry");
  });
  it("flag on: in-window values keep scoring, expired ones become unknown, both are tagged", async () => {
    const { provider: p } = provider(history(), "2026-10-05", true);
    const f = await p.fundamentals("AMD");
    await p.macro("AMD");
    expect(f).toMatchObject({ epsBeat: true, guidanceRaised: false, productCatalyst: true, insiderOrInstitutionalAccumulation: null });
    const origin = p.provenance.get("AMD")!;
    expect(origin.carriedFrom).toMatchObject({ epsBeat: "2026-09-20", productCatalyst: "2026-09-20", insiderOrInstitutionalBuying: "2026-09-20", narrativeChanged: "2026-09-01" });
    expect(origin.expiredFields).toEqual(["insiderOrInstitutionalBuying", "narrativeChanged"]);
    expect(origin.consensusValues.insiderOrInstitutionalBuying).toBeNull();
    expect(origin.agreement.insiderOrInstitutionalBuying).toBeUndefined();
    expect(origin.evidenceUrls).toContain("https://sec.gov/eps");
    expect(origin.evidenceUrls).not.toContain("https://sec.gov/f4");
  });
  it("flag on: a field scanned on the date is not tagged as carried", async () => {
    const table = [...history(), base("epsBeat", { as_of: "2026-10-05" })];
    const { provider: p } = provider(table, "2026-10-05", true);
    await p.fundamentals("AMD");
    expect(p.provenance.get("AMD")!.carriedFrom).not.toHaveProperty("epsBeat");
  });
  it("flag on reads CARRY_FORWARD from the environment by default", async () => {
    const { pool } = fakePool(history());
    await withEnv("on", async () => { const p = new DatabaseUniverseProvider(pool, "2026-10-05"); await p.fundamentals("AMD"); expect(p.provenance.get("AMD")!.expiredFields).toContain("insiderOrInstitutionalBuying"); });
  });
});

const capture = () => { const saved: ScoredInstrument[] = []; const repository: ScoreRepository = { saveDaily: async (_d, _p, records) => { saved.push(...records); return { inserted: true, instrumentCount: records.length, alerts: [] }; }, scores: async () => [], alerts: async () => [] }; return { saved, repository }; };
const run = async (table: Row[], asOf: string, carry: boolean) => { const { provider: p } = provider(table, asOf, carry); const { saved, repository } = capture(); await runDaily(p, repository, asOf, "scan"); return saved[0]; };

describe("daily carry-forward fingerprint and result", () => {
  it("flag off: result has no carried fields and the fingerprint ignores the date window", async () => {
    const a = await run(history(), "2026-10-05", false);
    const b = await run(history(), "2026-10-20", false);
    expect(a.result).not.toHaveProperty("carriedFrom");
    expect(a.result).not.toHaveProperty("expiredFields");
    expect(a.fingerprint).toBe(b.fingerprint);
  });
  it("flag on: result carries the tags and the fingerprint changes when a field expires", async () => {
    const a = await run(history(), "2026-10-05", true);
    const same = await run(history(), "2026-10-05", true);
    const later = await run(history(), "2026-10-12", true);
    expect(a.result.carriedFrom).toMatchObject({ epsBeat: "2026-09-20" });
    expect(a.result.expiredFields).toEqual(["insiderOrInstitutionalBuying", "narrativeChanged"]);
    expect(same.fingerprint).toBe(a.fingerprint);
    expect(later.result.expiredFields).toContain("productCatalyst");
    expect(later.fingerprint).not.toBe(a.fingerprint);
  });
  it("fingerprint differs between flag off and on for the same data", async () => {
    expect((await run(history(), "2026-10-05", true)).fingerprint).not.toBe((await run(history(), "2026-10-05", false)).fingerprint);
  });
  it("an expired field scores no more points than unknown", async () => {
    const a = await run(history(), "2026-10-05", true);
    const without = await run(history().filter((r) => r.field !== "insiderOrInstitutionalBuying"), "2026-10-05", true);
    expect(a.result.fundamentals).toBe(without.result.fundamentals);
  });
});
