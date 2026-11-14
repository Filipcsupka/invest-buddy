import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssetDetail, AssetSummary } from "@/db/markets";
import { indexAnalytics, toRatingInputs } from "@/markets/index-analytics";

const auth = vi.hoisted(() => ({ header: null as string | null, viewer: null as unknown }));
const data = vi.hoisted(() => ({ summaries: [] as unknown[], detail: null as unknown, model: null as unknown, componentFacts: { asOf: null as string | null, rows: [] as unknown[] }, components: { asOf: null as string | null, rows: [] as unknown[] }, runs: [] as unknown[], results: { asOf: null as string | null, rows: [] as unknown[] } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/viewer/get-viewer", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/viewer/get-viewer")>();
  return { ...real, getViewer: async () => auth.viewer ?? real.resolveViewer(undefined, null, auth.header !== null) };
});
vi.mock("@/db/markets", async (original) => ({
  ...(await original<typeof import("@/db/markets")>()),
  assetSummaries: async () => data.summaries, assetDetail: async () => data.detail, indexComponents: async () => data.components, indexComponentFacts: async () => data.componentFacts, indexRatingReadModel: async () => data.model,
}));
vi.mock("@/db/screener", async (original) => ({ ...(await original<typeof import("@/db/screener")>()), latestScreenerRuns: async () => data.runs, screenerResults: async () => data.results }));

const Indices = (await import("./page")).default;
const IndexDetail = (await import("./[symbol]/page")).default;
const Screener = (await import("../screener/page")).default;

const owner = "owner-session";
const summary = (over: Partial<AssetSummary>): AssetSummary => ({ symbol: "GSPC.INDX", code: "GSPC", name: "S&P 500 Index", currency: "USD", assetClass: "index", lastDate: "2026-11-05",
  last: 7720.39, change1d: -0.003, change5d: 0.012, changeYtd: 0.15, spark: [7700, 7743.98, 7720.39], sparkFirst: "2026-11-03", ...over });
const bars = Array.from({ length: 400 }, (_, i) => ({ date: new Date(Date.UTC(2026, 10, 5) - (399 - i) * 86400000).toISOString().slice(0, 10), open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 0 }));
const model = (symbol = "GSPC.INDX") => { const indexBars = bars.map((bar) => ({ date: bar.date, close: bar.close, high: bar.high, low: bar.low })); const analytics = indexAnalytics({ symbol, bars: indexBars, componentsAsOf: null, components: [], growthFacts: [] }); return { snapshot: null, analytics, bars: indexBars, inputs: toRatingInputs(analytics, indexBars) }; };
const detail = (over: Partial<AssetSummary>): AssetDetail => ({ summary: summary(over), bars, high52: 130, low52: 99 });
const params = <T extends Record<string, string>>(extra: T = {} as T) => ({ params: Promise.resolve({ locale: "en", ...extra }) });
const html = async (node: Promise<unknown>) => renderToStaticMarkup((await node) as React.ReactElement);

beforeEach(() => { vi.stubEnv("MARKETS_VIEWS", "on"); auth.header = owner; auth.viewer = null; });
afterEach(() => { vi.unstubAllEnvs(); auth.viewer = null; data.summaries = []; data.detail = null; data.model = null; data.componentFacts = { asOf: null, rows: [] }; data.components = { asOf: null, rows: [] }; data.runs = []; data.results = { asOf: null, rows: [] }; });

describe("owner gate", () => {
  it.each([["no credentials", () => { auth.header = null; }], ["flag off", () => { vi.stubEnv("MARKETS_VIEWS", "off"); }]])("returns 404 with %s", async (_label, setup) => {
    setup();
    data.summaries = [summary({})];
    await expect(Indices(params())).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    await expect(Screener({ ...params(), searchParams: Promise.resolve({}) })).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });
});

