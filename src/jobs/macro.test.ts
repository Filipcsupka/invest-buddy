import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import universe from "../../scanner/universe.json";
import { collectFredSeries } from "../collectors/fred";
import { fx, stubHttp } from "../collectors/sources/testing";
import { DatabaseUniverseProvider } from "../data/db-provider";
import { DEFAULT_MACRO_CONFIG } from "../data/macro-rules";
import { offVerifier } from "../data/evidence";
import type { CollectedDocument } from "../collectors/types";
import { MemoryCollectorRepository, type CollectorRepository } from "../db/collectors";
import { migrate } from "../../scripts/migrate";
import { evaluateMacro, fetchMacroInputs, macroRunId, previousTradingDay, runMacro, VIX_DOC_URL, type MacroInputs } from "./macro";
import { runReconcile } from "./reconcile";

const ASOF = "2026-10-02";
const tickers = (universe.instruments as { symbol: string }[]).map((item) => item.symbol);
const day = (offset: number) => new Date(Date.parse(`${ASOF}T00:00:00Z`) - offset * 86_400_000).toISOString().slice(0, 10);
const fredJson = (slope: number) => JSON.stringify({ observations: Array.from({ length: 40 }, (_, i) => ({ date: day(i), value: (4.2 + i * slope).toFixed(2) })).concat([{ date: day(41), value: "." }]) });
const vixCsv = (close: number) => `DATE,OPEN,HIGH,LOW,CLOSE\n${[5, 4, 3, 2, 1, 0].map((i) => `${day(i).slice(5, 7)}/${day(i).slice(8)}/${day(i).slice(0, 4)},17,19,16,${close}`).join("\n")}\n`;
const tsyCsv = () => `Date,"3 Mo","2 Yr","10 Yr"\n${day(0).slice(5, 7)}/${day(0).slice(8)}/${day(0).slice(0, 4)},4.2,4.5,4.3\n`;
const bars = (n: number, first: number, end: number) => Array.from({ length: n }, (_, i) => ({ date: day(n - 1 - i), close: first + ((end - first) * i) / (n - 1) }));
const inputs = (over: Partial<MacroInputs> = {}): MacroInputs => ({
  yields: bars(30, 4.4, 4.2).map((b) => ({ date: b.date, value: b.close })), yieldUrl: "https://fred.stlouisfed.org/series/DGS10",
  cpi: null, cpiUrl: null, ppi: null, ppiUrl: null,
  vix: [{ date: ASOF, close: 18 }], vixUrl: VIX_DOC_URL, universe: Object.fromEntries(tickers.map((t) => [t, bars(30, 100, 108)])), spy: bars(30, 100, 102), ...over });

describe("previousTradingDay", () => {
  it("is the last completed weekday session in New York", () => {
    expect(previousTradingDay(new Date("2026-10-06T04:50:00Z"))).toBe("2026-10-05"); // Tuesday morning in Bratislava
    expect(previousTradingDay(new Date("2026-10-05T04:50:00Z"))).toBe("2026-10-02"); // Monday morning
    expect(previousTradingDay(new Date("2026-10-03T04:50:00Z"))).toBe("2026-10-02"); // Saturday morning
    expect(previousTradingDay(new Date("2026-10-06T21:00:00Z"))).toBe("2026-10-06"); // after the close
  });
});

