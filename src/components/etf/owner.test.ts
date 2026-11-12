import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ allowed: true, viewer: { owner: false, preview: false, plan: "free" } as { owner: boolean; preview: boolean; plan: "free" | "plus" | "trial" } }));
vi.mock("@/viewer/get-viewer", () => ({ getViewer: async () => state.viewer, isOwner: (viewer: { owner: boolean }) => viewer.owner, canUseVendorData: () => state.allowed }));
import { etfScoreView } from "./owner";

it.each([
  [{ owner: true, preview: false, plan: "free" }, true],
  [{ owner: false, preview: false, plan: "plus" }, true],
  [{ owner: false, preview: false, plan: "trial" }, true],
  [{ owner: false, preview: false, plan: "free" }, false],
  [{ owner: true, preview: true, plan: "free" }, false],
] as const)("shows scores to viewer %o: %s", async (viewer, expected) => {
  state.viewer = { ...viewer };
  state.allowed = true;
  expect(await etfScoreView()).toBe(expected);
});

it("keeps a Plus score behind the vendor-data gate", async () => { state.viewer = { owner: false, preview: false, plan: "plus" }; state.allowed = false; expect(await etfScoreView()).toBe(false); });
