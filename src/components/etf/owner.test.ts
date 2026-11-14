import { afterEach, expect, it, vi } from "vitest";
import type { Viewer } from "@/viewer/viewer";
const state = vi.hoisted(() => ({ viewer: { tier: "free", preview: false } as Viewer }));
vi.mock("@/viewer/get-viewer", async (original) => ({ ...await original<typeof import("@/viewer/get-viewer")>(), getViewer: async () => state.viewer }));
import { etfScoreView } from "./owner";

afterEach(() => vi.unstubAllEnvs());

it.each([
  ["owner", { tier: "admin", preview: false, owner: true, userId: "1" }, true],
  ["Active (Plus)", { tier: "paid", preview: false, userId: "2", plan: "plus" }, true],
  ["Active (trial)", { tier: "paid", preview: false, userId: "3", plan: "trial" }, true],
  ["Passive", { tier: "free", preview: false, userId: "4", plan: "passive" }, true],
  ["free account", { tier: "free", preview: false, userId: "5", plan: "free" }, false],
  ["anonymous", { tier: "free", preview: false }, false],
  ["owner preview", { tier: "free", preview: true, owner: true, userId: null }, false],
] as [string, Viewer, boolean][])("ETF scores for %s: %s", async (_name, viewer, expected) => {
  vi.stubEnv("EODHD_PRIVATE_USE", "on");
  state.viewer = viewer;
  expect(await etfScoreView()).toBe(expected);
});

it("a plan without a signed-in user id opens nothing", async () => {
  vi.stubEnv("EODHD_PRIVATE_USE", "on");
  state.viewer = { tier: "paid", preview: false, plan: "passive" };
  expect(await etfScoreView()).toBe(false);
  state.viewer = { tier: "paid", preview: false, plan: "plus" };
  expect(await etfScoreView()).toBe(false);
});
