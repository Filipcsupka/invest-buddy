import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scoredUniverse } from "@/data/scored";
import { gzipSync } from "node:zlib";
import { toRow } from "@/components/view-model";

const scores = vi.fn();
const portfolio = vi.fn();
const viewer = vi.fn();
const marketData = vi.fn();
const periodPrices = vi.fn();
vi.mock("@/data/store", () => ({ latestScoreSummaries: () => scores(), latestScores: () => scores(), latestPortfolio: () => portfolio() }));
vi.mock("@/viewer/get-viewer", () => ({ getViewer: () => viewer() }));
vi.mock("@/data/cross-market-dashboard", async (importOriginal) => ({ ...await importOriginal<typeof import("@/data/cross-market-dashboard")>(), latestCrossMarketData: () => marketData(), latestPeriodPrices: () => periodPrices() }));
import Dashboard, * as page from "./page";
import { PortfolioStructure } from "@/components/dashboard/portfolio-structure";

const props = (locale = "sk", period?: string) => ({ params: Promise.resolve({ locale }), searchParams: Promise.resolve(period ? { period } : {}) });
const originalMode = process.env.DATA_MODE;
beforeEach(() => { viewer.mockResolvedValue({ tier: "free", preview: false }); periodPrices.mockResolvedValue({ stocks: {}, funds: {} }); });
afterEach(() => { scores.mockReset(); portfolio.mockReset(); viewer.mockReset(); marketData.mockReset(); periodPrices.mockReset(); process.env.DATA_MODE = originalMode; });

describe("merged stock screen", () => {
  it.each(["en", "sk"])("shows empty and stale live data in %s", async (locale) => {
    process.env.DATA_MODE = "db";
    portfolio.mockResolvedValue(null);
    scores.mockResolvedValue({ rows: [], sample: false, lastUpdated: null, stale: false });
    const empty = renderToStaticMarkup(await Dashboard(props(locale)));
    expect(empty).toContain(locale === "en" ? "No data yet" : "Zatiaľ tu nie sú údaje");
    expect(empty).not.toMatch(/SAMPLE DATA|UKÁŽKOVÉ ÚDAJE/);
    scores.mockResolvedValue({ rows: [], sample: false, lastUpdated: "2026-01-01", stale: true });
    const old = renderToStaticMarkup(await Dashboard(props(locale)));
    expect(old).toContain(locale === "en" ? "Stale since" : "Zastarané od");
    expect(old).not.toMatch(/SAMPLE DATA|UKÁŽKOVÉ ÚDAJE/);
  });
  it("uses dashboard metadata and includes the controls and state groups", async () => {
    const rows = await scoredUniverse();
    scores.mockResolvedValue({ rows, sample: true, lastUpdated: rows[0].result.asOf, stale: false });
    portfolio.mockResolvedValue(null);
    const meta = await page.generateMetadata(props());
    expect(meta.alternates?.canonical).toBe("/sk/dashboard");
    const html = renderToStaticMarkup(await Dashboard(props()));
    expect(html).toContain("Hľadať v zozname");
    expect(html).toContain("Stav pravidiel");
    expect(html).toContain("Ostatné stavy");
    expect(html).toContain('aria-sort="descending"');
    expect(html).not.toContain('href="/sk/scanner"');
  });

  it("shows holdings only from the published portfolio snapshot and no weights", async () => {
    const rows = await scoredUniverse();
    scores.mockResolvedValue({ rows, sample: true, lastUpdated: rows[0].result.asOf, stale: false });
    portfolio.mockResolvedValue({ weights: [{ symbol: rows[0].instrument.ticker, weightPercent: 34 }] });
    const html = renderToStaticMarkup(await Dashboard(props()));
    expect(html).toContain("V portfóliu");
    expect(html).not.toContain("34 %");
    portfolio.mockResolvedValue(null);
    expect(renderToStaticMarkup(await Dashboard(props()))).not.toContain("V portfóliu");
  });

  it("renders a 511-name dashboard below one megabyte gzip without price bars in client rows", async () => {
    const fixture = await scoredUniverse();
    const fullRows = Array.from({ length: 511 }, (_, index) => {
      const original = fixture[index % fixture.length];
      const ticker = `T${index.toString().padStart(3, "0")}`;
      return { instrument: { ...original.instrument, ticker, name: `Company ${index}` }, result: { ...original.result, ticker } };
    });
    const rows = fullRows.map(({ instrument, result }) => ({ instrument, result: { ...result, inputs: { ...result.inputs, bars: [] } } }));
    const screenRows = rows.map((row) => toRow("en", row));
    const oldClientProps = JSON.stringify({ profileRows: fullRows, scannerRows: screenRows });
    const before = gzipSync(oldClientProps).length;
    const clientProps = JSON.stringify({ profileRows: screenRows, scannerRows: screenRows });
    const after = gzipSync(clientProps).length;
    expect(clientProps).not.toContain('"bars"');
    expect(after).toBeLessThan(before);
    scores.mockResolvedValue({ rows, sample: true, lastUpdated: rows[0].result.asOf, stale: false });
    portfolio.mockResolvedValue(null);
    const html = renderToStaticMarkup(await Dashboard(props("en")));
    if (process.env.PERF_MEASURE === "1") console.info(JSON.stringify({ names: 511, beforeClientPropsBytes: Buffer.byteLength(oldClientProps), beforeClientPropsGzip: before, afterClientPropsBytes: Buffer.byteLength(clientProps), afterClientPropsGzip: after, htmlBytes: Buffer.byteLength(html), htmlGzip: gzipSync(html).length }));
    expect(html).toContain("511");
    expect([...html.matchAll(/<tr data-state=/g)].length).toBeLessThanOrEqual(200);
    expect(clientProps).toContain("T510");
    expect(gzipSync(html).length).toBeLessThan(1_000_000);
  }, 30_000);
});

