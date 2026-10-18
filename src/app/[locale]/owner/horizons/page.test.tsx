import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
const enabled = vi.fn();
const auth = vi.fn();
const db = vi.fn();
const labels = vi.fn();
vi.mock("@/config/flags", () => ({ flags: () => ({ OWNER_VIEW: enabled() }) }));
vi.mock("next/headers", () => ({ headers: async () => ({ get: () => "Basic test" }) }));
vi.mock("../research/auth", () => ({ ownerResearchAuthorized: () => auth() }));
vi.mock("@/db/pool", () => ({ getPool: () => db() }));
vi.mock("@/db/horizon-labels", () => ({ latestHorizonLabels: () => labels() }));
import Page, * as route from "./page";
const props = { params: Promise.resolve({ locale: "en" }) };
afterEach(() => { enabled.mockReset(); auth.mockReset(); db.mockReset(); labels.mockReset(); });
it("gates the owner view before reading labels", async () => {
  enabled.mockReturnValue(false);
  await expect(Page(props)).rejects.toThrow(/404|NOT_FOUND/);
  enabled.mockReturnValue(true); auth.mockReturnValue(false);
  await expect(Page(props)).rejects.toThrow(/404|NOT_FOUND/);
  expect(db).not.toHaveBeenCalled(); expect(labels).not.toHaveBeenCalled();
  expect((await route.generateMetadata(props)).robots).toEqual({ index: false, follow: false });
});
it("shows the stored profile and inputs for an authorized owner", async () => {
  enabled.mockReturnValue(true); auth.mockReturnValue(true); db.mockReturnValue({});
  labels.mockResolvedValue([{ ticker: "NVDA", as_of: "2026-10-18", profile: "sustained", input_values: { yoyLatest: 26, yoyPrior1: 24, yoyPrior2: 22, yoyOldest: 20, marketCapUsd: 20_000_000_000, dollarVolume: 300_000_000, atrPercent: 2.5, move5: 1, volumeRatio: 1.2, tier: 1 }, reasons: ["sustained_growth"], candidate_profile: null, candidate_sessions: 0, horizon_rules_version: "2026-10-17.1", override_reason: null }]);
  const html = renderToStaticMarkup(await Page(props));
  expect(html).toContain("NVDA"); expect(html).toContain("sustained"); expect(html).toContain("26 / 24 / 22 / 20"); expect(html).toContain("20000000000");
});
