import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
const owner = vi.fn();
const listStats = vi.fn();
vi.mock("@/components/etf/owner", () => ({ etfOwnerView: async () => owner() }));
vi.mock("@/db/etf-detail", () => ({ etfListStats: (...args: unknown[]) => listStats(...args) }));
import ListPage from "./page";
import FundPage from "./fund/[key]/page";

const originalMode = process.env.DATA_MODE;
afterEach(() => { process.env.DATA_MODE = originalMode; owner.mockReset(); listStats.mockReset(); });

it("keeps vendor columns and tab links off the public pages", async () => {
  process.env.DATA_MODE = "fixture";
  owner.mockReturnValue(false);
  const list = renderToStaticMarkup(await ListPage({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({}) }));
  expect(list).not.toContain("1y return");
  expect(listStats).not.toHaveBeenCalled();
  const fund = renderToStaticMarkup(await FundPage({ params: Promise.resolve({ locale: "en", key: "DE0000000001" }) }));
  expect(fund).not.toContain("/etf/fund/DE0000000001/holdings");
});

it("adds yield and 1-year return columns and the tab links for the owner", async () => {
  process.env.DATA_MODE = "fixture";
  owner.mockReturnValue(true);
  listStats.mockResolvedValue(new Map([["DE0000000001", { yieldPct: null, ret1yPct: 12.2351, asOf: "2026-11-06" }]]));
  const list = renderToStaticMarkup(await ListPage({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({}) }));
  expect(list).toContain("1y return");
  expect(list).toContain("12.24 %");
  expect(list).toContain("No data");
  const fund = renderToStaticMarkup(await FundPage({ params: Promise.resolve({ locale: "sk", key: "DE0000000001" }) }));
  expect(fund).toContain('href="/sk/etf/fund/DE0000000001/holdings"');
  expect(fund).toContain("Len pre vlastníka");
});
