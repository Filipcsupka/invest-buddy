import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssetDetail, AssetSummary } from "@/db/markets";
import { indexAnalytics, toRatingInputs, type ComponentFacts } from "@/markets/index-analytics";

const auth = vi.hoisted(() => ({ header: null as string | null, viewer: null as unknown }));
const data = vi.hoisted(() => ({ summaries: [] as unknown[], detail: null as unknown, model: null as unknown, listModel: null as null | ((symbol: string) => unknown), listCalls: [] as string[][], singleCalls: 0, runs: [] as unknown[], results: { asOf: null as string | null, rows: [] as unknown[] } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/viewer/get-viewer", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/viewer/get-viewer")>();
  return { ...real, getViewer: async () => auth.viewer ?? real.resolveViewer(undefined, null, auth.header !== null) };
});
vi.mock("@/db/markets", async (original) => ({
  ...(await original<typeof import("@/db/markets")>()),
  assetSummaries: async () => data.summaries, assetDetail: async () => data.detail,
  indexComponents: async () => { throw new Error("index pages read constituents from the read model"); },
  indexComponentFacts: async () => { throw new Error("index pages read constituents from the read model"); },
  indexRatingReadModel: async () => { data.singleCalls += 1; return data.model; },
  indexListModels: async (symbols: string[]) => { data.listCalls.push(symbols); return data.listModel ? symbols.map((symbol) => data.listModel!(symbol)) : []; },
}));
vi.mock("@/db/screener", async (original) => ({ ...(await original<typeof import("@/db/screener")>()), latestScreenerRuns: async () => data.runs, screenerResults: async () => data.results }));

const Indices = (await import("./page")).default;
const IndexDetail = (await import("./[symbol]/page")).default;
const Screener = (await import("../screener/page")).default;

const owner = "owner-session";
const summary = (over: Partial<AssetSummary>): AssetSummary => ({ symbol: "GSPC.INDX", code: "GSPC", name: "S&P 500 Index", currency: "USD", assetClass: "index", lastDate: "2026-11-05",
  last: 7720.39, change1d: -0.003, change5d: 0.012, changeYtd: 0.15, spark: [7700, 7743.98, 7720.39], sparkFirst: "2026-11-03", ...over });
const bars = Array.from({ length: 400 }, (_, i) => ({ date: new Date(Date.UTC(2026, 10, 5) - (399 - i) * 86400000).toISOString().slice(0, 10), open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 0 }));
const model = (symbol = "GSPC.INDX", components: ComponentFacts[] = [], componentsAsOf: string | null = components.length ? "2026-11-05" : null) => {
  const indexBars = bars.map((bar) => ({ date: bar.date, close: bar.close, high: bar.high, low: bar.low }));
  const analytics = indexAnalytics({ symbol, bars: indexBars, componentsAsOf, components, growthFacts: [] });
  return { snapshot: null, analytics, bars: indexBars, inputs: toRatingInputs(analytics, indexBars), components: { asOf: componentsAsOf, rows: components } };
};
const listModel = (symbol: string) => { const m = model(symbol); return { symbol, country: null, analytics: m.analytics, inputs: m.inputs }; };
const member = (code: string, state: string | null, weight: number | null = 0.0002): ComponentFacts => ({ code, exchange: "US", vendorSymbol: `${code}.US`, ticker: code, name: `${code} Inc.`,
  sector: "Financial Services", industry: "Insurance", weight, barDate: "2026-11-05", close: 10, ma50: 9, ma200: 8, state, stateAsOf: state ? "2026-11-05" : null });
const detail = (over: Partial<AssetSummary>): AssetDetail => ({ summary: summary(over), bars, high52: 130, low52: 99 });
const params = <T extends Record<string, string>>(extra: T = {} as T) => ({ params: Promise.resolve({ locale: "en", ...extra }) });
const html = async (node: Promise<unknown>) => renderToStaticMarkup((await node) as React.ReactElement);

