import { readdirSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryCollectorRepository } from "../../db/collectors";
import { MemoryCusipStore } from "../../db/source-collectors";
import { computeGrowth, collectFrames, latestQuarter, parseFrame, shift, type FrameValue } from "./frames";
import { collectGetcurrent, parseFeed } from "./getcurrent";
import { mapCusips, pickListing } from "./openfigi";
import { runExtraSources } from "./registry";
import { collect13f, DATASETS_PAGE, issuerMatcher, normalizeIssuer, parseDatasetLinks, reportPeriod, scanDataset } from "./thirteenf";
import { buildZip, COMPANIES, context, fx, stubHttp, type Call } from "./testing";
import { entryStream, listZip, tsvRows } from "./zip";

const frameRoutes = (call: Call): string => {
  const frame = /frames\/us-gaap\/(\w+)\/USD\/(CY\d{4}Q\d)\.json$/.exec(call.url);
  if (frame) { const name = `sec_frame_${frame[1]}_${frame[2]}.json`; try { return fx(name); } catch { return JSON.stringify({ data: [] }); } }
  if (call.url.endsWith("company_tickers.json")) return fx("sec_company_tickers.json");
  throw new Error(`unrouted ${call.url}`);
};

describe("SEC XBRL frames", () => {
  it("picks the latest quarter that ended at least 45 days ago", () => {
    expect(latestQuarter(new Date("2026-10-05T00:00:00Z"))).toEqual({ year: 2026, q: 2 });
    expect(latestQuarter(new Date("2026-08-13T00:00:00Z"))).toEqual({ year: 2026, q: 1 });
    expect(latestQuarter(new Date("2026-08-14T00:00:00Z"))).toEqual({ year: 2026, q: 2 });
    expect(shift({ year: 2026, q: 1 }, -5)).toEqual({ year: 2024, q: 4 });
  });

  it("computes YoY, QoQ and acceleration and ranks discovery names outside the universe", async () => {
    const http = stubHttp(frameRoutes);
    const output = await collectFrames(context(http, { symbols: ["NVDA", "PLTR", "SQ", "GOOGL"] }));
    expect(http.calls.filter((call) => call.url.includes("/frames/"))).toHaveLength(16);
    const discovery = output.documents.find((doc) => doc.symbol === null)!;
    const items = discovery.meta.items as { ticker: string; rank: number; accelerationPp: number }[];
    expect(items.map((item) => item.ticker)).toEqual(["ACME", "BETA"]);
    expect(items[0]).toMatchObject({ rank: 1, accelerationPp: 28.57 });
    expect(items[1]).toMatchObject({ rank: 2, accelerationPp: 11.11 });
    expect(discovery.body).toContain("Top 2 accelerating revenue growers");
    expect(discovery.body).not.toContain("Tiny Labs");
    expect(discovery.body).not.toContain("Drop Fast");
    const pltr = output.facts.find((fact) => fact.symbol === "PLTR")!;
    expect(pltr).toMatchObject({ key: "revenue_growth_quarterly", asOf: "2026-06-30", value: { quarter: "CY2026Q2", yoyPercent: 47.06, priorYoyPercent: 42.86, accelerationPp: 4.2, rank: 3, eligible: 6 } });
    expect(output.facts.find((fact) => fact.symbol === "NVDA")!.value).toMatchObject({ accelerationPp: -13.95, rank: 6 });
    expect(output.facts.find((fact) => fact.symbol === "SQ")!.value).toMatchObject({ concept: "Revenues" });
    expect(output.facts.find((fact) => fact.symbol === "GOOGL")!.value).toMatchObject({ concept: "RevenueFromContractWithCustomerExcludingAssessedTax" });
    for (const fact of output.facts) expect(output.documents.map((doc) => doc.url)).toEqual(expect.arrayContaining(fact.documentUrls));
    for (const doc of output.documents) expect(doc.meta).toMatchObject({ display_allowed: true, license_note: expect.stringContaining("SEC") });
  });

  it("only emits facts for the selected symbols but still ranks the whole market", async () => {
    const output = await collectFrames(context(stubHttp(frameRoutes), { symbols: ["PLTR"] }));
    expect(output.facts.map((fact) => fact.symbol)).toEqual(["PLTR"]);
    expect((output.facts[0].value as { eligible: number }).eligible).toBe(6);
  });

  it("skips filers that miss a quarter or have a non-positive base", () => {
    const row = (value: number): FrameValue => ({ value, end: "2026-06-30", name: "X" });
    const frames = (values: Record<string, number | undefined>) => new Map(Object.entries(values).flatMap(([name, value]) => value === undefined ? [] : [[name, new Map([[1, row(value)]])] as const]));
    const complete = new Map([["Revenues", frames({ CY2026Q2: 120, CY2026Q1: 110, CY2025Q2: 100, CY2025Q1: 100 })]]);
    expect(computeGrowth(complete, { year: 2026, q: 2 })).toMatchObject([{ yoyPercent: 20, qoqPercent: 9.09, priorYoyPercent: 10, accelerationPp: 10 }]);
    expect(computeGrowth(new Map([["Revenues", frames({ CY2026Q2: 120, CY2026Q1: 110, CY2025Q2: 100 })]]), { year: 2026, q: 2 })).toEqual([]);
    expect(computeGrowth(new Map([["Revenues", frames({ CY2026Q2: 120, CY2026Q1: 110, CY2025Q2: 0, CY2025Q1: 100 })]]), { year: 2026, q: 2 })).toEqual([]);
  });

  it("rejects a frame without a data array", () => {
    expect(() => parseFrame("{}")).toThrow("no data array");
    expect(() => parseFrame("<html>")).toThrow("not JSON");
  });

  it("is idempotent on a second run and writes the discovery list with a null symbol", async () => {
    const repo = new MemoryCollectorRepository();
    const options = { since: "2026-09-05", now: new Date("2026-10-05T12:00:00Z"), http: stubHttp(frameRoutes), companies: COMPANIES, symbols: ["NVDA", "PLTR"] };
    const first = await runExtraSources(repo, ["frames"], options);
    const second = await runExtraSources(repo, ["frames"], options);
    expect(first.exitCode).toBe(0);
    expect(first.documentsWritten).toBe(3);
    expect(first.factsWritten).toBe(2);
    expect(second.documentsWritten).toBe(0);
    expect(second.factsWritten).toBe(0);
    expect([...repo.documents.values()].filter((doc) => doc.symbol === null)).toHaveLength(1);
    expect([...repo.facts.values()].every((fact) => fact.documentIds.length === 1)).toBe(true);
  });
});

