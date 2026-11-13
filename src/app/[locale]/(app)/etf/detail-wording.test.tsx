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
const advice = /Buy zone|Watch\b|Avoid|Entry zone|Add when|Stop adding when|Nákupná zóna|Sledovať|Vyhnúť sa|Vstupná zóna|Pridať keď|Prestať pridávať keď|id="etf-plan"/;

beforeEach(() => { vi.stubEnv("DATA_MODE", "fixture"); });
afterEach(() => vi.unstubAllEnvs());

it.each(["en", "sk"] as const)("shows a Passive customer rule observations only, never a call or a plan (%s)", async (locale) => {
  for (const viewer of [
    { tier: "free", preview: false, userId: "5", plan: "passive" },
    { tier: "paid", preview: false, userId: "3", plan: "plus" },
    { tier: "paid", preview: false, userId: "4", plan: "trial" },
  ] as Viewer[]) {
    state.viewer = viewer;
    const html = await render(locale);
    expect(html).toContain(symbol);
    expect(html).toContain('id="etf-thesis"');
    expect(html).not.toMatch(advice);
    expect(html).not.toMatch(/\b(?:buy|sell|recommend)\b/i);
  }
});

it("keeps the call badge and the plan for the owner, and hides them in the owner's free preview", async () => {
  state.viewer = { tier: "admin", preview: false, owner: true, userId: "1" };
  const html = await render("en");
  expect(html).toContain('id="etf-plan"');
  expect(html).toContain("Entry zone");
  state.viewer = { tier: "free", preview: true, owner: true, userId: null };
  await expect(render("en")).rejects.toThrow(/404|NOT_FOUND/);
});
