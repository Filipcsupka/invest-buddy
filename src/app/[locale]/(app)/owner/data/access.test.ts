import { afterEach, expect, it, vi } from "vitest";
import type { Viewer } from "@/viewer/viewer";

const state = vi.hoisted(() => ({ present: true, viewer: { tier: "free", preview: false } as Viewer }));
vi.mock("@/db/pool", () => ({ getPool: () => ({ query: async () => ({ rows: [{ present: state.present }] }) }) }));
vi.mock("@/viewer/get-viewer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/viewer/get-viewer")>()),
  getViewer: async () => state.viewer,
}));
import { requireCompanyDataAccess, requireEtfDataAccess } from "./access";
const originalMode = process.env.EODHD_PRIVATE_USE;
const originalLicense = process.env.VENDOR_DISPLAY_LICENSE;
afterEach(() => {
  state.present = true;
  state.viewer = { tier: "free", preview: false };
  if (originalMode === undefined) delete process.env.EODHD_PRIVATE_USE; else process.env.EODHD_PRIVATE_USE = originalMode;
  if (originalLicense === undefined) delete process.env.VENDOR_DISPLAY_LICENSE; else process.env.VENDOR_DISPLAY_LICENSE = originalLicense;
});

it("blocks public ETF rendering when EODHD enrichment is stored", async () => {
  process.env.EODHD_PRIVATE_USE = "off";
  delete process.env.VENDOR_DISPLAY_LICENSE;
  await expect(requireEtfDataAccess()).rejects.toThrow(/404|NOT_FOUND/);
  state.viewer = { tier: "admin", preview: false, owner: true, userId: "owner" };
  await expect(requireEtfDataAccess()).resolves.toBeUndefined();
});

it.each([
  ["anonymous", { tier: "free", preview: false }, false],
  ["free", { tier: "free", preview: false, userId: "free", plan: "free" }, false],
  ["trial", { tier: "paid", preview: false, userId: "trial", plan: "trial" }, true],
  ["plus", { tier: "paid", preview: false, userId: "plus", plan: "plus" }, true],
  ["owner", { tier: "admin", preview: false, owner: true, userId: "owner" }, true],
] as const)("company data access for %s in private mode", async (_name, viewer, allowed) => {
  process.env.EODHD_PRIVATE_USE = "on";
  delete process.env.VENDOR_DISPLAY_LICENSE;
  state.viewer = viewer;
  if (allowed) await expect(requireCompanyDataAccess("ASML")).resolves.toBeUndefined();
  else await expect(requireCompanyDataAccess("ASML")).rejects.toThrow(/404|NOT_FOUND/);
});

it("keeps the existing public license and unlicensed vendor locks", async () => {
  process.env.EODHD_PRIVATE_USE = "off";
  state.viewer = { tier: "free", preview: false };
  delete process.env.VENDOR_DISPLAY_LICENSE;
  await expect(requireCompanyDataAccess("ASML")).rejects.toThrow(/404|NOT_FOUND/);
  process.env.VENDOR_DISPLAY_LICENSE = "on";
  await expect(requireCompanyDataAccess("ASML")).resolves.toBeUndefined();
  state.present = false;
  delete process.env.VENDOR_DISPLAY_LICENSE;
  await expect(requireCompanyDataAccess("ASML")).resolves.toBeUndefined();
});