describe("SEC getcurrent", () => {
  it("merges the subject and the filer entries of one accession", () => {
    const filings = parseFeed(fx("sec_getcurrent_13g.xml"));
    expect(filings).toHaveLength(3);
    const first = filings.find((filing) => filing.accession === "0001193125-26-400001")!;
    expect(first).toMatchObject({ form: "SCHEDULE 13G/A", filed: "2026-10-02", issuer: { cik: 1045810 }, filer: { name: "Example Capital Management LP" } });
    expect(first.url).toBe("https://www.sec.gov/Archives/edgar/data/1045810/000119312526400001/0001193125-26-400001-index.htm");
    expect(parseFeed(fx("sec_getcurrent_8k.xml")).map((filing) => filing.issuer?.cik)).toEqual([1045810, 9100099]);
    expect(parseFeed("<feed xmlns=\"http://www.w3.org/2005/Atom\"></feed>")).toEqual([]);
  });

  it("stores universe 13D, 13G and 8-K filings and a holder-event fact, and drops old and unknown issuers", async () => {
    const http = stubHttp((call) => {
      if (call.url.endsWith("company_tickers.json")) return fx("sec_company_tickers.json");
      if (call.url.includes("SCHEDULE%2013G")) return fx("sec_getcurrent_13g.xml");
      if (call.url.includes("SCHEDULE%2013D")) return fx("sec_getcurrent_13d.xml");
      if (call.url.includes("type=8-K")) return fx("sec_getcurrent_8k.xml");
      throw new Error(`unrouted ${call.url}`);
    });
    const output = await collectGetcurrent(context(http));
    expect(output.documents.map((doc) => `${doc.symbol} ${doc.docType}`).sort()).toEqual(["NVDA 8-K", "NVDA SCHEDULE 13G/A", "PLTR SCHEDULE 13D"]);
    const nvda13g = output.documents.find((doc) => doc.docType === "SCHEDULE 13G/A")!;
    expect(nvda13g.body).toContain("filed 2026-10-02 by Example Capital Management LP for NVIDIA CORP");
    expect(nvda13g.meta).toMatchObject({ signal: "new 5 percent holder event", display_allowed: true });
    expect([...output.facts].sort((a, b) => a.symbol.localeCompare(b.symbol))).toEqual([
      { symbol: "NVDA", key: "holder_5pct_events", asOf: "2026-10-02", documentUrls: [nvda13g.url], value: { count: 1, events: [{ form: "SCHEDULE 13G/A", holder: "Example Capital Management LP", accession: "0001193125-26-400001" }] } },
      { symbol: "PLTR", key: "holder_5pct_events", asOf: "2026-10-05", documentUrls: [expect.stringContaining("400010")], value: { count: 1, events: [expect.objectContaining({ form: "SCHEDULE 13D" })] } },
    ]);
    expect(http.calls.map((call) => call.url).filter((url) => url.includes("getcurrent")).every((url) => url.includes("count=100"))).toBe(true);
  });
});

