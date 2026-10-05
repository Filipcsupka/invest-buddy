import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const universe = vi.fn();
const scores = vi.fn();
vi.mock("@/data/store", () => ({ instrumentUniverse: () => universe(), latestScores: () => scores() }));

import Company, * as page from "./page";
import { instruments } from "@/data/fixtures";
import { scoredUniverse } from "@/data/scored";

afterEach(() => { universe.mockReset(); scores.mockReset(); });
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
    const meta = await page.generateMetadata(props("zzzz"));
    expect(JSON.stringify(meta)).toContain("ZZZZ");
    expect(renderToStaticMarkup(await Company(props("ZZZZ")))).toContain("ZZZZ");
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
    const html = renderToStaticMarkup(await Company(props("ZZZZ")));
    expect(html).toContain('href="/en/company/XXXX"');
    expect(html).toContain('href="/en/company/YYYY"');
  });
});
