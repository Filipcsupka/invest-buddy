import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scoredUniverse } from "@/data/scored";

const scores = vi.fn();
const portfolio = vi.fn();
vi.mock("@/data/store", () => ({ latestScores: () => scores(), latestPortfolio: () => portfolio() }));
import Dashboard, * as page from "./page";

const props = (locale = "sk") => ({ params: Promise.resolve({ locale }) });
afterEach(() => { scores.mockReset(); portfolio.mockReset(); });

describe("merged stock screen", () => {
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