beforeEach(() => { vi.stubEnv("MARKETS_VIEWS", "on"); auth.header = owner; auth.viewer = null; });
afterEach(() => { vi.unstubAllEnvs(); auth.viewer = null; data.summaries = []; data.detail = null; data.model = null; data.listModel = null; data.listCalls = []; data.singleCalls = 0; data.runs = []; data.results = { asOf: null, rows: [] }; });
const passive = () => { auth.viewer = { tier: "free", preview: false, userId: "5", plan: "passive" }; vi.stubEnv("EODHD_PRIVATE_USE", "on"); };

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
    data.summaries = [summary({})]; data.listModel = listModel;
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
    expect(out).not.toMatch(/eodhd/i);
  });
  it("reads every index rating in one batched call, never per index", async () => {
    const codes = ["GSPC", "NDX", "DJI", "IXIC", "VIX", "GDAXI", "FCHI", "N225", "HSI", "FTSE"];
    data.summaries = codes.map((code) => summary({ code, symbol: `${code}.INDX`, name: `${code} index` })); data.listModel = listModel;
    const out = await html(Indices(params()));
    expect(data.listCalls).toEqual([codes.map((code) => `${code}.INDX`)]);
    expect(data.singleCalls).toBe(0);
    expect(out.match(/<tr>/g)?.length).toBe(codes.length + 1);
  });
  it("shows an honest empty state before the bars job has run", async () => {
    data.summaries = [summary({ last: null, lastDate: null, spark: [], change1d: null, change5d: null, changeYtd: null })];
    expect(await html(Indices(params()))).toContain("No price history is stored");
  });
  it("shows the VIX regime without an equity score on the list", async () => {
    data.summaries = [summary({ code: "VIX", symbol: "VIX.INDX", name: "VIX" })];
    data.listModel = listModel;
    const out = await html(Indices(params()));
    expect(out).toContain('href="/en/indices/VIX"');
    expect(out).toContain("High");
    expect(out).not.toMatch(/Score \d+\/100/);
    expect(out).not.toContain("Coverage");
  });
  it("shows factor evidence, price ranges and dated weighted constituents", async () => {
    data.detail = detail({}); data.model = model("GSPC.INDX", [{ ...member("AIZ", "Criteria broken"), name: "Assurant, Inc." }]);
    const out = await html(IndexDetail(params({ symbol: "gspc" })));
    expect(out).toContain("Rating evidence");
    expect(out).toContain("Price and member data");
    expect(out).toContain("3 years");
    expect(out).toContain("5 years");
    expect(out).toContain("chart-plot");
    expect(out).toContain("Drawdown from 1-year closing high");
    expect(out).toContain("From five-year closing high");
    expect(out).toContain("0.02 %");
    expect(out).toContain(">Our stock state<");
    expect(out).toContain("<td>Criteria broken</td>");
    expect(out).toContain("Assurant, Inc.");
    expect(out).toContain("1 constituent");
    expect(out).not.toContain("Details for Active plan");
    expect(out).not.toMatch(/eodhd/i);
    expect(data.singleCalls).toBe(1);
  });
  it("renders VIX as volatility context without equity evidence or constituents", async () => {
    data.detail = detail({ code: "VIX", symbol: "VIX.INDX", name: "VIX" }); data.model = model("VIX.INDX");
    const out = await html(IndexDetail(params({ symbol: "VIX" })));
    expect(out).toContain("Volatility context");
    expect(out).not.toContain("Rating evidence");
    expect(out).not.toContain("Constituents");
    // Equity measures stay off a volatility level, and the three-year percentile appears once.
    for (const label of ["50-day average", "200-day average", "From five-year closing high", "20-day realized volatility", "closing high", "MA50"]) expect(out, label).not.toContain(label);
    expect(out.match(/Three-year level percentile/g)).toHaveLength(1);
  });
  it("uses Slovak wording for the rating and evidence", async () => {
    data.detail = detail({}); data.model = model();
    const out = await html(IndexDetail({ params: Promise.resolve({ locale: "sk", symbol: "GSPC" }) }));
    expect(out).toContain("Iba podľa ceny");
    expect(out).toContain("Podklady hodnotenia");
    expect(out).toContain("Šírka trhu");
    expect(out).not.toContain("Price-based only");
  });
  it("hides stock states and the stock-score distribution details from a Passive viewer, keeping the composite", async () => {
    const members = [{ ...member("AIZ", "Criteria broken"), name: "Assurant, Inc." }, member("ABC", "Setup met (>=18)"), member("DEF", "Criteria broken"), member("GHI", "Watch")];
    data.detail = detail({}); data.model = model("GSPC.INDX", members);
    const owner = await html(IndexDetail(params({ symbol: "GSPC" })));
    const ownerCard = owner.slice(owner.indexOf("Stock-score distribution"));
    expect(ownerCard.slice(0, 400)).toMatch(/\d+(\.\d+)? \/ 10/);
    const score = owner.match(/<strong class="num">(\d+)<\/strong> \/ 100/)?.[1];
    expect(score).toBeDefined();
    passive();
    const out = await html(IndexDetail(params({ symbol: "GSPC" })));
    expect(out).toContain("Assurant, Inc.");
    expect(out).not.toContain(">Our stock state<");
    expect(out).not.toContain("<td>Criteria broken</td>");
    expect(out).not.toContain("Conditions met");
    const card = out.slice(out.indexOf("Stock-score distribution"));
    expect(card.slice(0, 400)).toContain("Details for Active plan.");
    expect(card.slice(0, 400)).not.toMatch(/\/ 10</);
    expect(out).toContain(`<strong class="num">${score}</strong> / 100`);
  });
  it("caps the constituent table at the same size for every viewer and states the full count", async () => {
    const members = Array.from({ length: 601 }, (_, i) => member(`C${String(i).padStart(3, "0")}`, "Watch", (601 - i) / 1e5));
    data.detail = detail({}); data.model = model("GSPC.INDX", members);
    const owner = await html(IndexDetail(params({ symbol: "GSPC" })));
    passive();
    const out = await html(IndexDetail(params({ symbol: "GSPC" })));
    for (const page of [owner, out]) {
      expect(page).toContain("600 of 601 constituents shown");
      expect(page.match(/<th scope="row">C\d{3}/g)).toHaveLength(600);
      expect(page).toContain(">C000<");
      expect(page).not.toContain(">C600<");
    }
  });
  it("omits unsupported weight columns and 404s an unknown index", async () => {
    data.detail = detail({}); data.model = model("GDAXI.INDX", [{ code: "RWE", exchange: "XETRA", name: "RWE AG", sector: null, industry: null, weight: null, ticker: null, vendorSymbol: "RWE.XETRA", state: null, stateAsOf: null }]);
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
