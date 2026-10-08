import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const universe = vi.fn();
const scores = vi.fn();
const idea = vi.fn();
const portfolio = vi.fn();
const eurOn = vi.fn();
vi.mock("@/data/store", () => ({ instrumentUniverse: () => universe(), latestScores: () => scores(), latestPortfolio: () => portfolio() }));
vi.mock("@/data/ideas-store", () => ({ companyIdea: () => idea(), ideasEnabled: () => eurOn() }));

import Company, * as page from "./page";
import { instruments } from "@/data/fixtures";
import { scoredUniverse } from "@/data/scored";
import { sampleIdeas } from "@/ideas/fixtures";

afterEach(() => { universe.mockReset(); scores.mockReset(); idea.mockReset(); eurOn.mockReset(); portfolio.mockReset(); portfolio.mockResolvedValue(null); });
const props = (ticker: string, locale = "en") => ({ params: Promise.resolve({ locale, ticker }) });
const dbInstrument = { ticker: "ZZZZ", name: "Zed Corp", sector: "Cloud & SaaS", tier: null, source: "guide" as const };

describe("company page", () => {
  it("does not prebuild params from fixtures and allows runtime params", () => {
    expect("generateStaticParams" in page).toBe(false);
    expect(page.dynamicParams).toBe(true);
    expect(page.dynamic).toBe("force-dynamic");
  });

  it("serves a DB-only instrument that is not in the fixtures", async () => {
    expect(instruments.some((i) => i.ticker === "ZZZZ")).toBe(false);
    universe.mockResolvedValue([dbInstrument]);
    scores.mockResolvedValue({ rows: [], sample: false, lastUpdated: null, stale: false });
    portfolio.mockResolvedValue(null);
    const meta = await page.generateMetadata(props("zzzz"));
    expect(JSON.stringify(meta)).toContain("ZZZZ");
    expect(JSON.stringify(meta)).not.toContain("sample data");
    const html = renderToStaticMarkup(await Company(props("ZZZZ")));
    expect(html).toContain("ZZZZ");
    expect(html).toContain("No data yet");
    expect(html).not.toContain("SAMPLE DATA");
  });

  it("shows a dated stale notice for an old live score in both languages", async () => {
    const [row] = await scoredUniverse();
    universe.mockResolvedValue([row.instrument]);
    scores.mockResolvedValue({ rows: [row], sample: false, lastUpdated: "2026-01-01", stale: true });
    idea.mockResolvedValue(null);
    for (const locale of ["en", "sk"]) {
      const html = renderToStaticMarkup(await Company(props(row.instrument.ticker, locale)));
      expect(html).toContain(locale === "en" ? "Stale since" : "Zastarané od");
      expect(html).not.toMatch(/SAMPLE DATA|UKÁŽKOVÉ DÁTA|Synthetic series|Syntetický rad/);
    }
  });

  it("404s a ticker missing from the universe, even if it is a fixture ticker", async () => {
    universe.mockResolvedValue([dbInstrument]);
    scores.mockResolvedValue({ rows: [], sample: false, lastUpdated: null, stale: false });
    await expect(Company(props("NVDA"))).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
    await expect(Company(props("ZZZZ", "xx"))).rejects.toThrow(/404|NOT_FOUND/);
  });

  it("builds prev/next links from the universe and wraps around", async () => {
    const list = [dbInstrument, { ...dbInstrument, ticker: "YYYY", name: "Why" }, { ...dbInstrument, ticker: "XXXX", name: "Ex" }];
    const rows = (await scoredUniverse()).slice(0, 1).map((r) => ({ ...r, instrument: list[0] }));
    universe.mockResolvedValue(list);
    scores.mockResolvedValue({ rows, sample: false, lastUpdated: "2026-01-01", stale: false });
    portfolio.mockResolvedValue(null);
    const html = renderToStaticMarkup(await Company(props("ZZZZ")));
    expect(html).toContain('href="/en/company/XXXX"');
    expect(html).toContain('href="/en/company/YYYY"');
  });

  async function render(opts: { sample: boolean; locale?: string; idea?: unknown; eur?: boolean }) {
    const rows = (await scoredUniverse()).slice(0, 1);
    universe.mockResolvedValue([rows[0].instrument]);
    scores.mockResolvedValue({ rows, sample: opts.sample, lastUpdated: "2026-10-05", stale: false });
    idea.mockResolvedValue(opts.idea ?? null);
    eurOn.mockReturnValue(opts.eur ?? false);
    portfolio.mockResolvedValue(null);
    return renderToStaticMarkup(await Company(props(rows[0].instrument.ticker, opts.locale)));
  }

  it("marks published holdings and describes lower states without a purchase signal", async () => {
    const [row] = await scoredUniverse();
    universe.mockResolvedValue([row.instrument]);
    scores.mockResolvedValue({ rows: [{ ...row, result: { ...row.result, state: "Ignore", total: 6 } }], sample: false, lastUpdated: "2026-10-05", stale: false });
    idea.mockResolvedValue(null);
    portfolio.mockResolvedValue({ weights: [{ symbol: row.instrument.ticker, weightPercent: 12 }] });
    const html = renderToStaticMarkup(await Company(props(row.instrument.ticker, "sk")));
    expect(html).toContain("V portfóliu, bez signálu na ďalší nákup");
    expect(html).not.toContain("12 %");
    portfolio.mockResolvedValue(null);
    expect(renderToStaticMarkup(await Company(props(row.instrument.ticker, "sk")))).not.toContain("V portfóliu");
  });

  describe("sources", () => {
    const RELEASE = "https://www.sec.gov/Archives/edgar/data/1/ex99.htm";
    async function renderWith(locale: string) {
      const [row] = await scoredUniverse();
      const f = { ...row.result.inputs.fundamentals, guidanceRaised: true, epsBeat: true, productCatalyst: null };
      const result = { ...row.result, inputs: { ...row.result.inputs, fundamentals: f }, agreement: { epsBeat: "data_rule", guidanceRaised: "verified_single" },
        sources: { epsBeat: [{ kind: "alphavantage", href: null, publishedAt: "2026-08-26" }], guidanceRaised: [{ kind: "release", href: RELEASE, publishedAt: "2026-08-26" }] } };
      universe.mockResolvedValue([row.instrument]);
      scores.mockResolvedValue({ rows: [{ ...row, result }], sample: false, lastUpdated: "2026-10-05", stale: false });
      idea.mockResolvedValue(null);
      eurOn.mockReturnValue(false);
      portfolio.mockResolvedValue(null);
      return renderToStaticMarkup(await Company(props(row.instrument.ticker, locale)));
    }
    it("shows a source under each rule and input, a link only for the stored release, and the summary", async () => {
      const html = await renderWith("en");
      expect(html).toContain("Source: ");
      expect(html).toContain(`href="${RELEASE}"`);
      expect(html).toContain('rel="noopener noreferrer"');
      expect(html).toContain("Alpha Vantage earnings data");
      expect(html).not.toMatch(/href="https:\/\/www\.alphavantage/);
      expect(html).toContain("Own price bars");
      expect(html).toContain("No source yet");
      expect(html).toContain("Data sources: ");
      expect(html.match(/class="[^"]*\brule-src\b/g)).toHaveLength(10);
      expect(html.match(/class="input-src"/g)).toHaveLength(15);
    });
    it("renders in Slovak", async () => {
      const html = await renderWith("sk");
      expect(html).toContain("Zdroj: ");
      expect(html).toContain("Zatiaľ bez zdroja");
      expect(html).toContain("Zdroje údajov: ");
      expect(html).toContain("otvorí sa na novej karte");
    });
  });

  describe("price chart wording", () => {
    it("never shows the synthetic wording on database data", async () => {
      for (const locale of ["en", "sk"]) {
        const html = await render({ sample: false, locale });
        expect(html).not.toMatch(/Synthetic series|Syntetický rad|illustration only/);
        expect(html).toContain(locale === "en" ? "Daily closes, last 100 sessions" : "Denné zatváracie ceny");
      }
    });
    it("keeps it on fixture data", async () => {
      const html = await render({ sample: true });
      expect(html).toContain("Price, last 100 sessions");
      expect(html).toContain("Synthetic series, for illustration only.");
    });
  });

  describe("latest idea card", () => {
    const [add, watch] = sampleIdeas;
    const withIdea = (i: typeof add, extra = {}) => ({ idea: { ...i, ...extra }, sample: false });
    it("shows a WATCH idea with plan, badges and date", async () => {
      const html = await render({ sample: false, idea: withIdea(watch) });
      expect(html).toContain("Latest trade idea");
      expect(html).toContain("AMD - WATCH");
      expect(html).toContain("UNCONFIRMED");
      expect(html).toContain("Carried data from");
      expect(html).toContain("Opportunity cost");
      expect(html).toContain("Idea of ");
    });
    it("shows START_POSITION with only the evidence links stored in the idea", async () => {
      const html = await render({ sample: false, idea: withIdea(add, { action: "START_POSITION" }) });
      expect(html).toContain("START_POSITION");
      expect(html).toContain('href="https://example.com/nvda-release"');
      expect(html.match(/href="https:\/\/example\.com/g)).toHaveLength(2);
    });
    it("is hidden when there is no idea to show (HOLD is filtered by companyIdea)", async () => {
      expect(await render({ sample: false, idea: null })).not.toContain("Latest trade idea");
    });
    it("shows no EUR amount in any field while the flag is off", async () => {
      const html = await render({ sample: false, eur: false, idea: withIdea(add) });
      expect(html).toContain("NVDA - ADD");
      expect(html).not.toMatch(/EUR|€|Amount now/);
    });
    it("shows the band and amount when the flag is on", async () => {
      const html = await render({ sample: false, eur: true, idea: withIdea(add) });
      expect(html).toContain("NVDA - ADD - EUR 60-90");
      expect(html).toContain("Amount now");
    });
    it("renders in Slovak", async () => {
      const html = await render({ sample: false, locale: "sk", idea: withIdea(add) });
      expect(html).toContain("Posledný investičný nápad");
      expect(html).toContain("Čo sa stalo");
    });
  });
});
