import { describe, expect, it } from "vitest";
import { MemoryCollectorRepository } from "../../db/collectors";
import { collectBls, parseSeries, yearOverYear } from "./bls";
import { CT_KEYWORDS, collectClinicalTrials, studyDocument, type Study } from "./clinicaltrials";
import { collectFed, FOMC_URL, H15_URL, parseH15, parseMeetings } from "./fed";
import { approvalDocuments, collectOpenfda, enforcementDocuments } from "./openfda";
import { runExtraSources } from "./registry";
import { COMPANIES, context, fx, stubHttp, type Call } from "./testing";
import { collectTreasury, parseRates } from "./treasury";
import { awardDocuments, collectUsaspending, RECIPIENTS, type Award } from "./usaspending";
import { collectVix, parseVix, VIX_URL } from "./vix";

const json = (name: string) => JSON.parse(fx(name));
const NOT_FOUND = JSON.stringify({ error: { code: "NOT_FOUND", message: "No matches found!" } });

describe("openFDA", () => {
  it("turns approved submissions in the window into productCatalyst documents", () => {
    const docs = approvalDocuments(json("openfda_drugsfda_regn.json").results, "2026-01-01", "REGN");
    expect(docs.map((doc) => doc.url)).toEqual([
      "https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=761355#SUPPL-5",
      "https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=761055#SUPPL-76",
      "https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=761055#SUPPL-82",
    ]);
    expect(docs[0]).toMatchObject({ source: "openfda", symbol: "REGN", docType: "FDA approval", publishedAt: "2026-04-02T00:00:00Z" });
    expect(docs[0].body).toContain("REGENERON PHARMACEUTICALS BLA761355 (EYLEA HD): submission SUPPL-5 approved 2026-04-02, class Efficacy");
    expect(docs[0].meta).toMatchObject({ signal: "productCatalyst", display_allowed: true, license_note: expect.stringContaining("CC0") });
  });

  it("limits discovery to original applications and leaves the symbol null", () => {
    const apps = json("openfda_discovery.json").results;
    expect(approvalDocuments(apps, "2026-09-01", null, { originalOnly: true })).toEqual([]);
    const docs = approvalDocuments(apps, "2025-01-01", null, { originalOnly: true });
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ symbol: null, docType: "FDA approval (discovery)", meta: { discovery: true, application: "NDA219713" } });
  });

  it("stores enforcement reports inside the window only", () => {
    const rows = json("openfda_enforcement_regn.json").results;
    expect(enforcementDocuments(rows, "2026-01-01", "REGN")).toEqual([]);
    const [doc] = enforcementDocuments(rows, "2024-01-01", "REGN");
    expect(doc.url).toBe("https://api.fda.gov/drug/enforcement.json?search=recall_number:%22D-0531-2024%22");
    expect(doc.body).toContain("Lack of Assurance of Sterility");
    expect(doc.publishedAt).toBe("2024-06-05T00:00:00Z");
  });

  it("treats NOT_FOUND as no results and queries only the configured biotech symbols", async () => {
    const http = stubHttp((call) => {
      if (call.url.includes("sponsor_name:REGENERON")) return JSON.stringify(json("openfda_drugsfda_regn.json"));
      if (call.url.includes("recalling_firm:Regeneron")) return JSON.stringify({ results: [] });
      if (call.url.includes("submission_status:AP")) return JSON.stringify(json("openfda_discovery.json"));
      return NOT_FOUND;
    });
    const output = await collectOpenfda(context(http, { since: "2026-01-01" }));
    const urls = http.calls.map((call) => decodeURIComponent(call.url));
    expect(urls.filter((url) => url.includes("sponsor_name:"))).toHaveLength(3);
    expect(urls.some((url) => url.includes("sponsor_name:VERTEX*"))).toBe(true);
    expect(urls.some((url) => url.includes("[20260101+TO+20261005]"))).toBe(true);
    expect(output.documents.filter((doc) => doc.symbol === "REGN")).toHaveLength(3);
    expect(output.documents.filter((doc) => doc.symbol === null)).toEqual([]);
    expect(output.facts).toEqual([]);
  });

  it("raises other openFDA errors", async () => {
    await expect(collectOpenfda(context(stubHttp(() => JSON.stringify({ error: { code: "SERVER_ERROR", message: "boom" } }))))).rejects.toThrow("openFDA: boom");
  });
});

