import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

const snapshot = vi.fn();
const indexed = vi.fn();
vi.mock("@/data/store", () => ({ latestPortfolio: () => snapshot(), portfolioIndexedSeries: () => indexed(), stale: () => true }));
import PortfolioPage from "./page";

const originalMode = process.env.DATA_MODE;
const props = (locale: string) => ({ params: Promise.resolve({ locale }) });
afterEach(() => { snapshot.mockReset(); indexed.mockReset(); process.env.DATA_MODE = originalMode; });

it.each(["en", "sk"])("shows an empty live portfolio in %s", async (locale) => {
  process.env.DATA_MODE = "db";
  snapshot.mockResolvedValue(null);
  const html = renderToStaticMarkup(await PortfolioPage(props(locale)));
  expect(html).toContain(locale === "en" ? "No data yet" : "Zatiaľ tu nie sú údaje");
  expect(html).not.toMatch(/SAMPLE DATA|UKÁŽKOVÉ DÁTA|Synthetic benchmark/);
});

it("uses only the live indexed series and no fixture figure in db mode", async () => {
  process.env.DATA_MODE = "db";
  snapshot.mockResolvedValue({ sample: false, asOf: "2026-01-01", weights: [{ symbol: "NVDA", weightPercent: 20 }], series: [{ date: "2026-01-01", nav: 9876, benchmark: 6543 }] });
  indexed.mockResolvedValue({ points: [], twrPercent: null, benchmarkPercent: null });
  const html = renderToStaticMarkup(await PortfolioPage(props("en")));
  expect(indexed).toHaveBeenCalledOnce();
  expect(html).toContain("Stale since");
  expect(html).not.toMatch(/9876|6543|SAMPLE DATA|sample illustration|Synthetic benchmark/);
});
