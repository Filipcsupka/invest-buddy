import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssetDetail, AssetSummary } from "@/db/markets";

const auth = vi.hoisted(() => ({ header: null as string | null }));
const data = vi.hoisted(() => ({ summaries: [] as unknown[], detail: null as unknown, components: { asOf: null as string | null, rows: [] as unknown[] }, runs: [] as unknown[], results: { asOf: null as string | null, rows: [] as unknown[] } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/viewer/get-viewer", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/viewer/get-viewer")>();
  return { ...real, getViewer: async () => real.resolveViewer(undefined, null, auth.header !== null) };
});
vi.mock("@/db/markets", async (original) => ({
  ...(await original<typeof import("@/db/markets")>()),
  assetSummaries: async () => data.summaries, assetDetail: async () => data.detail, indexComponents: async () => data.components,
}));
vi.mock("@/db/screener", async (original) => ({ ...(await original<typeof import("@/db/screener")>()), latestScreenerRuns: async () => data.runs, screenerResults: async () => data.results }));

const Indices = (await import("./page")).default;
const IndexDetail = (await import("./[symbol]/page")).default;
const Screener = (await import("../screener/page")).default;

const owner = "owner-session";
const summary = (over: Partial<AssetSummary>): AssetSummary => ({ symbol: "GSPC.INDX", code: "GSPC", name: "S&P 500 Index", currency: "USD", assetClass: "index", lastDate: "2026-11-05",
  last: 7720.39, change1d: -0.003, change5d: 0.012, changeYtd: 0.15, spark: [7700, 7743.98, 7720.39], sparkFirst: "2026-11-03", ...over });
const bars = Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 0 }));
const detail = (over: Partial<AssetSummary>): AssetDetail => ({ summary: summary(over), bars, high52: 130, low52: 99 });
const params = <T extends Record<string, string>>(extra: T = {} as T) => ({ params: Promise.resolve({ locale: "en", ...extra }) });
const html = async (node: Promise<unknown>) => renderToStaticMarkup((await node) as React.ReactElement);

beforeEach(() => { vi.stubEnv("MARKETS_VIEWS", "on"); auth.header = owner; });
afterEach(() => { vi.unstubAllEnvs(); data.summaries = []; data.detail = null; data.components = { asOf: null, rows: [] }; data.runs = []; data.results = { asOf: null, rows: [] }; });

describe("owner gate", () => {
  it.each([["no credentials", () => { auth.header = null; }], ["flag off", () => { vi.stubEnv("MARKETS_VIEWS", "off"); }]])("returns 404 with %s", async (_label, setup) => {
    setup();
    data.summaries = [summary({})];
    await expect(Indices(params())).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    await expect(Screener({ ...params(), searchParams: Promise.resolve({}) })).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });
});

describe("indices", () => {
  it("lists level, date, changes and a labelled sparkline without any score wording", async () => {
    data.summaries = [summary({})];
    const out = await html(Indices(params()));
    expect(out).toContain('href="/en/indices/GSPC"');
    expect(out).toContain("7,720.39");
    expect(out).toContain("+1.20 %");
    expect(out).toContain("−0.30 %");
    expect(out).toContain("+15.00 %");
    expect(out).toContain('role="img" aria-label="S&amp;P 500 Index: last 3 closes');
    expect(out).toContain("Market data");
    expect(out).not.toMatch(/\b(buy|sell|score|setup|follow)\b/i);
  });
  it("shows an honest empty state before the bars job has run", async () => {
    data.summaries = [summary({ last: null, lastDate: null, spark: [], change1d: null, change5d: null, changeYtd: null })];
    expect(await html(Indices(params()))).toContain("No bars are stored yet");
  });
  it("renders the chart and constituents with weights", async () => {
    data.detail = detail({});
    data.components = { asOf: "2026-11-08", rows: [{ code: "AIZ", exchange: "US", name: "Assurant, Inc.", sector: "Financial Services", industry: "Insurance", weight: 0.0002 }] };
    const out = await html(IndexDetail(params({ symbol: "gspc" })));
    expect(out).toContain("Constituents");
    expect(out).toContain("Assurant, Inc.");
    expect(out).not.toContain("0.02 %");
    expect(out).toContain("chart-plot");
    expect(out).toContain("1 constituents");
  });
  it("says when the vendor gave no weights and 404s an unknown index", async () => {
    data.detail = detail({});
    data.components = { asOf: "2026-11-08", rows: [{ code: "RWE", exchange: "XETRA", name: "RWE AG", sector: null, industry: null, weight: null }] };
    const out = await html(IndexDetail(params({ symbol: "GDAXI" })));
    expect(out).not.toContain("Weight");
    expect(out).not.toContain(">Weight<");
    data.detail = null;
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