describe("ClinicalTrials.gov", () => {
  it("builds trial documents with sponsor, phase, status and dates", () => {
    const [vertex] = json("clinicaltrials_vertex.json").studies as Study[];
    const doc = studyDocument(vertex, "VRTX", "2026-09-01")!;
    expect(doc).toMatchObject({ source: "clinicaltrials", symbol: "VRTX", url: "https://clinicaltrials.gov/study/NCT07792408", publishedAt: "2026-09-30T00:00:00Z" });
    expect(doc.body).toContain("Lead sponsor Vertex Pharmaceuticals Incorporated. Status RECRUITING, phase PHASE1, started 2026-09-01, primary completion 2027-03-11");
    expect(doc.meta).toMatchObject({ signal: "productCatalyst", display_allowed: false, license_note: expect.stringContaining("not cleared") });
    expect(studyDocument(vertex, "VRTX", "2026-10-01")).toBeUndefined();
    expect(studyDocument({ protocolSection: { identificationModule: { nctId: "bad" } } }, null, "2026-01-01")).toBeUndefined();
  });

  it("collects sponsor trials for universe biotech names and keyword discovery without duplicates", async () => {
    const http = stubHttp((call) => {
      const url = decodeURIComponent(call.url);
      if (url.includes("query.lead=Vertex")) return fx("clinicaltrials_vertex.json");
      if (url.includes("query.lead=")) return JSON.stringify({ studies: [] });
      if (url.includes("query.term=")) return fx("clinicaltrials_obesity.json");
      throw new Error(`unrouted ${url}`);
    });
    const output = await collectClinicalTrials(context(http, { since: "2026-09-01" }));
    expect(output.documents.filter((doc) => doc.symbol === "VRTX")).toHaveLength(3);
    const discovery = output.documents.filter((doc) => doc.symbol === null);
    expect(discovery.map((doc) => doc.meta.nctId).sort()).toEqual(["NCT07684235", "NCT07857473"]);
    expect(discovery[0].docType).toBe("clinical trial update (discovery)");
    expect(http.calls.filter((call) => decodeURIComponent(call.url).includes("query.term="))).toHaveLength(CT_KEYWORDS.length);
    expect(decodeURIComponent(http.calls[0].url)).toContain("AREA[LastUpdatePostDate]RANGE[2026-09-01,MAX]");
  });

  it("ignores studies whose lead sponsor does not match the configured company", async () => {
    const http = stubHttp((call) => decodeURIComponent(call.url).includes("query.lead=Vertex") ? fx("clinicaltrials_obesity.json") : JSON.stringify({ studies: [] }));
    const output = await collectClinicalTrials(context(http, { symbols: ["VRTX"], since: "2026-09-01" }));
    expect(output.documents.filter((doc) => doc.symbol === "VRTX")).toEqual([]);
  });
});

describe("USAspending", () => {
  it("stores contract awards with agency, amount and dates as dataTailwind documents", () => {
    const docs = awardDocuments(json("usaspending_palantir.json").results as Award[], "PLTR", "Palantir");
    expect(docs).toHaveLength(2);
    expect(docs[0]).toMatchObject({ source: "usaspending", symbol: "PLTR", docType: "contract award", publishedAt: "2026-09-30T00:00:00Z" });
    expect(docs[0].url).toMatch(/^https:\/\/www\.usaspending\.gov\/award\/CONT_AWD_/);
    expect(docs[0].body).toContain("PALANTIR TECHNOLOGIES INC. contract 12314426F0479 with Department of Agriculture: $856669");
    expect(docs[0].meta).toMatchObject({ signal: "dataTailwind", amount: 856668.56, display_allowed: true });
  });

  it("drops awards whose recipient does not contain the search name", () => {
    expect(awardDocuments(json("usaspending_palantir.json").results as Award[], "PLTR", "Oracle")).toEqual([]);
  });

  it("posts one search per configured symbol and writes a stable-dated fact", async () => {
    const http = stubHttp(() => fx("usaspending_palantir.json"));
    const output = await collectUsaspending(context(http, { symbols: ["PLTR", "NVDA", "REGN"] }));
    expect(http.calls).toHaveLength(2);
    expect(http.calls.every((call) => call.method === "POST" && call.url === "https://api.usaspending.gov/api/v2/search/spending_by_award/")).toBe(true);
    expect((http.calls[0].body as { filters: { recipient_search_text: string[]; time_period: unknown[] } }).filters).toMatchObject({ recipient_search_text: [RECIPIENTS.PLTR], time_period: [{ start_date: "2026-09-05", end_date: "2026-10-05" }] });
    const pltr = output.facts.find((fact) => fact.symbol === "PLTR")!;
    expect(pltr).toMatchObject({ key: "gov_contract_awards_window", asOf: "2026-09-30" });
    expect(output.documents.filter((doc) => doc.symbol === "PLTR")).toHaveLength(2);
    // NVDA's fixture rows are Palantir awards, so the recipient guard drops them
    expect(output.documents.filter((doc) => doc.symbol === "NVDA")).toEqual([]);
  });
});