describe("zip reader", () => {
  it("lists entries and streams stored and deflated content line by line", async () => {
    const dir = await mkdtemp(join(tmpdir(), "zip-test-"));
    try {
      const file = join(dir, "a.zip");
      await writeFile(file, buildZip({ "A.tsv": "ID\tNAME\n1\tone\n2\ttwo\n", "B.txt": "plain" }, ["B.txt"]));
      const entries = await listZip(file);
      expect(entries.map((entry) => [entry.name, entry.method])).toEqual([["A.tsv", 8], ["B.txt", 0]]);
      const rows: Record<string, string>[] = [];
      for await (const row of tsvRows(file, entries[0])) rows.push(row);
      expect(rows).toEqual([{ ID: "1", NAME: "one" }, { ID: "2", NAME: "two" }]);
      let stored = "";
      for await (const chunk of await entryStream(file, entries[1])) stored += chunk;
      expect(stored).toBe("plain");
      await writeFile(join(dir, "bad.zip"), "not a zip");
      await expect(listZip(join(dir, "bad.zip"))).rejects.toThrow("Not a zip file");
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});

describe("13F data sets", () => {
  it("reads the current zip link from the page and never guesses one", () => {
    const links = parseDatasetLinks(fx("sec_13f_page.html"));
    expect(links.map((link) => link.file)).toEqual(["01jun2026-31aug2026_form13f.zip", "01mar2026-31may2026_form13f.zip", "2025q2_form13f.zip"]);
    expect(links[0]).toMatchObject({ url: "https://www.sec.gov/files/datastandardsinnovation/data/form-13f-data-sets/01jun2026-31aug2026_form13f.zip", end: "2026-08-31" });
    expect(parseDatasetLinks("<a href=\"/x/readme.pdf\">x</a>")).toEqual([]);
  });

  it("normalises issuer names and matches universe names by prefix only", () => {
    expect(normalizeIssuer("NVIDIA CORP")).toBe("NVIDIA");
    expect(normalizeIssuer("Block, Inc.")).toBe("BLOCK");
    const matches = issuerMatcher(new Map([["NVDA", "NVIDIA CORP"], ["SQ", "Block, Inc."]]));
    expect(matches("NVIDIA CORPORATION")).toBe(true);
    expect(matches("BLOCK INC")).toBe(true);
    expect(matches("BLOCKBUSTER ENTERTAINMENT")).toBe(false);
    expect(matches("NVIDIA ROYALTY TRUST")).toBe(true); // name prefilter only; OpenFIGI decides
    expect(matches("ACME INC")).toBe(false);
    expect(reportPeriod("30-JUN-2026")).toBe("2026-06-30");
    expect(reportPeriod("garbage")).toBeUndefined();
  });

  const submissions = ["ACCESSION_NUMBER\tFILING_DATE\tSUBMISSIONTYPE\tCIK\tPERIODOFREPORT"];
  const infotable = ["ACCESSION_NUMBER\tINFOTABLE_SK\tNAMEOFISSUER\tTITLEOFCLASS\tCUSIP\tVALUE\tSSHPRNAMT\tSSHPRNAMTTYPE\tPUTCALL"];
  for (let i = 0; i < 60; i++) {
    submissions.push(`A${i}\t01-AUG-2026\t13F-HR\t${1000 + i}\t30-JUN-2026`);
    infotable.push(`A${i}\t${i}\tNVIDIA CORP\tCOM\t67066G104\t1000\t10\tSH\t`);
    if (i % 2 === 0) infotable.push(`A${i}\t${i + 100}\tNVIDIA CORP\tCOM\t67066G104\t500\t5\tSH\t`); // second line from the same filer: one holder
  }
  submissions.push("LATE\t02-AUG-2026\t13F-HR\t2000\t31-MAR-2026", "AMEND\t03-AUG-2026\t13F-HR/A\t2001\t30-JUN-2026");
  infotable.push("LATE\t900\tNVIDIA CORP\tCOM\t67066G104\t999\t99\tSH\t", "AMEND\t901\tNVIDIA CORP\tCOM\t67066G104\t999\t99\tSH\t");
  infotable.push("A1\t902\tNVIDIA CORP\tCOM\t67066G104\t999\t99\tSH\tPut", "A1\t903\tNVIDIA CORP\tNOTE\t67066G104\t999\t99\tPRN\t", "A1\t904\tACME INC\tCOM\t00000A100\t1\t1\tSH\t");
  for (let i = 0; i < 3; i++) { submissions.push(`P${i}\t01-AUG-2026\t13F-HR\t${3000 + i}\t30-JUN-2026`); infotable.push(`P${i}\t${i}\tPALANTIR TECHNOLOGIES INC\tCOM\t69608A108\t2000\t20\tSH\t`); }
  infotable.push("P0\t905\tPALANTIR TECHNOLOGIES INC\tCOM\t69608A999\t1\t1\tSH\t"); // a second Palantir-named CUSIP that OpenFIGI will not map to the universe
  const zip = buildZip({ "SUBMISSION.tsv": submissions.join("\n") + "\n", "COVERPAGE.tsv": "ACCESSION_NUMBER\tFILINGMANAGER_NAME\nA0\tX\n", "INFOTABLE.tsv": infotable.join("\n") + "\n" });
  const figi = (body: unknown) => JSON.stringify((body as { idValue: string }[]).map(({ idValue }) => idValue === "67066G104"
    ? { data: [{ figi: "BBG000BBJQV0", name: "NVIDIA CORP", ticker: "NVDA", exchCode: "US", securityType: "Common Stock" }] }
    : idValue === "69608A108" ? { data: [{ figi: "BBG000PLTR", name: "PALANTIR TECHNOLOGIES INC-A", ticker: "PLTR", exchCode: "US", securityType: "Common Stock" }] }
    : idValue === "69608A999" ? { data: [{ figi: "BBG000OTHER", name: "PALANTIR WARRANT", ticker: "PLTRW", exchCode: "US", securityType: "Warrant" }] }
    : { warning: "No identifier found." }));
  const http = () => stubHttp((call) => {
    if (call.url === DATASETS_PAGE) return fx("sec_13f_page.html");
    if (call.url.endsWith("company_tickers.json")) return fx("sec_company_tickers.json");
    if (call.url.endsWith("/v3/mapping")) return figi(call.body);
    throw new Error(`unrouted ${call.url}`);
  }, (url) => url.endsWith("01jun2026-31aug2026_form13f.zip") ? zip : undefined);

  it("scans the zip once and keeps only matching candidate CUSIPs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "scan-test-"));
    try {
      await writeFile(join(dir, "f.zip"), zip);
      const scan = await scanDataset(join(dir, "f.zip"), issuerMatcher(new Map([["NVDA", "NVIDIA CORP"], ["PLTR", "Palantir Technologies Inc."]])));
      expect([...scan.candidates.keys()].sort()).toEqual(["67066G104", "69608A108", "69608A999"]);
      const nvda = scan.candidates.get("67066G104")!;
      expect(nvda.get("2026-06-30")!.holders.size).toBe(60);
      expect(nvda.get("2026-06-30")!.shares).toBe(60 * 10 + 30 * 5);
      expect(nvda.get("2026-03-31")!.holders.size).toBe(1);
      expect(scan.filings).toBe(60 + 1 + 3); // 13F-HR only: the amendment is not counted
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it("maps CUSIPs for universe names only, caches them, and removes the temp file", async () => {
    const stub = http();
    const cusips = new MemoryCusipStore(() => new Date("2026-10-05T12:00:00Z"));
    const before = readdirSync(tmpdir()).filter((name) => name.startsWith("13f-"));
    const output = await collect13f(context(stub, { cusips, symbols: ["NVDA", "PLTR", "SQ"] }));
    expect(output.facts.map((fact) => [fact.symbol, fact.key, fact.asOf, (fact.value as { holders: number }).holders]).sort()).toEqual([["NVDA", "institutional_13f", "2026-06-30", 60], ["PLTR", "institutional_13f", "2026-06-30", 3]]);
    expect(output.facts.find((fact) => fact.symbol === "NVDA")!.value).toMatchObject({ shares: 750, valueUsd: 60000 + 30 * 500, dataset: "01jun2026-31aug2026_form13f.zip" });
    expect(output.documents.find((doc) => doc.symbol === "NVDA")).toMatchObject({ source: "sec-13f", docType: "13F holdings summary", meta: { display_allowed: true } });
    const posted = stub.calls.filter((call) => call.method === "POST").flatMap((call) => (call.body as { idValue: string }[]).map((job) => job.idValue));
    expect(posted.sort()).toEqual(["67066G104", "69608A108", "69608A999"]);
    expect(posted).not.toContain("00000A100");
    expect(cusips.rows.get("69608A999")?.symbol).toBeNull();
    expect(cusips.rows.get("67066G104")?.symbol).toBe("NVDA");
    expect(readdirSync(tmpdir()).filter((name) => name.startsWith("13f-"))).toEqual(before);

    const again = http();
    await collect13f(context(again, { cusips, symbols: ["NVDA", "PLTR"] }));
    expect(again.calls.filter((call) => call.method === "POST")).toHaveLength(0);
  });

  it("is idempotent when run twice into the repository", async () => {
    const repo = new MemoryCollectorRepository();
    const options = { since: "2026-09-05", now: new Date("2026-10-05T12:00:00Z"), companies: COMPANIES, symbols: ["NVDA", "PLTR"], cusips: new MemoryCusipStore() };
    const first = await runExtraSources(repo, ["13f"], { ...options, http: http() });
    const second = await runExtraSources(repo, ["13f"], { ...options, http: http() });
    expect([first.documentsWritten, first.factsWritten]).toEqual([2, 2]);
    expect([second.documentsWritten, second.factsWritten]).toEqual([0, 0]);
  });

  it("fails clearly when the page has no zip link and when the zip lacks a table", async () => {
    await expect(collect13f(context(stubHttp(() => "<html></html>")))).rejects.toThrow("no form13f.zip link");
    const before = readdirSync(tmpdir()).filter((name) => name.startsWith("13f-"));
    const broken = stubHttp((call) => call.url === DATASETS_PAGE ? fx("sec_13f_page.html") : fx("sec_company_tickers.json"), () => buildZip({ "SUBMISSION.tsv": "ACCESSION_NUMBER\n" }));
    await expect(collect13f(context(broken, { cusips: new MemoryCusipStore() }))).rejects.toThrow("no INFOTABLE.TSV");
    expect(readdirSync(tmpdir()).filter((name) => name.startsWith("13f-"))).toEqual(before);
  });
});

describe("OpenFIGI", () => {
  it("prefers the US common-stock listing and ignores warrants", () => {
    expect(pickListing([{ ticker: "NVDA", exchCode: "UN", securityType: "Common Stock" }, { ticker: "NVDA", exchCode: "US", securityType: "Common Stock" }])?.exchCode).toBe("US");
    expect(pickListing([{ ticker: "XWT", exchCode: "US", securityType: "Warrant" }])).toBeUndefined();
  });

  it("maps a recorded response and handles a not-found warning", async () => {
    const http = stubHttp(() => fx("openfigi_cusip.json"));
    const mapped = await mapCusips(http, ["67066G104", "000000000"]);
    expect(mapped).toEqual([{ cusip: "67066G104", ticker: "NVDA", figi: "BBG000BBJQV0", name: "NVIDIA CORP" }, { cusip: "000000000", ticker: null, figi: null, name: null }]);
    expect(http.calls[0].body).toEqual([{ idType: "ID_CUSIP", idValue: "67066G104" }, { idType: "ID_CUSIP", idValue: "000000000" }]);
    await expect(mapCusips(stubHttp(() => "[]"), ["67066G104"])).rejects.toThrow("does not match request size");
    await expect(mapCusips(stubHttp(() => JSON.stringify([{ error: "Invalid idType" }])), ["67066G104"])).rejects.toThrow("Invalid idType");
  });
});
