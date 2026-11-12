import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const gate = vi.fn();
const curve = vi.fn();
const calendar = vi.fn();
const indicators = vi.fn();
vi.mock("@/markets/gate", () => ({ assertViewable: (source: string) => gate(source) }));
vi.mock("@/db/economy", async (original) => ({
  ...(await original<typeof import("@/db/economy")>()),
  ustCurve: (kind: string) => curve(kind),
  fedFundsRate: async () => ({ date: "2026-10-01", value: 3.87 }),
  economicCalendar: (options: unknown) => calendar(options),
  eventCountries: async () => ["DE", "US"],
  latestIndicators: () => indicators(),
}));
import Economy from "./page";

const render = async (search: Record<string, string> = {}, locale = "en") =>
  renderToStaticMarkup(await Economy({ params: Promise.resolve({ locale }), searchParams: Promise.resolve(search) }));
const snapshot = (date: string, rates: [string, number, "eodhd" | "treasury"][]) => ({ date, points: rates.map(([tenor, rate, source]) => ({ tenor, rate, source })) });

beforeEach(() => {
  gate.mockResolvedValue(undefined);
  curve.mockImplementation(async (kind: string) => kind === "yield"
    ? { latest: snapshot("2026-11-05", [["3M", 4.1, "eodhd"], ["2Y", 4.2, "eodhd"], ["10Y", 4.72, "treasury"]]), weekAgo: snapshot("2026-10-29", [["10Y", 4.6, "eodhd"]]), monthAgo: snapshot("2026-10-06", [["3M", 4.0, "eodhd"], ["10Y", 4.5, "eodhd"]]) }
    : { latest: null, weekAgo: null, monthAgo: null });
  calendar.mockResolvedValue([{ key: "k1", country: "US", type: "Business Inventories", comparison: "mom", period: "Sep", eventAt: "2026-11-17T15:00:00Z", actual: null, previous: 0.4, estimate: 0.2, change: null, changePct: null }]);
  indicators.mockResolvedValue([{ country: "USA", countryName: "United States", indicator: "gdp_growth_annual", indicatorName: "GDP growth (annual %)", date: "2025-12-31", value: 2.1614 }]);
});
afterEach(() => { vi.clearAllMocks(); });

it("checks the owner gate before reading data", async () => {
  gate.mockRejectedValue(new Error("NEXT_HTTP_ERROR_FALLBACK;404"));
  await expect(render()).rejects.toThrow();
  expect(gate).toHaveBeenCalledWith("eodhd");
  expect(curve).not.toHaveBeenCalled();
});

it("renders the rates tab with the curve, changes in basis points and the Treasury source", async () => {
  const html = await render();
  expect(html).not.toContain("Owner-only view");
  expect(html).toContain("US Treasury par yield curve");
  expect(html).toContain("4.72 %");
  expect(html).toContain("+22 bp");
  expect(html).toContain("+12 bp");
  expect(html).toContain("US Treasury");
  expect(html).toContain("3.87 %");
  expect(html).toContain('aria-current="page"');
  expect(html).not.toMatch(/\b(buy|sell|follow)\b/i);
});

it("renders the calendar tab with vendor times in UTC and a country filter", async () => {
  const html = await render({ tab: "calendar", country: "us" });
  expect(calendar).toHaveBeenCalledWith(expect.objectContaining({ country: "US" }));
  expect(html).toContain("Business Inventories");
  expect(html).toContain("15:00");
  expect(html).toContain('name="country"');
  expect(html).toContain("0.20");
});

it("renders the country tab in Slovak", async () => {
  const html = await render({ tab: "countries" }, "sk");
  expect(html).toContain("Spojené štáty");
  expect(html).toContain("Rast HDP, %");
  expect(html).toContain("(2025)");
});

it("says when nothing is stored yet", async () => {
  curve.mockResolvedValue({ latest: null, weekAgo: null, monthAgo: null });
  expect(await render()).toContain("No data stored yet");
});
