import { afterEach, beforeEach, expect, it, vi } from "vitest";

let calls = 0;
vi.mock("next/cache", () => ({ unstable_cache: (fn: (...a: unknown[]) => Promise<unknown>) => async (...args: unknown[]) => { calls++; return fn(...args); }, revalidateTag: vi.fn() }));
vi.mock("../db/pool", () => ({ getPool: () => null }));
import { instrumentUniverse } from "./store";

const mode = process.env.DATA_MODE;
beforeEach(() => { calls = 0; delete process.env.DATA_MODE; });
afterEach(() => { if (mode === undefined) delete process.env.DATA_MODE; else process.env.DATA_MODE = mode; });

it("does not use the cache when there is no database pool", async () => {
  expect(await instrumentUniverse()).toEqual([]);
  expect(calls).toBe(0);
});