describe("macro outcome", () => {
  it("cites the two stored documents for a known dataTailwind and none for rotation", () => {
    const outcome = evaluateMacro(inputs(), ASOF, DEFAULT_MACRO_CONFIG);
    expect(outcome.dataTailwind.value).toBe(true);
    expect(outcome.sectorRotationIntoGrowth.value).toBe(true);
    expect(outcome.evidence.dataTailwind.map((item) => item.url)).toEqual(["https://fred.stlouisfed.org/series/DGS10", VIX_DOC_URL]);
    expect(outcome.evidence.dataTailwind.every((item) => item.claim === "macro.dataTailwind" && item.publishedAt === ASOF)).toBe(true);
    expect(outcome.evidence.sectorRotationIntoGrowth).toEqual([]);
  });
  it("cites both monthly series when inflation history is available", () => {
    const monthly = Array.from({ length: 24 }, (_, i) => ({ date: new Date(Date.UTC(2024, 10 + i, 1)).toISOString().slice(0, 10), value: 100 + i }));
    const outcome = evaluateMacro(inputs({ cpi: monthly, ppi: monthly, cpiUrl: "https://fred.stlouisfed.org/series/CPIAUCSL", ppiUrl: "https://fred.stlouisfed.org/series/PPIACO" }), ASOF, DEFAULT_MACRO_CONFIG);
    expect(outcome.dataTailwind.value).toBe(true);
    expect(outcome.evidence.dataTailwind.map((item) => item.url)).toEqual(["https://fred.stlouisfed.org/series/DGS10", VIX_DOC_URL, "https://fred.stlouisfed.org/series/CPIAUCSL", "https://fred.stlouisfed.org/series/PPIACO"]);
    expect(outcome.dataTailwind.reason).toMatch(/CPIAUCSL YoY .* PPIACO YoY/);
  });
  it("is unknown with no evidence when inputs are missing", () => {
    const outcome = evaluateMacro(inputs({ yields: null, yieldUrl: null, vix: null, vixUrl: null, spy: null }), ASOF, DEFAULT_MACRO_CONFIG);
    expect(outcome.dataTailwind.value).toBeNull();
    expect(outcome.sectorRotationIntoGrowth.value).toBeNull();
    expect(outcome.evidence.dataTailwind).toEqual([]);
  });
  it("derives a stable uuid from the date", () => {
    expect(macroRunId(ASOF)).toBe(macroRunId(ASOF));
    expect(macroRunId(ASOF)).not.toBe(macroRunId("2026-10-05"));
    expect(macroRunId(ASOF)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe("macro inputs", () => {
  it("stores FRED observations without the key and without placeholders, as third-party data", async () => {
    const doc = await collectFredSeries("secret-key", "DGS10", async () => fredJson(0.01));
    const observations = doc.meta.observations as { date: string; value: number }[];
    expect(observations).toHaveLength(40);
    expect(observations[0].date < observations.at(-1)!.date).toBe(true);
    expect(doc.url).toBe("https://fred.stlouisfed.org/series/DGS10");
    expect(doc.meta.display_allowed).toBe(false);
    expect(JSON.stringify(doc)).not.toContain("secret-key");
    await expect(collectFredSeries("k", "DGS10", async () => JSON.stringify({ observations: [{ date: ASOF, value: "." }] }))).rejects.toThrow(/no numeric observation/);
  });
  it("fetches four documents, and reports a missing key or a failing source without throwing", async () => {
    const repository = new MemoryCollectorRepository();
    const http = stubHttp((call) => call.url.includes("treasury.gov") ? tsyCsv() : call.url.includes("ecb.europa.eu") ? fx("ecb_eurofxref_hist.xml") : vixCsv(18.5));
    expect(await fetchMacroInputs(repository, { http, env: { FRED_API_KEY: "k" }, get: async () => fredJson(0.01), now: new Date(`${ASOF}T10:00:00Z`) })).toEqual([]);
    expect([...repository.documents.keys()].sort()).toEqual(["https://fred.stlouisfed.org/series/DGS10", "https://fred.stlouisfed.org/series/CPIAUCSL", "https://fred.stlouisfed.org/series/PPIACO", VIX_DOC_URL].sort());
    expect(repository.documents.get(VIX_DOC_URL)?.meta.display_allowed).toBe(false);
    expect(new Set(repository.macroObservations.map((row) => row.seriesId))).toEqual(new Set(["DGS2", "DGS10", "DGS3MO", "T10Y2Y", "FEDFUNDS", "CPIAUCSL", "PPIACO", "TSY_3M", "TSY_2Y", "TSY_10Y", "ECB_EURUSD", "ECB_EURCZK", "ECB_EURGBP"]));
    const missing = await fetchMacroInputs(new MemoryCollectorRepository(), { http: stubHttp(() => { throw new Error("down"); }), env: {}, now: new Date(`${ASOF}T10:00:00Z`) });
    expect(missing).toEqual(["fred: FRED_API_KEY absent", "treasury curve: down", "ecb fx: down", "vix: down"]);
  });
});

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("macro job on postgres", () => {
  const pool = new pg.Pool({ connectionString: url });
  const docUrls = ["https://fred.stlouisfed.org/series/DGS10", "https://fred.stlouisfed.org/series/CPIAUCSL", "https://fred.stlouisfed.org/series/PPIACO", VIX_DOC_URL];
  const cleanup = async () => {
    await pool.query("DELETE FROM consensus_findings WHERE as_of=$1", [ASOF]);
    await pool.query("DELETE FROM reconcile_runs WHERE as_of=$1", [ASOF]);
    await pool.query("DELETE FROM macro_findings WHERE as_of=$1", [ASOF]);
    await pool.query("DELETE FROM scan_findings WHERE as_of=$1", [ASOF]);
    await pool.query("DELETE FROM scan_runs WHERE as_of=$1", [ASOF]);
    await pool.query("DELETE FROM daily_bars WHERE bar_date >= $1::date - 40 AND bar_date <= $1::date AND ticker = ANY($2::text[])", [ASOF, [...tickers, "SPY"]]);
    await pool.query("DELETE FROM source_documents WHERE url = ANY($1::text[])", [docUrls]);
  };
  const seedBars = async (spyLast = ASOF) => {
    for (const [ticker, end] of [...tickers.map((t) => [t, 108] as const), ["SPY", 102] as const]) {
      const series = bars(30, 100, end).map((b, i, all) => ({ ...b, date: new Date(Date.parse(`${spyLast}T00:00:00Z`) - (all.length - 1 - i) * 86_400_000).toISOString().slice(0, 10) }));
      await pool.query(`INSERT INTO daily_bars (ticker,bar_date,open,high,low,close,volume)
        SELECT $1,d,c,c,c,c,1000 FROM unnest($2::date[],$3::numeric[]) AS t(d,c) ON CONFLICT (ticker,bar_date) DO NOTHING`, [ticker, series.map((b) => b.date), series.map((b) => b.close)]);
    }
  };
  const seedDocs = async (slope = 0.01, vix = 18.5) => {
    const failures = await fetchMacroInputs({ upsertDocument: async (doc: CollectedDocument) => {
      const stored = await pool.query<{ id: string }>(`INSERT INTO source_documents (source,symbol,doc_type,url,published_at,content_hash,body,meta)
        VALUES ($1,NULL,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT (url) DO UPDATE SET meta=EXCLUDED.meta,published_at=EXCLUDED.published_at RETURNING id`, [doc.source, doc.docType, doc.url, doc.publishedAt, doc.contentHash, doc.body, JSON.stringify(doc.meta)]);
      return { id: Number(stored.rows[0].id), written: true };
    } } as unknown as CollectorRepository, { http: stubHttp(() => vixCsv(vix)), env: { FRED_API_KEY: "k" }, get: async () => fredJson(slope), now: new Date(`${ASOF}T10:00:00Z`) });
    expect(failures).toEqual([]);
  };
  const consensus = async () => (await pool.query<{ symbol: string; field: string; value: boolean | null; agreement: string; verified: boolean; reason: string; evidence_refs: { url: string }[] }>(
    "SELECT symbol,field,value,agreement,verified,reason,evidence_refs FROM consensus_findings WHERE as_of=$1 ORDER BY symbol,field", [ASOF])).rows;

  beforeAll(async () => { await migrate(url!); await cleanup(); });
  beforeEach(cleanup);
  afterAll(async () => { await cleanup(); await pool.end(); });

  it("writes macro_findings and consensus rows for every ticker, and a rerun changes nothing", async () => {
    await seedBars(); await seedDocs();
    const first = await runMacro(pool, ASOF, { fetch: false });
    expect(first.rows).toBe(tickers.length * 2);
    expect(first.dataTailwind.value).toBe(true);
    expect(first.sectorRotationIntoGrowth.value).toBe(true);
    const rows = await consensus();
    expect(rows).toHaveLength(tickers.length * 2);
    expect(rows.every((row) => row.agreement === "data_rule" && row.verified && row.value === true)).toBe(true);
    expect(rows.find((row) => row.field === "dataTailwind")?.evidence_refs.map((ref) => ref.url)).toEqual([docUrls[0], docUrls[3]]);
    expect(rows.find((row) => row.field === "dataTailwind")?.reason).toMatch(/10-year yield .* VIX/);
    const macro = await pool.query<{ run_id: string; data: Record<string, unknown>; evidence: { items: { url: string }[] }; superseded_by: string | null }>("SELECT run_id,data,evidence,superseded_by FROM macro_findings WHERE as_of=$1", [ASOF]);
    expect(macro.rows).toHaveLength(1);
    expect(macro.rows[0]).toMatchObject({ run_id: macroRunId(ASOF), superseded_by: null, data: { runnerName: "data_rule", dataTailwind: true, sectorRotationIntoGrowth: true, placeholder: true } });
    expect(macro.rows[0].evidence.items.map((item) => item.url)).toEqual([docUrls[0], docUrls[3]]);
    const before = JSON.stringify(rows);
    await runMacro(pool, ASOF, { fetch: false });
    expect(JSON.stringify(await consensus())).toBe(before);
    expect((await pool.query("SELECT 1 FROM macro_findings WHERE as_of=$1", [ASOF])).rowCount).toBe(1);
    expect((await pool.query("SELECT 1 FROM scan_runs WHERE as_of=$1", [ASOF])).rowCount).toBe(1);
  });

  it("scores read the data_rule rows, and reconcile does not overwrite them", async () => {
    await seedBars(); await seedDocs();
    await runMacro(pool, ASOF, { fetch: false });
    const run = macroRunId("2026-10-02").replace(/^./, "0");
    await pool.query("INSERT INTO scan_runs (run_id,as_of,generated_at,runner) VALUES ($1,$2,now(),$3::jsonb)", [run, ASOF, JSON.stringify({ name: "claude", model: "test" })]);
    await pool.query("INSERT INTO scan_findings (run_id,as_of,symbol,fundamentals,evidence,confidence,runner) VALUES ($1,$2,'NVDA','{}'::jsonb,'{\"items\":[]}'::jsonb,'high',$3::jsonb)", [run, ASOF, JSON.stringify({ name: "claude", model: "test" })]);
    await runReconcile(pool, ASOF, offVerifier, async () => null, async () => null);
    const nvda = (await consensus()).filter((row) => row.symbol === "NVDA");
    expect(nvda.filter((row) => row.field === "dataTailwind" || row.field === "sectorRotationIntoGrowth").map((row) => [row.agreement, row.value, row.verified])).toEqual([["data_rule", true, true], ["data_rule", true, true]]);
    expect(nvda.find((row) => row.field === "epsBeat")?.agreement).toBe("single");
    for (const carry of [false, true]) expect(await new DatabaseUniverseProvider(pool, ASOF, carry).macro("NVDA")).toEqual({ growthSectorRotation: true, dataTailwind: true });
  });

  it("writes false when a rule fails and unknown rows when inputs are stale or missing", async () => {
    await seedBars(); await seedDocs(-0.02, 18.5); // yield rose more than 0.25 pp
    await runMacro(pool, ASOF, { fetch: false });
    expect((await consensus()).find((row) => row.symbol === "AMD" && row.field === "dataTailwind")).toMatchObject({ value: false, verified: true, agreement: "data_rule" });
    await pool.query("DELETE FROM source_documents WHERE url = ANY($1::text[])", [docUrls]);
    await pool.query("DELETE FROM daily_bars WHERE ticker='SPY' AND bar_date <= $1::date", [ASOF]);
    const result = await runMacro(pool, ASOF, { fetch: false });
    expect(result.dataTailwind.value).toBeNull();
    expect(result.sectorRotationIntoGrowth.value).toBeNull();
    const rows = await consensus();
    expect(rows).toHaveLength(tickers.length * 2);
    expect(rows.every((row) => row.value === null && !row.verified && row.agreement === "data_rule" && row.reason.startsWith("Unknown"))).toBe(true);
    expect(await new DatabaseUniverseProvider(pool, ASOF, false).macro("NVDA")).toEqual({ growthSectorRotation: null, dataTailwind: null });
  });

  it("treats old bars as stale", async () => {
    await seedBars("2026-09-20");
    const result = await runMacro(pool, ASOF, { fetch: false });
    expect(result.sectorRotationIntoGrowth.value).toBeNull();
    expect(result.sectorRotationIntoGrowth.reason).toMatch(/stale/);
  });
});
