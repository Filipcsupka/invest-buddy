import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => Promise<unknown>, parts: string[]) => async (...args: unknown[]) => {
    const key = JSON.stringify([parts, args]);
    if (!store.has(key)) store.set(key, await fn(...args));
    return store.get(key);
  },
  revalidateTag: vi.fn(() => { store.clear(); }),
}));
const query = vi.fn(async (sql: string) => sql.includes("FROM universe_membership m\n    JOIN instruments") ? { rows: [{ ticker: "NVDA", name: "NVIDIA", sector: "Tech", tier: 1, source: "sec" }] } : { rows: [] });
vi.mock("../db/pool", () => ({ getPool: () => ({ query }) }));

import { instrumentUniverse } from "./store";
import { webCached } from "./web-cache";
import { purgeWebCache } from "./purge";

const env = { mode: process.env.DATA_MODE };
beforeEach(() => { store.clear(); query.mockClear(); delete process.env.DATA_MODE; });
afterEach(() => { if (env.mode === undefined) delete process.env.DATA_MODE; else process.env.DATA_MODE = env.mode; });

describe("webCached", () => {
  it("reads the pool once across separate requests", async () => {
    await instrumentUniverse();
    await instrumentUniverse();
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("reads again after a purge", async () => {
    await instrumentUniverse();
    purgeWebCache(["scores"]);
    await instrumentUniverse();
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("skips the cache in fixture mode", async () => {
    process.env.DATA_MODE = "fixture";
    const fn = vi.fn(async () => 1);
    const wrapped = webCached(fn, "k", ["scores"]);
    await wrapped(); await wrapped();
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it("skips the cache when bypass says so", async () => {
    const fn = vi.fn(async () => 1);
    const wrapped = webCached(fn, "k3", ["scores"], { bypass: () => true });
    await wrapped(); await wrapped();
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it("warns when the purge fails", async () => {
    const { revalidateTag } = await import("next/cache");
    vi.mocked(revalidateTag).mockImplementationOnce(() => { throw new Error("no store"); });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(purgeWebCache(["scores"])).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("cache_purge_failed"));
    warn.mockRestore();
  });
  it("does not swallow the loader's own errors", async () => {
    const wrapped = webCached(async () => { throw new Error("db down"); }, "k2", ["scores"]);
    await expect(wrapped()).rejects.toThrow("db down");
  });
});

describe("cache hygiene", () => {
  it("cached loaders and pages read no per-viewer request data", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of ["src/data/store.ts", "src/data/ideas-store.ts", "src/data/web-cache.ts"]) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/next\/headers|cookies\(|headers\(\)/);
    }
  });
});
