import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Viewer } from "@/viewer/viewer";
import { sampleEtfPicks } from "@/data/etf-fixtures";

const state = vi.hoisted(() => ({ viewer: {} as Viewer }));
vi.mock("@/viewer/get-viewer", async (original) => ({ ...await original<typeof import("@/viewer/get-viewer")>(), getViewer: async () => state.viewer }));
vi.mock("@/db/etf-catalog", async (original) => ({ ...await original<typeof import("@/db/etf-catalog")>(), etfCatalogKeyForPick: async () => null }));
vi.mock("@/db/etf-score", async (original) => ({ ...await original<typeof import("@/db/etf-score")>(), latestEtfScores: async () => new Map() }));
import DetailPage from "./[symbol]/page";

const symbol = sampleEtfPicks[0]!.symbol;
const render = async (locale: "en" | "sk") => renderToStaticMarkup(await DetailPage({ params: Promise.resolve({ locale, symbol }) }));

beforeEach(() => { vi.stubEnv("DATA_MODE", "fixture"); });
afterEach(() => vi.unstubAllEnvs());

it.each(["en", "sk"] as const)("never renders a pick card for a customer, Passive, Plus or trial (%s)", async (locale) => {
  for (const viewer of [
    { tier: "free", preview: false },
    { tier: "free", preview: false, userId: "2", plan: "free" },
    { tier: "free", preview: false, userId: "5", plan: "passive" },
    { tier: "paid", preview: false, userId: "3", plan: "plus" },
    { tier: "paid", preview: false, userId: "4", plan: "trial" },
  ] as Viewer[]) {
    state.viewer = viewer;
    await expect(render(locale)).rejects.toThrow(/404|NOT_FOUND/);
  }
});

it.each([["en", "Entry zone", /Buy zone|Watch|Avoid/], ["sk", "Vstupná zóna", /Nákupná zóna|Sledovať|Vyhnúť sa/]] as const)("shows the owner the call badge and the plan, and hides the page in the owner's free preview (%s)", async (locale, entry, call) => {
  state.viewer = { tier: "admin", preview: false, owner: true, userId: "1" };
  const html = await render(locale);
  expect(html).toContain(symbol);
  expect(html).toContain('id="etf-plan"');
  expect(html).toContain(entry);
  expect(html).toMatch(call);
  state.viewer = { tier: "free", preview: true, owner: true, userId: null };
  await expect(render(locale)).rejects.toThrow(/404|NOT_FOUND/);
});
