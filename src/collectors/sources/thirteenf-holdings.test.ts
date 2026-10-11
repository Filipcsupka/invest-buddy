import { readdirSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryInstitutionalStore } from "../../db/institutional";
import { MemoryCusipStore } from "../../db/source-collectors";
import { DATASETS_PAGE } from "./thirteenf";
import { chooseScanPeriod, runThirteenF, scanFilers } from "./thirteenf-holdings";
import { buildZip, COMPANIES, fx, stubHttp } from "./testing";
import { issuerMatcher } from "./thirteenf";

const TRACKED = [{ cik: 9001, name: "Alpha Capital" }, { cik: 9002, name: "Beta Partners" }, { cik: 9003, name: "Gamma Fund" }];
const header = "ACCESSION_NUMBER\tINFOTABLE_SK\tNAMEOFISSUER\tTITLEOFCLASS\tCUSIP\tVALUE\tSSHPRNAMT\tSSHPRNAMTTYPE\tPUTCALL";
const NVDA = (a: string, n: number, shares: number, value: number) => `${a}\t${n}\tNVIDIA CORP\tCOM\t67066G104\t${value}\t${shares}\tSH\t`;
const PLTR = (a: string, n: number, shares: number, value: number) => `${a}\t${n}\tPALANTIR TECHNOLOGIES INC\tCOM\t69608A108\t${value}\t${shares}\tSH\t`;
const zipOf = (submissions: string[], rows: string[]) => buildZip({
  "SUBMISSION.tsv": ["ACCESSION_NUMBER\tFILING_DATE\tSUBMISSIONTYPE\tCIK\tPERIODOFREPORT", ...submissions].join("\n") + "\n",
  "COVERPAGE.tsv": "ACCESSION_NUMBER\tFILINGMANAGER_NAME\nX\tX\n", "INFOTABLE.tsv": [header, ...rows].join("\n") + "\n" });

// Q1: three tracked filers, two universe names. Noise: an untracked filer, an amendment, an option line, a non-universe issuer.
const q1 = zipOf(["A1\t10-MAY-2026\t13F-HR\t9001\t31-MAR-2026", "A2\t11-MAY-2026\t13F-HR\t9002\t31-MAR-2026", "A3\t12-MAY-2026\t13F-HR\t9003\t31-MAR-2026",
  "U1\t12-MAY-2026\t13F-HR\t5555\t31-MAR-2026", "A1X\t20-MAY-2026\t13F-HR/A\t9001\t31-MAR-2026"],
[NVDA("A1", 1, 100, 1000), PLTR("A1", 2, 50, 500), NVDA("A2", 3, 200, 2000), PLTR("A3", 4, 10, 100), NVDA("U1", 5, 999, 9999), NVDA("A1X", 6, 777, 7777),
  "A1\t7\tNVIDIA CORP\tCOM\t67066G104\t1\t1\tSH\tCall", "A2\t8\tACME INC\tCOM\t00000A100\t1\t1\tSH\t"]);
// Q2: Alpha adds NVDA and drops PLTR, Beta halves NVDA, Gamma opens NVDA and keeps PLTR.
const q2 = zipOf(["B1\t10-AUG-2026\t13F-HR\t9001\t30-JUN-2026", "B2\t11-AUG-2026\t13F-HR\t9002\t30-JUN-2026", "B3\t12-AUG-2026\t13F-HR\t9003\t30-JUN-2026"],
  [NVDA("B1", 1, 150, 1500), NVDA("B2", 2, 100, 1000), NVDA("B3", 3, 30, 300), PLTR("B3", 4, 10, 120)]);

const figi = (body: unknown) => JSON.stringify((body as { idValue: string }[]).map(({ idValue }) => idValue === "67066G104"
  ? { data: [{ figi: "BBG000BBJQV0", name: "NVIDIA CORP", ticker: "NVDA", exchCode: "US", securityType: "Common Stock" }] }
  : idValue === "69608A108" ? { data: [{ figi: "BBG000PLTR", name: "PALANTIR TECHNOLOGIES INC-A", ticker: "PLTR", exchCode: "US", securityType: "Common Stock" }] }
  : { warning: "No identifier found." }));
const http = (zip?: Buffer) => stubHttp((call) => {
  if (call.url === DATASETS_PAGE) return fx("sec_13f_page.html");
  if (call.url.endsWith("company_tickers.json")) return fx("sec_company_tickers.json");
  if (call.url.endsWith("/v3/mapping")) return figi(call.body);
  throw new Error(`unrouted ${call.url}`);
}, (url) => url.endsWith("_form13f.zip") ? zip : undefined);

async function withZip<T>(data: Buffer, run: (file: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "13fh-test-"));
  try { const file = join(dir, "fixture_form13f.zip"); await writeFile(file, data); return await run(file); } finally { await rm(dir, { recursive: true, force: true }); }
}
const base = { companies: COMPANIES, now: new Date("2026-11-20T12:00:00Z"), tracked: TRACKED };

