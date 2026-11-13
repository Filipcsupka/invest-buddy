import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Viewer } from "@/viewer/viewer";

const state = vi.hoisted(() => ({ viewer: { tier: "free", preview: false } as Viewer }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/viewer/get-viewer", async (importOriginal) => ({ ...await importOriginal<typeof import("@/viewer/get-viewer")>(), getViewer: async () => state.viewer }));
vi.mock("@/db/markets", async (original) => ({ ...(await original<typeof import("@/db/markets")>()), assetSummaries: async () => [], assetDetail: async () => null, indexComponents: async () => ({ asOf: null, rows: [] }) }));
vi.mock("@/db/screener", async (original) => ({ ...(await original<typeof import("@/db/screener")>()), latestScreenerRuns: async () => [], screenerResults: async () => ({ asOf: null, rows: [] }) }));
import { assertViewable, type MarketSection } from "@/markets/gate";

const Indices = (await import("./page")).default;
const Screener = (await import("../screener/page")).default;
const params = { params: Promise.resolve({ locale: "en" }) };

const viewers: Record<string, Viewer> = {
  anonymous: { tier: "free", preview: false },
  free: { tier: "free", preview: false, userId: "6", plan: "free" },
  passive: { tier: "free", preview: false, userId: "5", plan: "passive" },
  plus: { tier: "paid", preview: false, userId: "3", plan: "plus" },
  trial: { tier: "paid", preview: false, userId: "4", plan: "trial" },
  owner: { tier: "admin", preview: false, owner: true, userId: "1" },
};
const open: Record<MarketSection, string[]> = {
  indices: ["passive", "plus", "trial", "owner"],
  economy: ["passive", "plus", "trial", "owner"],
  calendar: ["passive", "plus", "trial", "owner"],
  etf: ["passive", "plus", "trial", "owner"],
  stocks: ["plus", "trial", "owner"],
};

beforeEach(() => { vi.stubEnv("MARKETS_VIEWS", "on"); vi.stubEnv("EODHD_PRIVATE_USE", "on"); });
afterEach(() => vi.unstubAllEnvs());

it.each(Object.keys(viewers))("market page gate per section for %s", async (name) => {
  state.viewer = viewers[name]!;
  for (const [section, allowed] of Object.entries(open) as [MarketSection, string[]][]) {
    if (allowed.includes(name)) await expect(assertViewable("eodhd", section), section).resolves.toBeUndefined();
    else await expect(assertViewable("eodhd", section), section).rejects.toThrow(/404|NOT_FOUND/);
  }
});

it("renders the indices page for Passive and refuses the stock screener", async () => {
  state.viewer = viewers.passive!;
  expect(renderToStaticMarkup(await Indices(params))).toContain("frame");
  await expect(Screener({ ...params, searchParams: Promise.resolve({}) })).rejects.toThrow(/404|NOT_FOUND/);
  state.viewer = viewers.free!;
  await expect(Indices(params)).rejects.toThrow(/404|NOT_FOUND/);
});

it.each([
  ["indices/page.tsx", "indices"], ["indices/[symbol]/page.tsx", "indices"], ["economy/page.tsx", "economy"], ["calendar/page.tsx", "calendar"], ["etf/fund/[key]/[tab]/page.tsx", "etf"],
  ["screener/page.tsx", null], ["news/page.tsx", null], ["congress/page.tsx", null],
])("%s asks the market gate for the %s section", (file, section) => {
  const source = readFileSync(`src/app/[locale]/(app)/${file}`, "utf8");
  const call = source.match(/assertViewable\(([^)]*)\)/)?.[1] ?? "";
  if (section) expect(call).toContain(`"${section}"`);
  else expect(call).not.toMatch(/"(indices|economy|calendar|etf)"/);
});