describe("indices", () => {
  it("lists the index rating, coverage, longer returns and methodology", async () => {
    data.summaries = [summary({})]; data.model = model();
    const out = await html(Indices(params()));
    expect(out).toContain('href="/en/indices/GSPC"');
    expect(out).toContain("Price-based only");
    expect(out).toContain("40 %");
    expect(out).toContain("1 month");
    expect(out).toContain("3 months");
    expect(out).toContain("1 year");
    expect(out).toContain("20-day realized volatility");
    expect(out).toContain('id="index-rating"');
    expect(out).toContain('data-area="indices"');
    expect(out).not.toMatch(/\b(buy|sell|recommend)\b/i);
  });
  it("shows an honest empty state before the bars job has run", async () => {
    data.summaries = [summary({ last: null, lastDate: null, spark: [], change1d: null, change5d: null, changeYtd: null })];
    expect(await html(Indices(params()))).toContain("No price history is stored");
  });
  it("shows the VIX regime without an equity score on the list", async () => {
    data.summaries = [summary({ code: "VIX", symbol: "VIX.INDX", name: "VIX" })];
    data.model = model("VIX.INDX");
    const out = await html(Indices(params()));
    expect(out).toContain('href="/en/indices/VIX"');
    expect(out).toContain("High");
    expect(out).not.toContain("Score 100/100");
  });
  it("shows factor evidence, price ranges and dated weighted constituents", async () => {
    data.detail = detail({}); data.model = model();
    data.componentFacts = { asOf: "2026-11-05", rows: [{ code: "AIZ", exchange: "US", name: "Assurant, Inc.", sector: "Financial Services", industry: "Insurance", weight: 0.0002, ticker: "AIZ", vendorSymbol: "AIZ.US", state: "Criteria broken", stateAsOf: "2026-11-05" }] };
    const out = await html(IndexDetail(params({ symbol: "gspc" })));
    expect(out).toContain("Rating evidence");
    expect(out).toContain("Price-based only");
    expect(out).toContain("3 years");
    expect(out).toContain("5 years");
    expect(out).toContain("chart-plot");
    expect(out).toContain("Drawdown from closing high");
    expect(out).toContain("0.02 %");
    expect(out).toContain("Criteria broken");
    expect(out).toContain("Assurant, Inc.");
  });
  it("renders VIX as volatility context without equity evidence or constituents", async () => {
    data.detail = detail({ code: "VIX", symbol: "VIX.INDX", name: "VIX" }); data.model = model("VIX.INDX");
    const out = await html(IndexDetail(params({ symbol: "VIX" })));
    expect(out).toContain("Volatility context");
    expect(out).not.toContain("Rating evidence");
    expect(out).not.toContain("Constituents");
  });
  it("uses Slovak wording for the rating and evidence", async () => {
    data.detail = detail({}); data.model = model();
    const out = await html(IndexDetail({ params: Promise.resolve({ locale: "sk", symbol: "GSPC" }) }));
    expect(out).toContain("Iba podľa ceny");
    expect(out).toContain("Podklady hodnotenia");
    expect(out).toContain("Šírka trhu");
    expect(out).not.toContain("Price-based only");
  });
  it("hides stock states from a Passive viewer", async () => {
    auth.viewer = { tier: "free", preview: false, userId: "5", plan: "passive" };
    vi.stubEnv("EODHD_PRIVATE_USE", "on");
    data.detail = detail({}); data.model = model();
    data.components = { asOf: "2026-11-05", rows: [{ code: "AIZ", exchange: "US", name: "Assurant, Inc.", sector: "Financial Services", industry: null, weight: 0.0002 }] };
    data.componentFacts = { asOf: "2026-11-05", rows: [{ code: "AIZ", exchange: "US", name: "Assurant, Inc.", sector: "Financial Services", industry: null, weight: 0.0002, ticker: "AIZ", vendorSymbol: "AIZ.US", state: "Criteria broken", stateAsOf: "2026-11-05" }] };
    const out = await html(IndexDetail(params({ symbol: "GSPC" })));
    expect(out).toContain("Assurant, Inc.");
    expect(out).not.toContain(">Our stock state<");
    expect(out).not.toContain("<td>Criteria broken</td>");
  });
  it("omits unsupported weight columns and 404s an unknown index", async () => {
    data.detail = detail({}); data.model = model();
    data.componentFacts = { asOf: "2026-11-05", rows: [{ code: "RWE", exchange: "XETRA", name: "RWE AG", sector: null, industry: null, weight: null, ticker: null, vendorSymbol: "RWE.XETRA", state: null, stateAsOf: null }] };
    const out = await html(IndexDetail(params({ symbol: "GDAXI" })));
    expect(out).not.toContain(">Weight<");
    data.detail = null; data.model = null;
    await expect(IndexDetail(params({ symbol: "NOPE" }))).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    await expect(IndexDetail(params({ symbol: "../x" }))).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });
});

describe("screener", () => {
  it("shows the stored rows of the chosen preset and links every preset", async () => {
    data.runs = [{ preset: "us-dividend", asOf: "2026-11-07", rowCount: 1 }];
    data.results = { asOf: "2026-11-07", rows: [{ rank: 1, code: "VZ", exchange: "US", name: "Verizon", sector: "Communication Services", industry: null, currencySymbol: "$", lastDay: "2026-11-06",
      close: 40.5, change1d: 0.5, change5d: -1.25, marketCap: 170e9, dividendYield: 0.065, avgVolume200d: 2e7 }] };
    const out = await html(Screener({ ...params(), searchParams: Promise.resolve({ preset: "us-dividend" }) }));
    expect(out.match(/href="\/en\/screener\?preset=/g)).toHaveLength(10);
    expect(out).toContain('aria-current="page"');
    expect(out).toContain("Verizon");
    expect(out).toContain("6.50 %");
    expect(out).toContain("+0.50 %");
    expect(out).toContain("−1.25 %");
    expect(out).toContain("dividend_yield &gt;= 3 %");
    expect(out).not.toMatch(/\b(buy|sell|score|follow)\b/i);
  });
  it("falls back to the first preset and says when nothing is stored", async () => {
    const out = await html(Screener({ ...params(), searchParams: Promise.resolve({ preset: "bogus" }) }));
    expect(out).toContain("US, market cap over 200 bn");
    expect(out).toContain("has not been stored yet");
  });
});