describe("13F holdings of tracked institutions (D22)", () => {
  it("scans only tracked 13F-HR filings and name-matched positions", async () => {
    await withZip(q1, async (file) => {
      const scan = await scanFilers(file, TRACKED, issuerMatcher(new Map([["NVDA", "NVIDIA CORP"], ["PLTR", "Palantir Technologies Inc."]])));
      expect(chooseScanPeriod(scan)).toBe("2026-03-31");
      const filings = scan.periods.get("2026-03-31")!;
      expect([...filings.keys()].sort()).toEqual([9001, 9002, 9003]);
      expect(filings.get(9001)!.accession).toBe("A1");
      expect(filings.get(9001)!.cusips.get("67066G104")).toEqual({ shares: 100, value: 1000 });
    });
  });

  it("first quarter stores 4 baseline rows and no change fact; a second run adds nothing", async () => {
    const store = new MemoryInstitutionalStore(), cusips = new MemoryCusipStore();
    await withZip(q1, async (zipPath) => {
      const first = await runThirteenF({ ...base, http: http(), store, cusips, dryRun: false, zipPath });
      expect(first).toMatchObject({ period: "2026-03-31", filersFound: 3, filersNew: 3, rowsAdded: 4 });
      expect(first.facts).toEqual([]);
      expect([...store.holdings.values()].every((row) => row.changeShares === null && row.priorPeriod === null)).toBe(true);
      expect(cusips.rows.get("67066G104")?.symbol).toBe("NVDA");
      const second = await runThirteenF({ ...base, http: http(), store, cusips, dryRun: false, zipPath });
      expect(second).toMatchObject({ filersNew: 0, rowsAdded: 0, facts: [] });
      expect(store.holdings.size).toBe(4);
    });
  });

  it("second quarter stores change against each filer's earlier quarter and writes institutional_net_change with filings as evidence", async () => {
    const store = new MemoryInstitutionalStore(), cusips = new MemoryCusipStore();
    await withZip(q1, (zipPath) => runThirteenF({ ...base, http: http(), store, cusips, dryRun: false, zipPath }));
    const result = await withZip(q2, (zipPath) => runThirteenF({ ...base, http: http(), store, cusips, dryRun: false, zipPath }));
    expect(result).toMatchObject({ period: "2026-06-30", filersNew: 3, rowsAdded: 5 });
    const row = (cik: number, ticker: string) => store.holdings.get(`2026-06-30:${cik}:${ticker}`)!;
    expect(row(9001, "NVDA")).toMatchObject({ shares: 150, changeShares: 50, priorPeriod: "2026-03-31" });
    expect(row(9001, "PLTR")).toMatchObject({ shares: 0, changeShares: -50 });
    expect(row(9002, "NVDA")).toMatchObject({ changeShares: -100 });
    expect(row(9003, "NVDA")).toMatchObject({ shares: 30, changeShares: 30 });
    expect(row(9003, "PLTR")).toMatchObject({ changeShares: 0 });
    const nvda = result.facts.find((fact) => fact.symbol === "NVDA")!;
    expect(nvda).toMatchObject({ key: "institutional_net_change", asOf: "2026-06-30" });
    expect(nvda.value).toMatchObject({ netChangeShares: -20, filersCompared: 3, increased: 2, decreased: 1, opened: 1, closed: 0, holders: 3, shares: 280 });
    expect(result.facts.find((fact) => fact.symbol === "PLTR")!.value).toMatchObject({ netChangeShares: -50, closed: 1, holders: 1 });
    const doc = result.documents.find((item) => item.symbol === "NVDA")!;
    expect(doc).toMatchObject({ source: "sec-13f", docType: "13F holdings change", meta: { display_allowed: true } });
    expect(nvda.documentUrls).toEqual([doc.url]);
    expect((doc.meta.filings as { url: string }[])[0].url).toBe("https://www.sec.gov/Archives/edgar/data/9001/B1/");
  });

  it("dry run stores nothing, not even rows", async () => {
    const store = new MemoryInstitutionalStore(), cusips = new MemoryCusipStore();
    const result = await withZip(q1, (zipPath) => runThirteenF({ ...base, http: http(), store, cusips, dryRun: true, zipPath }));
    expect(result.rowsAdded).toBe(4);
    expect(store.filings.size + store.holdings.size).toBe(0);
  });

  it("downloads the newest data set and deletes the temp zip", async () => {
    const before = readdirSync(tmpdir()).filter((name) => name.startsWith("13f-"));
    const stub = http(q1);
    const result = await runThirteenF({ ...base, http: stub, store: new MemoryInstitutionalStore(), cusips: new MemoryCusipStore(), dryRun: false });
    expect(result.rowsAdded).toBe(4);
    expect(stub.calls.some((call) => call.url.endsWith("01jun2026-31aug2026_form13f.zip"))).toBe(true);
    expect(readdirSync(tmpdir()).filter((name) => name.startsWith("13f-"))).toEqual(before);
  });

  it("skips with a reason when no tracked filer is in the data set", async () => {
    const empty = zipOf(["Z1\t10-AUG-2026\t13F-HR\t5555\t30-JUN-2026"], [NVDA("Z1", 1, 5, 5)]);
    const result = await withZip(empty, (zipPath) => runThirteenF({ ...base, http: http(), store: new MemoryInstitutionalStore(), cusips: new MemoryCusipStore(), dryRun: false, zipPath }));
    expect(result.skipped).toMatch(/no 13F-HR from tracked filers/);
  });
});
