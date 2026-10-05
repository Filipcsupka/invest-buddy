import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryCollectorRepository } from "../../db/collectors";
import { MemoryCusipStore } from "../../db/source-collectors";
import { RateLimitLockout } from "../http";
import { runCollect } from "../../jobs/collect";
import { collectGdelt, docUrl, parseArticles } from "./gdelt";
import { collectGnews, parseNews, searchUrl } from "./gnews";
import { runPing } from "./common";
import { formatPings, PING_NAMES, runExtraSources, runPings, SOURCES } from "./registry";
import { COMPANIES, context, fx, stubHttp, type Call } from "./testing";
import { DATASETS_PAGE } from "./thirteenf";

describe("Google News RSS", () => {
  it("keeps headline, link, outlet and time only", () => {
    const items = parseNews(fx("gnews_nvidia.xml"));
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({ headline: "Nvidia Stock Chases Record High as Key Supplier’s Revenue Booms on AI Demand", source: "Barron's",
      link: expect.stringMatching(/^https:\/\/news\.google\.com\/rss\/articles\//), published: "2026-10-05T13:57:00.000Z" });
    expect(Object.keys(items[0]).sort()).toEqual(["headline", "link", "published", "source"]);
    expect(() => parseNews("<html></html>")).toThrow("not an RSS feed");
  });

  it("stores headlines with a null symbol, merges tickers and themes per link and marks them not displayable", async () => {
    const http = stubHttp(() => fx("gnews_nvidia.xml"));
    const output = await collectGnews(context(http, { symbols: ["NVDA", "PLTR"], since: "2026-10-01" }));
    // two ticker queries plus one per sector theme
    expect(http.calls).toHaveLength(2 + 4);
    expect(http.calls[0].url).toBe(searchUrl('"NVIDIA" stock when:2d'));
    expect(output.documents).toHaveLength(3);
    const first = output.documents[0];
    expect(first).toMatchObject({ source: "gnews", symbol: null, docType: "news headline", body: expect.not.stringContaining("Barron") });
    expect(first.meta).toMatchObject({ symbols: ["NVDA", "PLTR"], display_allowed: false, license_note: expect.stringContaining("non-commercial"), outlet: "Barron's" });
    expect((first.meta.themes as string[]).length).toBeGreaterThan(0);
    expect(JSON.stringify(first)).not.toContain("<a href");
  });

  it("drops items older than since and uses disambiguated search names", async () => {
    const http = stubHttp(() => fx("gnews_nvidia.xml"));
    const output = await collectGnews(context(http, { symbols: ["SQ"], since: "2026-10-06" }));
    expect(output.documents).toEqual([]);
    expect(http.calls[0].url).toBe(searchUrl('"Block Inc" stock when:2d'));
  });
});

describe("GDELT DOC 2.0", () => {
  it("parses seendate, skips non-HTTPS links and tolerates the empty object", () => {
    const { articles, skippedInsecure } = parseArticles(fx("gdelt_nvidia.json"));
    expect(skippedInsecure).toBe(1);
    expect(articles.map((article) => article.published)).toEqual(["2026-10-05T09:30:00Z", "2026-09-20T12:00:00Z"]);
    expect(articles[1].headline).toBe("Chip stocks rally, Nvidia leads");
    expect(parseArticles("{}").articles).toEqual([]);
    expect(() => parseArticles("Please limit requests to one every 5 seconds")).toThrow("not JSON");
  });

  it("stores headline, link, outlet and time with display_allowed false and merges symbols per URL", async () => {
    const http = stubHttp(() => fx("gdelt_nvidia.json"));
    const output = await collectGdelt(context(http, { symbols: ["NVDA", "PLTR"], since: "2026-10-01" }));
    expect(http.calls.map((call) => call.url)).toEqual([docUrl('"NVIDIA" sourcelang:english'), docUrl('"Palantir" sourcelang:english')]);
    expect(output.documents).toHaveLength(1);
    expect(output.documents[0]).toMatchObject({ source: "gdelt", symbol: null, url: "https://www.example-news.test/nvidia-supplier-outlook", body: "Nvidia supplier lifts outlook on AI demand" });
    expect(output.documents[0].meta).toMatchObject({ symbols: ["NVDA", "PLTR"], outlet: "example-news.test", display_allowed: false });
  });

  it("a rate-limit lockout from one source does not stop the other sources", async () => {
    const http = stubHttp((call: Call) => { if (call.url.includes("gdelt")) throw new RateLimitLockout("HTTP 429 at https://api.gdeltproject.org/api/v2/doc/doc"); return fx("treasury_rates.json"); });
    const result = await runExtraSources(new MemoryCollectorRepository(), ["gdelt", "treasury"], { since: "2026-09-05", now: new Date("2026-10-05T12:00:00Z"), http, companies: COMPANIES, symbols: ["NVDA"] });
    expect(result.failures).toEqual([{ ticker: "gdelt", reason: "HTTP 429 at https://api.gdeltproject.org/api/v2/doc/doc" }]);
    expect(result.succeeded).toBe(1);
    expect(result.exitCode).toBe(1);
    expect(result.documentsWritten).toBe(1);
  });
});

describe("runner", () => {
  const phaseFile = (name: string) => readFileSync(join(process.cwd(), "src/collectors/fixtures", name), "utf8");
  const options = (http: ReturnType<typeof stubHttp>, symbols = ["NVDA"]) => ({ since: "2026-09-05", now: new Date("2026-10-05T12:00:00Z"), http, companies: COMPANIES, symbols });
  const secStub = (rate: Error) => stubHttp((call) => { if (call.url.includes("sec.gov")) throw rate; return fx("treasury_rates.json"); });

  it("skips the remaining SEC sources after a SEC 429 lockout but still runs the others", async () => {
    const http = secStub(new RateLimitLockout("HTTP 429 at https://data.sec.gov/x"));
    const result = await runExtraSources(new MemoryCollectorRepository(), ["frames", "getcurrent", "treasury"], options(http));
    expect(result.failures).toEqual([{ ticker: "frames", reason: "HTTP 429 at https://data.sec.gov/x" }, { ticker: "getcurrent", reason: "not fetched: SEC rate-limit lockout" }]);
    expect(result.stoppedReason).toBe("HTTP 429 at https://data.sec.gov/x");
    expect(result.succeeded).toBe(1);
    expect(http.calls.filter((call) => call.url.includes("getcurrent"))).toHaveLength(0);
  });

  it("writes nothing in dry-run mode, including the run record", async () => {
    const repo = new MemoryCollectorRepository();
    const result = await runExtraSources(repo, ["treasury"], { ...options(stubHttp(() => fx("treasury_rates.json"))), dryRun: true });
    expect(result.documentsParsed).toBe(1);
    expect(repo.documents.size + repo.facts.size + repo.runs.length).toBe(0);
  });

  it("drops facts for symbols that are not in the universe", async () => {
    const repo = new MemoryCollectorRepository();
    const http = stubHttp((call) => call.url.endsWith("company_tickers.json") ? fx("sec_company_tickers.json") : call.url.includes("/frames/") ? JSON.stringify({ data: [] }) : "");
    const result = await runExtraSources(repo, ["frames"], options(http));
    expect(result.factsComputed).toBe(0);
    expect(repo.facts.size).toBe(0);
  });

  it("runCollect runs the legacy default unchanged and routes new names through the registry", async () => {
    const repo = new MemoryCollectorRepository();
    const result = await runCollect(repo, ["NVDA"], { sources: ["treasury", "vix"], http: stubHttp((call) => call.url.includes("cboe") ? fx("cboe_vix.csv") : fx("treasury_rates.json")), now: () => new Date("2026-10-05T12:00:00Z") });
    expect(result).toMatchObject({ exitCode: 0, succeeded: 2, documentsWritten: 2 });
    const mixed = await runCollect(new MemoryCollectorRepository(), ["NVDA"], { sources: ["rss", "treasury"], since: "2026-09-01", get: async () => phaseFile("globenewswire.xml"), http: stubHttp(() => fx("treasury_rates.json")), now: () => new Date("2026-10-05T12:00:00Z") });
    expect(mixed).toMatchObject({ sources: ["rss", "treasury"], requested: 2, succeeded: 2, exitCode: 0 });
    expect(mixed.documentsWritten).toBe(2);
    const withCusips = await runCollect(repo, ["NVDA"], { sources: ["treasury"], http: stubHttp(() => fx("treasury_rates.json")), cusips: new MemoryCusipStore() });
    expect(withCusips.exitCode).toBe(0);
  });
});

describe("ping", () => {
  const phaseA = (name: string) => readFileSync(join(process.cwd(), "src/collectors/fixtures", name), "utf8");
  const routes = (call: Call): string => {
    const url = decodeURIComponent(call.url);
    if (url.includes("/frames/")) return JSON.stringify({ data: Array.from({ length: 120 }, (_, i) => ({ cik: i + 1, entityName: "X", end: "2026-03-31", val: 1 })) });
    if (url.includes("SCHEDULE 13G")) return fx("sec_getcurrent_13g.xml");
    if (url === DATASETS_PAGE) return fx("sec_13f_page.html");
    if (url.includes("openfigi")) return JSON.stringify([{ data: [{ figi: "BBG000BBJQV0", name: "NVIDIA CORP", ticker: "NVDA", exchCode: "US", securityType: "Common Stock" }] }]);
    if (url.includes("drugsfda")) return fx("openfda_drugsfda_regn.json");
    if (url.includes("clinicaltrials")) return fx("clinicaltrials_vertex.json");
    if (url.includes("usaspending")) return fx("usaspending_palantir.json");
    if (url.includes("datadownload")) return fx("fed_h15.csv");
    if (url.includes("fiscaldata")) return fx("treasury_rates.json");
    if (url.includes("api.bls.gov")) return fx("bls_unemployment.json");
    if (url.includes("cboe")) return fx("cboe_vix.csv");
    if (url.includes("news.google")) return fx("gnews_nvidia.xml");
    if (url.includes("gdelt")) return fx("gdelt_nvidia.json");
    if (url.includes("submissions/CIK")) return JSON.stringify({ filings: { recent: { form: ["8-K"], filingDate: ["2026-10-01"] } } });
    if (url.includes("globenewswire")) return phaseA("globenewswire.xml");
    if (url.includes("stlouisfed")) return JSON.stringify({ observations: [{ date: "2026-09-01", value: "4.25" }] });
    throw new Error(`unrouted ${url}`);
  };

  it("every source module has a ping and each passes against stubbed responses, one request each", async () => {
    expect(PING_NAMES).toEqual(["edgar", "rss", "fred", "frames", "getcurrent", "13f", "openfigi", "openfda", "clinicaltrials", "usaspending", "fed", "treasury", "bls", "vix", "gnews", "gdelt"]);
    expect(SOURCES.every((source) => typeof source.ping === "function")).toBe(true);
    const http = stubHttp(routes);
    const results = await runPings(undefined, http, { SEC_USER_AGENT: "Test Agent test@example.invalid", FRED_API_KEY: "k" });
    expect(results.map((result) => [result.source, result.ok, result.skipped ?? false])).toEqual(PING_NAMES.map((name) => [name, true, false]));
    for (const result of results) { expect(result.detail.length).toBeGreaterThan(0); expect(result.ms).toBeGreaterThanOrEqual(0); }
    expect(http.calls).toHaveLength(PING_NAMES.length);
    expect(http.calls.filter((call) => call.method === "POST").map((call) => new URL(call.url).hostname).sort()).toEqual(["api.bls.gov", "api.openfigi.com", "api.usaspending.gov"]);
  });

  it("skips SEC sources with a clear message when SEC_USER_AGENT is unset and makes no SEC request", async () => {
    const http = stubHttp(routes);
    const results = await runPings(["edgar", "frames", "getcurrent", "13f", "treasury"], http, {});
    expect(results.filter((result) => result.skipped).map((result) => result.source)).toEqual(["edgar", "frames", "getcurrent", "13f"]);
    expect(results[0].detail).toBe("skipped: SEC_USER_AGENT is missing or invalid");
    expect(results.every((result) => result.ok)).toBe(true);
    expect(http.calls.map((call) => call.url).filter((url) => url.includes("sec.gov"))).toEqual([]);
    const placeholder = await runPings(["edgar"], http, { SEC_USER_AGENT: "REPLACE_WITH_CONTACT_EMAIL" });
    expect(placeholder[0]).toMatchObject({ ok: true, skipped: true, detail: "skipped: SEC_USER_AGENT is missing or invalid" });
    expect(http.calls.map((call) => call.url).filter((url) => url.includes("sec.gov"))).toEqual([]);
  });

  it("skips FRED without a key and never prints the key", async () => {
    const [skipped] = await runPings(["fred"], stubHttp(routes), {});
    expect(skipped).toMatchObject({ source: "fred", ok: true, skipped: true, detail: "skipped: FRED_API_KEY is not set" });
    const keyed = stubHttp(() => JSON.stringify({ observations: [{ date: "2026-09-01", value: "4.25" }] }));
    const [done] = await runPings(["fred"], keyed, { FRED_API_KEY: "super-secret" });
    expect(done).toMatchObject({ ok: true, detail: "FEDFUNDS 2026-09-01 = 4.25" });
    expect(JSON.stringify(done)).not.toContain("super-secret");
  });

  it("reports failures without throwing and turns a hang into a timeout", async () => {
    const results = await runPings(["openfda", "vix"], stubHttp((call) => { if (call.url.includes("fda")) throw new Error("HTTP 500 at https://api.fda.gov/drug/drugsfda.json"); return "<html>blocked</html>"; }), {});
    expect(results.map((result) => [result.source, result.ok])).toEqual([["openfda", false], ["vix", false]]);
    expect(results[0].detail).toBe("HTTP 500 at https://api.fda.gov/drug/drugsfda.json");
    expect(results[1].detail).toBe("Cboe VIX: unexpected header");
    const hung = await runPing("slow", () => new Promise<string>(() => {}), { timeoutMs: 20 });
    expect(hung).toMatchObject({ source: "slow", ok: false, detail: "ping timed out" });
  });

  it("formats an aligned table with OK, FAIL and SKIP", () => {
    const table = formatPings([{ source: "openfda", ok: true, ms: 412, detail: "NDA1" }, { source: "gdelt", ok: false, ms: 80, detail: "HTTP 429" }, { source: "frames", ok: true, skipped: true, ms: 0, detail: "skipped: x" }]);
    expect(table.split("\n")).toEqual([
      "SOURCE   STATUS  MS   DETAIL",
      "openfda  OK      412  NDA1",
      "gdelt    FAIL    80   HTTP 429",
      "frames   SKIP    0    skipped: x",
    ]);
  });
});