describe("cross-market dashboard", () => {
  it.each(["en", "sk"])("renders the portfolio structure and dated sleeves in %s for an entitled viewer", async (locale) => {
    viewer.mockResolvedValue({ tier: "admin", preview: false, owner: true });
    scores.mockResolvedValue({ rows: [], sample: true, lastUpdated: null, stale: false });
    portfolio.mockResolvedValue(null);
    marketData.mockResolvedValue({ sample: true, funds: [
      { key: "F1", name: "Global sample equity fund", symbol: "F1", assetClass: "equity", region: "Global", trackedIndex: "Global index", scorePercent: 92, terPercent: 0.1, aumUsdM: 1000, asOf: "2026-11-06" },
      { key: "F2", name: "Bond sample fund", symbol: "F2", assetClass: "bond", region: "Global", trackedIndex: "Bond index", scorePercent: 88, terPercent: 0.12, aumUsdM: 800, asOf: "2026-11-05" },
    ], indices: [{ code: "SAMPLE", name: "Sample index", asOf: "2026-11-07", closes: Array.from({ length: 253 }, (_, index) => 100 + index), aboveMa200: true, return1y: 8, volatility1y: 12 }] });
    periodPrices.mockResolvedValue({ stocks: {}, funds: { "F1": { asOf: "2026-11-07", closes: Array.from({ length: 253 }, (_, index) => 100 + index) } } });
    const html = renderToStaticMarkup(await Dashboard(props(locale, "3m")));
    expect(html).toContain(locale === "en" ? "Highest rule scores" : "Najvyššie skóre podľa pravidiel");
    expect(html).toContain('/' + locale + '/dashboard?period=3m');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain(locale === "en" ? "Return over period (past, not a forecast)" : "Zmena za obdobie (minulosť, nie prognóza)");
    expect(html).toContain(locale === "en" ? "Insufficient price history" : "Nedostatočná história cien");
    expect(html).toContain(locale === "en" ? "Portfolio structure (example)" : "Štruktúra portfólia (príklad)");
    expect(html).toContain(locale === "en" ? "No names meet the shortlist checks yet." : "Žiadna firma zatiaľ nespĺňa podmienky užšieho výberu.");
    expect(html).toContain("Global sample equity fund");
    expect(html).toContain("Bond sample fund");
    expect(html).toContain('dateTime="2026-11-06"');
    expect(html).toContain('href="/' + locale + '/stocks"');
    expect(html).toContain('href="/' + locale + '/etf"');
    expect(html).toContain('href="/' + locale + '/indices"');
    expect(html).toContain(locale === "en" ? 'aria-label="Market views"' : 'aria-label="Prehľady trhov"');
    expect(html).toContain('AU-Adviser_guide-Vanguard_Core-Satellite_Model_Portfolios_with_LIS.pdf');
    expect(html).toContain('9781119487333/f06.xhtml');
    expect(html).toContain('the_vanguard_asset_allocation_model_an_investment_solution_for_active_passive_factor_portfolios.pdf');
    expect(html).toContain(locale === "en" ? "Informational screening only" : "Iba informačný prehľad");
    const panel = html.slice(html.indexOf('id="portfolio-structure-title"'), html.indexOf('id="structure-references-title"'));
    expect(panel).not.toMatch(/\b(?:buy|sell|recommend|best|top picks)\b/i);
    const periods = html.slice(html.indexOf('id="period-highlights-title"'), html.indexOf('id="portfolio-structure-title"'));
    expect(periods).not.toMatch(/\b(?:buy|sell|recommend|best|top picks)\b/i);
  });

  it.each(["plus", "trial"])("shows the same entitled panel to %s customers", async (plan) => {
    viewer.mockResolvedValue({ tier: "paid", preview: false, userId: "customer", plan });
    scores.mockResolvedValue({ rows: [], sample: false, lastUpdated: null, stale: false });
    portfolio.mockResolvedValue(null);
    marketData.mockResolvedValue({ sample: false, funds: [], indices: [] });
    const html = renderToStaticMarkup(await Dashboard(props("en")));
    expect(html).toContain("Portfolio structure (example)");
    expect(html).toContain("No rated funds yet");
    expect(marketData).toHaveBeenCalledOnce();
  });

  it("keeps the cross-market panel when the shortlist is hidden", async () => {
    const previous = process.env.SHORTLIST_VIEW;
    process.env.SHORTLIST_VIEW = "off";
    try {
      viewer.mockResolvedValue({ tier: "admin", preview: false, owner: true });
      scores.mockResolvedValue({ rows: [], sample: false, lastUpdated: null, stale: false });
      portfolio.mockResolvedValue(null);
      marketData.mockResolvedValue({ sample: false, funds: [], indices: [] });
      const html = renderToStaticMarkup(await Dashboard(props("en")));
      expect(html).toContain("Portfolio structure (example)");
      expect(html).not.toContain("Shortlist checks");
      expect(marketData).toHaveBeenCalledOnce();
    } finally { if (previous === undefined) delete process.env.SHORTLIST_VIEW; else process.env.SHORTLIST_VIEW = previous; }
  });

  it("shows the free lock during owner preview and does not read market data", async () => {
    viewer.mockResolvedValue({ tier: "free", preview: true, owner: true });
    scores.mockResolvedValue({ rows: [], sample: false, lastUpdated: null, stale: false });
    portfolio.mockResolvedValue(null);
    const html = renderToStaticMarkup(await Dashboard(props("en")));
    expect(html).not.toContain("Portfolio structure (example)");
    expect(html).not.toContain('href="/en/indices"');
    expect(marketData).not.toHaveBeenCalled();
    expect(html).toContain('data-tier-lock="scanner-shortlist"');
  });

  it("uses the concentration threshold carried by the data", () => {
    const html = renderToStaticMarkup(<PortfolioStructure locale="en" data={{ sample: false, stocks: [], core: [], defensive: [], indices: [],
      concentration: { total: 2, thresholdPercent: 25, unknownCount: 0, groups: [{ sector: "Technology", count: 2, sharePercent: 100, flagged: true, tickers: ["A", "B"] }] } }} />);
    expect(html).toContain("above the 25% reference line");
    expect(html).not.toContain("above the 30% reference line");
  });

  it("starts price reads while the independent dashboard score read is pending", async () => {
    const previous = process.env.SHORTLIST_VIEW;
    process.env.SHORTLIST_VIEW = "off";
    try {
      viewer.mockResolvedValue({ tier: "admin", preview: false, owner: true });
      let release!: (value: { rows: never[]; sample: boolean; lastUpdated: null; stale: boolean }) => void;
      scores.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
      portfolio.mockResolvedValue(null);
      marketData.mockResolvedValue({ sample: false, funds: [], indices: [] });
      const render = Dashboard(props("en"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(periodPrices).toHaveBeenCalledOnce();
      release({ rows: [], sample: false, lastUpdated: null, stale: false });
      await render;
    } finally { if (previous === undefined) delete process.env.SHORTLIST_VIEW; else process.env.SHORTLIST_VIEW = previous; }
  });

  it("keeps vendor-backed sleeves behind the existing lock", async () => {
    scores.mockResolvedValue({ rows: [], sample: false, lastUpdated: null, stale: false });
    portfolio.mockResolvedValue(null);
    const html = renderToStaticMarkup(await Dashboard(props("en")));
    expect(marketData).not.toHaveBeenCalled();
    expect(html).not.toContain("Portfolio structure (example)");
    expect(html).not.toContain('href="/en/etf"');
  });
});
