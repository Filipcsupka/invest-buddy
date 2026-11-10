import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: () => async () => { throw new Error("unstable_cache must not be used in the Next server"); }, revalidateTag: vi.fn() }));
import { clearWebCache, MEMORY_BUDGET_BYTES, REVALIDATE_SECONDS, webCached } from "./web-cache";
import { purgeWebCache } from "./purge";

const runtime = process.env.NEXT_RUNTIME;
beforeEach(() => { process.env.NEXT_RUNTIME = "nodejs"; delete process.env.DATA_MODE; clearWebCache(); });
afterEach(() => { vi.useRealTimers(); if (runtime === undefined) delete process.env.NEXT_RUNTIME; else process.env.NEXT_RUNTIME = runtime; });

const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("webCached in the Next server", () => {
  it("shares one loader call between concurrent misses", async () => {
    const gate = deferred<number>();
    const fn = vi.fn(() => gate.promise);
    const read = webCached(fn, "sf", ["scores"]);
    const reads = Array.from({ length: 50 }, () => read());
    gate.resolve(7);
    expect(await Promise.all(reads)).toEqual(Array(50).fill(7));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(await read()).toBe(7);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("keys entries by arguments", async () => {
    const fn = vi.fn(async (ticker: string) => ticker.toLowerCase());
    const read = webCached(fn, "args", ["scores"]);
    expect(await read("A")).toBe("a");
    expect(await read("B")).toBe("b");
    expect(await read("A")).toBe("a");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("serves the old value after a purge while one background read replaces it", async () => {
    let value = 1;
    const fn = vi.fn(async () => value);
    const read = webCached(fn, "soft", ["scores"]);
    expect(await read()).toBe(1);
    value = 2;
    expect(purgeWebCache(["scores"])).toBe(true);
    const burst = await Promise.all(Array.from({ length: 20 }, () => read()));
    expect(burst).toEqual(Array(20).fill(1));
    await flush();
    expect(fn).toHaveBeenCalledTimes(2);
    expect(await read()).toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("leaves entries with other tags fresh", async () => {
    const fn = vi.fn(async () => 1);
    const read = webCached(fn, "other-tag", ["ideas"]);
    await read();
    purgeWebCache(["scores"]);
    await read(); await flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("refreshes in the background after REVALIDATE_SECONDS", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    let value = 1;
    const fn = vi.fn(async () => value);
    const read = webCached(fn, "ttl", ["scores"]);
    await read();
    value = 2;
    vi.setSystemTime(Date.now() + (REVALIDATE_SECONDS - 1) * 1000);
    expect(await read()).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 2000);
    expect(await read()).toBe(1);
    await flush();
    expect(await read()).toBe(2);
  });

  it("keeps the old value when the background read fails", async () => {
    let fail = false;
    const fn = vi.fn(async () => { if (fail) throw new Error("db down"); return 1; });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const read = webCached(fn, "fail", ["scores"]);
    await read();
    fail = true;
    purgeWebCache(["scores"]);
    expect(await read()).toBe(1);
    await flush();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("web_cache_refresh_failed"));
    expect(await read()).toBe(1);
    fail = false;
    await flush();
    expect(await read()).toBe(1);
    warn.mockRestore();
  });

  it("rejects every waiter of a failed miss and retries on the next call", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("db down")).mockResolvedValue(3);
    const read = webCached(fn, "miss-fail", ["scores"]);
    await expect(Promise.all([read(), read()])).rejects.toThrow("db down");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(await read()).toBe(3);
  });

  it("does not keep a value larger than the budget", async () => {
    const big = "x".repeat(MEMORY_BUDGET_BYTES + 1);
    const fn = vi.fn(async () => big);
    const read = webCached(fn, "big", ["scores"]);
    await read(); await read();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("still skips the cache in fixture mode and on bypass", async () => {
    const fn = vi.fn(async () => 1);
    const bypassed = webCached(fn, "bp", ["scores"], { bypass: () => true });
    await bypassed(); await bypassed();
    process.env.DATA_MODE = "fixture";
    const fixture = webCached(fn, "fx", ["scores"]);
    await fixture(); await fixture();
    expect(fn).toHaveBeenCalledTimes(4);
  });
});
