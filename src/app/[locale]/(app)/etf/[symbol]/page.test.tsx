import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
// The pick card is owner only (see access.test.tsx for every other viewer); these tests render it as the owner.
vi.mock("@/viewer/get-viewer", async (original) => ({ ...await original<typeof import("@/viewer/get-viewer")>(), getViewer: async () => ({ tier: "admin", preview: false, owner: true, userId: "owner" }) }));
import { sampleEtfPicks } from "@/data/etf-fixtures";
const scoreAccess = vi.fn();
const scores = vi.fn();
vi.mock("@/components/etf/owner", async (original) => ({ ...await original<typeof import("@/components/etf/owner")>(), etfScoreView: () => scoreAccess() }));
vi.mock("@/db/etf-score", () => ({ latestEtfScores: (...args: unknown[]) => scores(...args) }));
import Page from "./page";

const originalMode = process.env.DATA_MODE;
afterEach(() => { process.env.DATA_MODE = originalMode; scoreAccess.mockReset(); scores.mockReset(); });

it.each(["en", "sk"])("shows the ETF card sections and measurement in %s", async (locale) => {
  process.env.DATA_MODE = "fixture";
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale, symbol: "VWRA" }) }));
  expect(html).toContain(locale === "en" ? "SAMPLE DATA" : "UKÁŽKOVÉ ÚDAJE");
  expect(html).toContain(locale === "en" ? "Thesis" : "Téza");
  expect(html).toContain(locale === "en" ? "Entry zone" : "Vstupná zóna");
  expect(html).toContain(locale === "en" ? "Evidence" : "Zdroje");
  expect(html).toContain("SPY");
});

it("shows the stored score for the matching listing", async () => {
  process.env.DATA_MODE = "fixture";
  scoreAccess.mockReturnValue(true);
  scores.mockResolvedValue(new Map([["DE0000000001", { state: "rated", rules: [], rejections: [], earned: 8, evidencedMax: 10, percent: 80, concentration: { concentrated: false } }]]));
  const originalExchange = sampleEtfPicks[0].exchange;
  sampleEtfPicks[0].exchange = "XETR";
  try {
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale: "en", symbol: "VWRA" }) }));
    expect(html).toContain("80% · Mostly met");
    expect(html).toContain("Meets 8 of 10 evidenced points");
    expect(html).toContain("Informational screening");
  } finally { sampleEtfPicks[0].exchange = originalExchange; }
});