describe("Fed", () => {
  it("reads FOMC meeting dates from the calendar JSON and strips the byte order mark", () => {
    const text = fx("fed_calendar.json");
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const meetings = parseMeetings(text);
    expect(meetings.map((meeting) => meeting.date)).toEqual(["2026-09-16", "2026-10-28", "2026-12-09"]);
    expect(meetings[1].text).toBe("Two-day meeting, October 27 - 28 Press Conference");
    expect(() => parseMeetings("{}")).toThrow("no events array");
  });

  it("parses the H.15 CSV, skipping ND and metadata rows", () => {
    const rows = parseH15(fx("fed_h15.csv"));
    expect(rows).toHaveLength(5);
    expect(rows.at(-1)).toEqual({ date: "2026-10-01", values: { "3M": 4.17, "2Y": 4.78, "10Y": 5.24, "30Y": 5.61 } });
    expect(parseH15(fx("fed_h15.csv").replace("5.12,5.24,5.64", "5.12,ND,5.64")).at(-1)!.values["10Y"]).toBeUndefined();
    expect(() => parseH15("a,b\n1,2")).toThrow("no Time Period header");
  });

  it("stores the next meetings and the latest yields without a symbol", async () => {
    const http = stubHttp((call) => call.url === FOMC_URL ? fx("fed_calendar.json") : call.url === H15_URL ? fx("fed_h15.csv") : "");
    const output = await collectFed(context(http));
    const [calendar, yields] = output.documents;
    expect(calendar.body).toContain("2026-10-28 (Two-day meeting, October 27 - 28 Press Conference)");
    expect(calendar.body).not.toContain("2026-09-16");
    expect(yields).toMatchObject({ symbol: null, publishedAt: "2026-10-01T00:00:00Z", meta: { spread10y2y: 0.46, display_allowed: true } });
    expect(yields.body).toContain("10Y 5.24%");
  });
});

describe("Treasury FiscalData", () => {
  it("summarises the latest monthly average rates and the previous month", async () => {
    expect(parseRates(fx("treasury_rates.json"))).toHaveLength(6);
    const output = await collectTreasury(context(stubHttp(() => fx("treasury_rates.json"))));
    expect(output.documents).toHaveLength(1);
    expect(output.documents[0].body).toContain("2026-08-31: Treasury Bills 3.788%, Treasury Notes 3.345%, Treasury Bonds 3.453%");
    expect(output.documents[0].body).toContain("Previous month: Treasury Bills 3.758%");
    expect(output.documents[0].meta).toMatchObject({ display_allowed: true, license_note: expect.stringContaining("Treasury") });
    expect(() => parseRates("{}")).toThrow("no data array");
  });
});

describe("BLS v1", () => {
  it("parses a recorded response, newest first, skipping annual and missing values", () => {
    const [series] = parseSeries(fx("bls_unemployment.json"));
    expect(series.id).toBe("LNS14000000");
    expect(series.observations[0]).toEqual({ year: 2026, month: 9, value: 4.2 });
    const odd = JSON.stringify({ status: "REQUEST_SUCCEEDED", Results: { series: [{ seriesID: "X", data: [{ year: "2026", period: "M13", value: "1" }, { year: "2026", period: "M01", value: "-" }, { year: "2026", period: "M02", value: "2" }] }] } });
    expect(parseSeries(odd)[0].observations).toEqual([{ year: 2026, month: 2, value: 2 }]);
  });

  it("reports a rejected request with the BLS message", () => {
    expect(() => parseSeries(JSON.stringify({ status: "REQUEST_NOT_PROCESSED", message: ["daily threshold reached"] }))).toThrow("BLS: REQUEST_NOT_PROCESSED (daily threshold reached)");
  });

  it("computes year over year from the same month a year earlier", () => {
    const observations = [{ year: 2026, month: 8, value: 330 }, { year: 2026, month: 7, value: 329 }, { year: 2025, month: 8, value: 300 }];
    expect(yearOverYear(observations)).toBe(10);
    expect(yearOverYear([{ year: 2026, month: 8, value: 330 }])).toBeNull();
  });

  it("sends one query with all series and stores one document per series", async () => {
    const cpi = { seriesID: "CUUR0000SA0", data: [{ year: "2026", period: "M08", value: "330.0" }, { year: "2025", period: "M08", value: "300.0" }] };
    const real = JSON.parse(fx("bls_unemployment.json")).Results.series[0];
    const http = stubHttp(() => JSON.stringify({ status: "REQUEST_SUCCEEDED", message: [], Results: { series: [real, cpi] } }));
    const output = await collectBls(context(http));
    expect(http.calls).toHaveLength(1);
    expect(http.calls[0].body).toMatchObject({ seriesid: ["CUUR0000SA0", "LNS14000000", "CES0000000001"], startyear: "2025", endyear: "2026" });
    expect(output.documents.map((doc) => doc.url).sort()).toEqual(["https://data.bls.gov/timeseries/CUUR0000SA0", "https://data.bls.gov/timeseries/LNS14000000"]);
    expect(output.documents.find((doc) => doc.url.endsWith("CUUR0000SA0"))!.body).toContain("Year over year 10% in 2026-08");
  });
});

