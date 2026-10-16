import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const universe = vi.fn();
const scores = vi.fn();
const idea = vi.fn();
const review = vi.fn();
const portfolio = vi.fn();
const history = vi.fn();
const shares = vi.fn(async () => [] as { periodEnd: string; value: number }[]);
vi.mock("@/data/flag-facts", () => ({ storedShareCounts: () => shares(), storedInterestFacts: async () => ({ operatingIncome: null, interestExpense: null }) }));
const originalAdvice = process.env.ADVICE_OUTPUT;
vi.mock("@/data/store", () => ({ instrumentUniverse: () => universe(), latestScores: () => scores(), latestPortfolio: () => portfolio() }));
vi.mock("@/data/score-history", () => ({ companyScoreHistory: () => history() }));
vi.mock("@/data/ideas-store", () => ({ companyIdea: () => idea(), companyReview: () => review() }));

import Company, * as page from "./page";
import { instruments } from "@/data/fixtures";
import { scoredUniverse } from "@/data/scored";
import { sampleIdeas } from "@/ideas/fixtures";

afterEach(() => { shares.mockReset(); shares.mockResolvedValue([]); history.mockReset(); history.mockResolvedValue([]); universe.mockReset(); scores.mockReset(); idea.mockReset(); review.mockReset(); review.mockResolvedValue(null); portfolio.mockReset(); portfolio.mockResolvedValue(null); if (originalAdvice === undefined) delete process.env.ADVICE_OUTPUT; else process.env.ADVICE_OUTPUT = originalAdvice; });
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

  it("says so when a stock has no idea yet, and does not repeat the ticker as the name", async () => {
    const [row] = await scoredUniverse();
    const instrument = { ...row.instrument, name: row.instrument.ticker };
    universe.mockResolvedValue([instrument]);
    scores.mockResolvedValue({ rows: [{ ...row, instrument }], sample: false, lastUpdated: "2026-10-08", stale: false });
    idea.mockResolvedValue(null);
    for (const [locale, text] of [["en", "No trade idea for this stock yet"], ["sk", "zatiaľ nie je investičný nápad"]]) {
      const html = renderToStaticMarkup(await Company(props(instrument.ticker, locale)));
      expect(html).toContain(text);
      expect(html).not.toContain("title-name");
    }
    const meta = await page.generateMetadata(props(instrument.ticker));
    expect(JSON.stringify(meta)).not.toContain(`${instrument.ticker}, ${instrument.ticker}`);
    expect(JSON.stringify(meta)).toContain(`"url":"/en/company/${instrument.ticker}/opengraph-image"`);
  });

  it("shows a dated stale notice for an old live score in both languages", async () => {
    const [row] = await scoredUniverse();
    universe.mockResolvedValue([row.instrument]);
    scores.mockResolvedValue({ rows: [row], sample: false, lastUpdated: "2026-01-01", stale: true });
    idea.mockResolvedValue(null);
    for (const locale of ["en", "sk"]) {
      const html = renderToStaticMarkup(await Company(props(row.instrument.ticker, locale)));
      expect(html).toContain(locale === "en" ? "Stale since" : "Zastarané od");
      expect(html).not.toMatch(/SAMPLE DATA|UKÁŽKOVÉ ÚDAJE|Synthetic series|Syntetický rad/);
    }
  });

  it("shows the last review and the next fixed review in both languages, and hides them without data", async () => {
    const [row] = await scoredUniverse();
    universe.mockResolvedValue([row.instrument]);
    scores.mockResolvedValue({ rows: [row], sample: false, lastUpdated: "2026-10-08", stale: false });
    idea.mockResolvedValue(null);
    review.mockResolvedValue({ lastReviewed: "2026-09-20", nextDue: "2026-10-20" });
    const en = renderToStaticMarkup(await Company(props(row.instrument.ticker, "en")));
    expect(en).toContain("Last reviewed");
    expect(en).toContain("20 Sept 2026");
    expect(en).toContain("Next scheduled review");
    expect(en).toContain("20 Oct 2026");
    const sk = renderToStaticMarkup(await Company(props(row.instrument.ticker, "sk")));
    expect(sk).toContain("Naposledy preskúmané");
    expect(sk).toContain("Ďalšia plánovaná kontrola");
    review.mockResolvedValue(null);
    const none = renderToStaticMarkup(await Company(props(row.instrument.ticker, "en")));
    expect(none).not.toContain("Last reviewed");
  });

  it("shows the score history under its paywall marker in both languages", async () => {
    const [row] = await scoredUniverse();
    universe.mockResolvedValue([row.instrument]);
    scores.mockResolvedValue({ rows: [row], sample: false, lastUpdated: "2026-10-08", stale: false });
    idea.mockResolvedValue(null);
    history.mockResolvedValue([{ asOf: "2026-10-03", technical: 5, fundamentals: 6, macro: 2, total: 13, state: "Watch" }, { asOf: "2026-10-02", technical: 4, fundamentals: 6, macro: 2, total: 12, state: "Watch" }]);
    const en = renderToStaticMarkup(await Company(props(row.instrument.ticker, "en")));
    expect(en).toContain("Score history");
    expect(en).toContain('data-paywall-candidate="score-history"');
    expect(en).toContain("over 2 scan days");
    const sk = renderToStaticMarkup(await Company(props(row.instrument.ticker, "sk")));
    expect(sk).toContain("História skóre");
    history.mockResolvedValue([]);
    expect(renderToStaticMarkup(await Company(props(row.instrument.ticker, "en")))).toContain("Not enough history yet");
  });

  it("shows the flags block apart from the score, and the ADR line under the score widget, in both languages", async () => {
    const [row] = await scoredUniverse();
    universe.mockResolvedValue([row.instrument]);
    scores.mockResolvedValue({ rows: [row], sample: false, lastUpdated: "2026-10-08", stale: false });
    idea.mockResolvedValue(null);
    shares.mockResolvedValue([{ periodEnd: "2025-09-30", value: 100_000_000 }, { periodEnd: "2026-09-30", value: 125_000_000 }]);
    const en = renderToStaticMarkup(await Company(props(row.instrument.ticker, "en")));
    expect(en).toContain('data-flags=""');
    expect(en).toContain("Share count growth: Flagged");
    expect(en).toContain("+25.0%");
    expect(en).toContain("Short interest: No data");
    expect(en).toContain("Interest cover: No data");
    expect(en.indexOf("status-title")).toBeLessThan(en.indexOf('data-adr-line=""'));
    expect(en.indexOf('data-adr-line=""')).toBeLessThan(en.indexOf('data-flags=""'));
    const sk = renderToStaticMarkup(await Company(props(row.instrument.ticker, "sk")));
    expect(sk).toContain("Rast počtu akcií: Označené");
    expect(sk).toContain("Krátke pozície: Bez údajov");
    expect(sk).toContain("Nejde o osobné investičné poradenstvo.");
    // The flags do not change the rendered score.
    shares.mockResolvedValue([]);
    const bare = renderToStaticMarkup(await Company(props(row.instrument.ticker, "en")));
    expect(bare).toContain("Share count growth: No data");
    const score = (html: string) => html.match(/<section class="[^"]*" data-state="[^"]*" aria-labelledby="status-title">[\s\S]*?<\/section>/)?.[0];
    expect(score(bare)).toBeDefined();
    expect(score(bare)).toBe(score(en));
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

  async function render(opts: { sample: boolean; locale?: string; idea?: unknown; advice?: boolean }) {
    process.env.ADVICE_OUTPUT = opts.advice === false ? "off" : "on";
    const rows = (await scoredUniverse()).slice(0, 1);
    universe.mockResolvedValue([rows[0].instrument]);
    scores.mockResolvedValue({ rows, sample: opts.sample, lastUpdated: "2026-10-05", stale: false });
    idea.mockResolvedValue(opts.idea ?? null);
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

  describe("status header", () => {
    async function renderStatus(opts: { locale?: string; advice: boolean; state?: "Setup met (>=18)" | "Ignore"; unknown?: string[] }) {
      process.env.ADVICE_OUTPUT = opts.advice ? "on" : "off";
      const [row] = await scoredUniverse();
      const unknown = opts.unknown ?? [];
      const ruleHits = row.result.ruleHits.map((hit) => (unknown.includes(hit.id) ? { ...hit, matched: false, unknown: true } : hit));
      const result = { ...row.result, state: opts.state ?? "Setup met (>=18)", total: 19, ruleHits };
      universe.mockResolvedValue([row.instrument]);
      scores.mockResolvedValue({ rows: [{ ...row, result }], sample: false, lastUpdated: "2026-10-05", stale: false });
      idea.mockResolvedValue(null);
      portfolio.mockResolvedValue(null);
      return renderToStaticMarkup(await Company(props(row.instrument.ticker, opts.locale)));
    }

    it("puts the status panel before the chart and drops Buy zone with the flag off", async () => {
      for (const [locale, off, on] of [["en", "Conditions met", "Buy zone"], ["sk", "Podmienky splnené", "Zóna nákupu"]]) {
        const html = await renderStatus({ locale, advice: false });
        expect(html.indexOf('aria-labelledby="status-title"')).toBeGreaterThan(-1);
        expect(html.indexOf('id="status-title"')).toBeLessThan(html.indexOf('id="chart"'));
        expect(html.indexOf('id="chart"')).toBeLessThan(html.indexOf('id="rules"'));
        expect(html).toContain(off);
        expect(html).not.toContain(on);
        expect((await renderStatus({ locale, advice: true }))).not.toContain(on);
      }
    });

    it("shows no data instead of 0 for unknown rules in the table", async () => {
      const html = await renderStatus({ advice: false, unknown: ["catalyst", "macro-data"] });
      expect(html).toContain('id="rule-catalyst"');
      expect(html).toContain("Data from 8 of 9 core rules");
      const row = (id: string) => html.match(new RegExp(`<tr id="rule-${id}"[\\s\\S]*?</tr>`))?.[0] ?? "";
      for (const id of ["catalyst", "macro-data"]) {
        expect(row(id)).toContain("no data");
        expect(row(id)).not.toMatch(/rule-points">0</);
      }
      expect(html).toContain("Bonus findings");
      expect(html).not.toContain("mark-block is-unknown");
    });
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
    it.each(["en", "sk"])("shows only rule state and evidence when advice is off in %s", async (locale) => {
      const html = await render({ sample: false, locale, idea: withIdea(add), advice: false });
      expect(html).toContain(locale === "en" ? "Evidence" : "Dôkazy");
      expect(html).toContain('href="https://example.com/nvda-release"');
      expect(html).toContain("Sample earnings release · example.com");
      expect(html).not.toMatch(/Add about|Add 1\/3|Start position|Amount now|Opportunity cost|Prikúpiť|Otvoriť pozíciu|Príležitosť/);
      expect(html).not.toContain("data-action=");
      expect(html).not.toContain("data-tier=");
    });
    it("shows a WATCH idea with plan, badges and date", async () => {
      const html = await render({ sample: false, idea: withIdea(watch) });
      expect(html).toContain("Latest trade idea");
      expect(html).toContain("AMD - Watch");
      expect(html).toContain("UNCONFIRMED");
      expect(html).toContain("Carried data from");
      expect(html).toContain("Opportunity cost");
      expect(html).toContain("Idea of ");
    });
    it("shows START_POSITION with only the evidence links stored in the idea", async () => {
      const html = await render({ sample: false, idea: withIdea(add, { action: "START_POSITION" }) });
      expect(html).toContain("Start position");
      expect(html).toContain('href="https://example.com/nvda-release"');
      expect(html.match(/href="https:\/\/example\.com/g)).toHaveLength(2);
    });
    it("shows an empty-state line, no card, when there is no idea to show (HOLD is filtered by companyIdea)", async () => {
      const html = await render({ sample: false, idea: null });
      expect(html).toContain("No trade idea for this stock yet");
      expect(html).not.toContain("Informational screening output");
    });
    it("shows no EUR amount in public action output", async () => {
      const html = await render({ sample: false, idea: withIdea(add) });
      expect(html).toContain("NVDA - Add 1/3");
      expect(html).not.toMatch(/EUR|€|Amount now/);
    });
    it("renders in Slovak", async () => {
      const html = await render({ sample: false, locale: "sk", idea: withIdea(add) });
      expect(html).toContain("Posledný investičný nápad");
      expect(html).toContain("Čo sa stalo");
    });
  });
});

describe("company page SEO text", () => {
  it("builds title and description from the score in each locale and shows the same summary", async () => {
    const [row] = await scoredUniverse();
    universe.mockResolvedValue([row.instrument]);
    scores.mockResolvedValue({ rows: [row], sample: false, lastUpdated: row.result.asOf, stale: false });
    idea.mockResolvedValue(null);
    for (const [locale, meets] of [["en", "meets"], ["sk", "spĺňa"]] as const) {
      const meta = await page.generateMetadata(props(row.instrument.ticker, locale));
      expect(String(meta.title)).toMatch(new RegExp(`${meets} \\d+ (of|z) 9 (rules|pravidiel)`));
      expect(meta.description).toContain(meets);
      expect(meta.description).not.toMatch(/\b(buy|sell|recommend|kúpiť|predať|odporúč)/i);
      const html = renderToStaticMarkup(await Company(props(row.instrument.ticker, locale)));
      expect(html).toContain("data-seo-summary");
      expect(html).toContain(meets);
    }
  });
  it("keeps the old description and no summary when the ticker has no score", async () => {
    universe.mockResolvedValue([dbInstrument]);
    scores.mockResolvedValue({ rows: [], sample: false, lastUpdated: null, stale: false });
    const meta = await page.generateMetadata(props("ZZZZ"));
    expect(meta.description).toContain("Score breakdown");
    expect(renderToStaticMarkup(await Company(props("ZZZZ")))).not.toContain("data-seo-summary");
  });
});
