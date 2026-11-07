import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

const auth = vi.fn();
const pool = vi.fn();
const overview = vi.fn();
vi.mock("next/headers", () => ({ headers: async () => ({ get: () => "Basic private" }) }));
vi.mock("../auth", () => ({ ownerAuthorized: () => auth() }));
vi.mock("@/db/pool", () => ({ getPool: () => pool() }));
vi.mock("./store", () => ({ ownerDataOverview: () => overview() }));
import Page from "./page";

const props = { params: Promise.resolve({ locale: "en" }) };
afterEach(() => { auth.mockReset(); pool.mockReset(); overview.mockReset(); });

it("never renders a vendor value for a public request", async () => {
  auth.mockReturnValue(false);
  overview.mockResolvedValue({ sources: [{ family: "Daily bars", records: 1, latest: "PRIVATE_EODHD_VALUE" }] });
  await expect(Page(props)).rejects.toThrow(/404|NOT_FOUND/);
  expect(pool).not.toHaveBeenCalled();
  expect(overview).not.toHaveBeenCalled();
});

it("shows the owner every data family and its stored date", async () => {
  auth.mockReturnValue(true);
  pool.mockReturnValue({});
  overview.mockResolvedValue({
    sources: [{ family: "Daily bars", records: 5, latest: "2026-11-05" }], usage: [], callLog: [], exchanges: [], universe: [], etfs: [], macro: [], jobs: [], assets: [],
  });
  const html = renderToStaticMarkup(await Page(props));
  expect(html).toContain("Daily bars");
  expect(html).toContain("2026-11-05");
  expect(html).toContain("No stored EODHD rows yet");
  expect(html).toContain("EODHD ETF catalog");
});

it("uses Slovak source and exchange labels", async () => {
  auth.mockReturnValue(true);
  pool.mockReturnValue({});
  overview.mockResolvedValue({ sources: [{ family: "Daily bars", records: 5, latest: "2026-11-05" }], usage: [], callLog: [], exchanges: [{ exchange: "US", active: 1, symbols: 1 }], universe: [], etfs: [], macro: [], jobs: [], assets: [] });
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale: "sk" }) }));
  expect(html).toContain("Denné ceny");
  expect(html).toContain(">Burza</th>");
  expect(html).not.toContain("Symbol master by exchange");
});
