import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
const owner = vi.fn();
const listStats = vi.fn();
const scoreAccess = vi.fn();
const scores = vi.fn();
vi.mock("@/components/etf/owner", () => ({ etfOwnerView: async () => owner(), etfPickOwnerView: async () => owner(), etfScoreView: async () => scoreAccess(), requireEtfScreeningAccess: async () => undefined }));
vi.mock("@/db/etf-score", () => ({ latestEtfScores: (...args: unknown[]) => scores(...args) }));
vi.mock("@/db/etf-detail", () => ({ etfListStats: (...args: unknown[]) => listStats(...args) }));
import ListPage from "./page";
import FundPage from "./fund/[key]/page";

const originalMode = process.env.DATA_MODE;
afterEach(() => { process.env.DATA_MODE = originalMode; owner.mockReset(); listStats.mockReset(); scoreAccess.mockReset(); scores.mockReset(); });

it("keeps vendor columns and tab links off the public pages", async () => {
  process.env.DATA_MODE = "fixture";
  owner.mockReturnValue(false);
  scoreAccess.mockReturnValue(false);
  const list = renderToStaticMarkup(await ListPage({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({}) }));
  expect(list).not.toContain("1y return");
  expect(listStats).not.toHaveBeenCalled();
  const fund = renderToStaticMarkup(await FundPage({ params: Promise.resolve({ locale: "en", key: "DE0000000001" }) }));
  expect(fund).not.toContain("/etf/fund/DE0000000001/holdings");
});

it.each([
  ["en", "3 rated · 34 with data · 38 listed", "Rating"],
  ["sk", "3 hodnotených · 34 s údajmi · 38 v zozname", "Hodnotenie"],
])("shows the default rating order and catalog counts in %s", async (locale, summary, label) => {
  process.env.DATA_MODE = "fixture";
  owner.mockReturnValue(false);
  scoreAccess.mockReturnValue(false);
  const html = renderToStaticMarkup(await ListPage({ params: Promise.resolve({ locale }), searchParams: Promise.resolve({}) }));
  expect(html).toContain(summary);
  expect(html).toContain(`<option value="rating" selected="">${label}</option>`);
  expect(html.indexOf("Emerging markets sample fund")).toBeLessThan(html.indexOf("Global aggregate bond sample fund"));
});

it("adds stored fund statistics columns and the tab links for vendor viewers", async () => {
  process.env.DATA_MODE = "fixture";
  owner.mockReturnValue(true);
  scoreAccess.mockReturnValue(true);
  scores.mockResolvedValue(new Map());
  const list = renderToStaticMarkup(await ListPage({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({}) }));
  for (const label of ["1y return", "3y return p.a.", "Volatility 1y", "Yield", "Holdings", "Top 10 weight", "Category"]) expect(list).toContain(`>${label}</th>`);
  // Every table and every rating block carries the informational line.
  expect((list.match(/data-adr-line=""/g) ?? []).length).toBeGreaterThanOrEqual((list.match(/<table /g) ?? []).length);
  expect(list).toMatch(/[+-]?\d+\.\d %/);
  expect(listStats).not.toHaveBeenCalled();
  const fund = renderToStaticMarkup(await FundPage({ params: Promise.resolve({ locale: "sk", key: "DE0000000001" }) }));
  expect(fund).toContain('href="/sk/etf/fund/DE0000000001/holdings"');
  expect(fund).toContain("Uložené údaje o fonde pre predplatiteľov");
});

it.each(["owner", "plus", "trial", "free", "anonymous"])("shows ETF score to %s viewer according to vendor permission", async (viewer) => {
  process.env.DATA_MODE = "fixture";
  owner.mockReturnValue(viewer === "owner");
  scoreAccess.mockReturnValue(!["free", "anonymous"].includes(viewer));
  scores.mockResolvedValue(new Map([["DE0000000001", { state: "rated", rules: [], rejections: [], earned: 28, evidencedMax: 35, percent: 80, concentration: { concentrated: false } }]]));
  listStats.mockResolvedValue(new Map());
  const list = renderToStaticMarkup(await ListPage({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({}) }));
  const fund = renderToStaticMarkup(await FundPage({ params: Promise.resolve({ locale: "en", key: "DE0000000001" }) }));
  if (viewer !== "owner") expect(fund).not.toContain('id="fund-pick"');
  if (["free", "anonymous"].includes(viewer)) { expect(list).not.toContain("Meets 28 of 35"); expect(fund).not.toContain("Meets 28 of 35"); expect(scores).not.toHaveBeenCalled(); }
  else { expect(list).toMatch(/80%<\/strong><span class="[^"]*" data-band="mostlyMet">Mostly met<\/span>/); expect(list).toContain("0 of 7 groups · Incomplete data"); expect(fund).toContain("Meets 28 of 35"); 
    // Customers never see a model call. The owner sees calls only in the owner research section below the catalog.
    const rated = viewer === "owner" ? list.slice(0, list.indexOf('aria-labelledby="etf-picks"')) : list + fund;
    if (viewer === "owner") expect(list).toContain('aria-labelledby="etf-picks"');
    expect(rated).not.toMatch(/Buy zone|Avoid|BUY_ZONE|Nákupná zóna|Vyhnúť sa/); }
});

it("distinguishes missing scores from computed unrated scores", async () => {
  process.env.DATA_MODE = "fixture";
  scoreAccess.mockReturnValue(true);
  scores.mockResolvedValue(new Map());
  let html = renderToStaticMarkup(await FundPage({ params: Promise.resolve({ locale: "en", key: "DE0000000001" }) }));
  expect(html).toContain("Rating not computed");
  scores.mockResolvedValue(new Map([["DE0000000001", { state: "not_rated", rules: [], rejections: ["insufficient_evidence"], earned: 0, evidencedMax: 0, percent: null }]]));
  html = renderToStaticMarkup(await FundPage({ params: Promise.resolve({ locale: "en", key: "DE0000000001" }) }));
  expect(html).toContain("Insufficient data");
  expect(html).not.toContain("Rating not computed");
});
