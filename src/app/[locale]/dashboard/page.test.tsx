import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scoredUniverse } from "@/data/scored";

const scores = vi.fn();
const portfolio = vi.fn();
vi.mock("@/data/store", () => ({ latestScores: () => scores(), latestPortfolio: () => portfolio() }));
import Dashboard, * as page from "./page";

const props = (locale = "sk") => ({ params: Promise.resolve({ locale }) });
const originalMode = process.env.DATA_MODE;
afterEach(() => { scores.mockReset(); portfolio.mockReset(); process.env.DATA_MODE = originalMode; });

describe("merged stock screen", () => {
  it.each(["en", "sk"])("shows empty and stale live data in %s", async (locale) => {
    process.env.DATA_MODE = "db";
    portfolio.mockResolvedValue(null);
    scores.mockResolvedValue({ rows: [], sample: false, lastUpdated: null, stale: false });
    const empty = renderToStaticMarkup(await Dashboard(props(locale)));
    expect(empty).toContain(locale === "en" ? "No data yet" : "Zatiaľ tu nie sú údaje");
    expect(empty).not.toMatch(/SAMPLE DATA|UKÁŽKOVÉ DÁTA/);
    scores.mockResolvedValue({ rows: [], sample: false, lastUpdated: "2026-01-01", stale: true });
    const old = renderToStaticMarkup(await Dashboard(props(locale)));
    expect(old).toContain(locale === "en" ? "Stale since" : "Zastarané od");
    expect(old).not.toMatch(/SAMPLE DATA|UKÁŽKOVÉ DÁTA/);
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
});
