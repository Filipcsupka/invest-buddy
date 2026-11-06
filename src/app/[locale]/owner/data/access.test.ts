import { afterEach, expect, it, vi } from "vitest";
const pool = vi.fn();
const auth = vi.fn();
vi.mock("@/db/pool", () => ({ getPool: () => pool() }));
vi.mock("next/headers", () => ({ headers: async () => ({ get: () => "Basic test" }) }));
vi.mock("../auth", () => ({ ownerAuthorized: () => auth() }));
import { requireCompanyDataAccess, requireEtfDataAccess } from "./access";
const originalMode = process.env.EODHD_PRIVATE_USE;
afterEach(() => { pool.mockReset(); auth.mockReset(); process.env.EODHD_PRIVATE_USE = originalMode; });

it("blocks public ETF rendering when EODHD enrichment is stored", async () => {
  process.env.EODHD_PRIVATE_USE = "off";
  pool.mockReturnValue({ query: async () => ({ rows: [{ present: true }] }) });
  auth.mockReturnValue(false);
  await expect(requireEtfDataAccess()).rejects.toThrow(/404|NOT_FOUND/);
  auth.mockReturnValue(true);
  await expect(requireEtfDataAccess()).resolves.toBeUndefined();
});

it("blocks public company rendering when the ticker has EODHD bars", async () => {
  process.env.EODHD_PRIVATE_USE = "off";
  pool.mockReturnValue({ query: async () => ({ rows: [{ present: true }] }) });
  auth.mockReturnValue(false);
  await expect(requireCompanyDataAccess("ASML")).rejects.toThrow(/404|NOT_FOUND/);
});