describe("Cboe VIX", () => {
  it("parses MM/DD/YYYY rows and rejects an unexpected header", () => {
    const rows = parseVix(fx("cboe_vix.csv"));
    expect(rows.at(-1)).toEqual({ date: "2026-10-02", close: 15.31 });
    expect(rows).toHaveLength(270);
    expect(() => parseVix("<html>redirect</html>")).toThrow("unexpected header");
  });

  it("asks only for the cdn-api.cboe.com redirect and stores the close with context", async () => {
    let options: { redirectHosts?: string[] } | undefined;
    const http = stubHttp(() => fx("cboe_vix.csv"));
    const get = http.get.bind(http);
    http.get = async (url, opts) => { options = opts; return get(url, opts); };
    const output = await collectVix(context(http));
    expect(http.calls[0].url).toBe(VIX_URL);
    expect(options?.redirectHosts).toEqual(["cdn-api.cboe.com"]);
    expect(output.documents[0]).toMatchObject({ source: "cboe", symbol: null, publishedAt: "2026-10-02T00:00:00Z", meta: { close: 15.31, display_allowed: false } });
    expect(output.documents[0].body).toContain("VIX close 2026-10-02: 15.31");
  });
});

describe("run, dedupe and licence flags across the government sources", () => {
  it("writes documents once, re-runs without writes and every document carries a licence note and display flag", async () => {
    const http = stubHttp((call: Call) => {
      const url = decodeURIComponent(call.url);
      if (url.includes("api.fda.gov")) return url.includes("drugsfda") && url.includes("REGENERON") ? fx("openfda_drugsfda_regn.json") : NOT_FOUND;
      if (url.includes("clinicaltrials.gov")) return url.includes("query.lead=Vertex") ? fx("clinicaltrials_vertex.json") : JSON.stringify({ studies: [] });
      if (call.url.includes("usaspending")) return fx("usaspending_palantir.json");
      if (call.url === FOMC_URL) return fx("fed_calendar.json");
      if (call.url === H15_URL) return fx("fed_h15.csv");
      if (call.url.includes("fiscaldata")) return fx("treasury_rates.json");
      if (call.url === VIX_URL) return fx("cboe_vix.csv");
      throw new Error(`unrouted ${call.url}`);
    });
    const repo = new MemoryCollectorRepository();
    const options = { since: "2026-01-01", now: new Date("2026-10-05T12:00:00Z"), http, companies: COMPANIES, symbols: ["PLTR", "VRTX", "REGN", "CRSP"] };
    const names = ["openfda", "clinicaltrials", "usaspending", "fed", "treasury", "vix"] as const;
    const first = await runExtraSources(repo, [...names], options);
    const second = await runExtraSources(repo, [...names], options);
    expect(first.exitCode).toBe(0);
    expect(first.documentsWritten).toBeGreaterThan(8);
    expect(first.factsWritten).toBe(1);
    expect(second.documentsWritten).toBe(0);
    expect(second.factsWritten).toBe(0);
    expect(repo.runs).toHaveLength(2);
    for (const doc of repo.documents.values()) {
      expect(typeof doc.meta.license_note).toBe("string");
      expect(typeof doc.meta.display_allowed).toBe("boolean");
      expect(doc.url.startsWith("https://")).toBe(true);
      expect(Buffer.byteLength(doc.body)).toBeLessThanOrEqual(204800);
    }
    const allowed = Object.fromEntries([...repo.documents.values()].map((doc) => [doc.source, doc.meta.display_allowed]));
    expect(allowed).toEqual({ openfda: true, clinicaltrials: false, usaspending: true, fed: true, treasury: true, cboe: false });
  });
});
