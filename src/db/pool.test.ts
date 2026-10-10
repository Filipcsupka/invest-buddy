import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Outside a React server render, cache() does not memoize. Model one request with a resettable memo.
const requestMemo = new Map<unknown, Map<string, unknown>>();
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <F extends (...args: never[]) => unknown>(fn: F) => ((...args: Parameters<F>) => {
    const byArgs = requestMemo.get(fn) ?? new Map<string, unknown>();
    requestMemo.set(fn, byArgs);
    const key = JSON.stringify(args);
    if (!byArgs.has(key)) byArgs.set(key, fn(...args));
    return byArgs.get(key);
  }) as F };
});

const pools: { options: Record<string, unknown>; query: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn> }[] = [];
const sqlSeen: string[] = [];
vi.mock("pg", () => {
  class Pool {
    query = vi.fn(async (sql: string) => { sqlSeen.push(sql); return handler(sql); });
    end = vi.fn(async () => undefined);
    on = vi.fn();
    constructor(public options: Record<string, unknown>) { pools.push(this as never); }
  }
  return { default: { Pool } };
});

let handler: (sql: string) => { rows: unknown[] };

import { closePool, getPool } from "./pool";

beforeEach(() => {
  requestMemo.clear(); pools.length = 0; sqlSeen.length = 0;
  process.env.DATABASE_URL = "postgres://test";
  delete process.env.DATA_MODE;
  handler = () => ({ rows: [] });
});
afterEach(async () => { await closePool(); delete process.env.DATABASE_URL; process.removeAllListeners("SIGTERM"); vi.restoreAllMocks(); });

describe("shared pool", () => {
  it("returns null without DATABASE_URL and builds one bounded pool otherwise", () => {
    delete process.env.DATABASE_URL;
    expect(getPool()).toBeNull();
    process.env.DATABASE_URL = "postgres://test";
    const a = getPool();
    expect(getPool()).toBe(a);
    expect(pools).toHaveLength(1);
    expect(pools[0].options).toMatchObject({ connectionString: "postgres://test", max: 5, connectionTimeoutMillis: 3000 });
    expect(pools[0].options.idleTimeoutMillis).toBeGreaterThan(0);
  });

  it("closePool ends the pool once and a later getPool builds a fresh one", async () => {
    getPool();
    await closePool();
    await closePool();
    expect(pools[0].end).toHaveBeenCalledTimes(1);
    getPool();
    expect(pools).toHaveLength(2);
  });

  it("closes the pool on SIGTERM and leaves exiting to other handlers when one exists", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    getPool();
    const other = vi.fn();
    process.on("SIGTERM", other);
    process.emit("SIGTERM");
    await vi.waitFor(() => expect(pools[0].end).toHaveBeenCalledTimes(1));
    expect(other).toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it("exits after closing on SIGTERM when nothing else handles the signal", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const saved = process.listeners("SIGTERM");
    process.removeAllListeners("SIGTERM");
    try {
      getPool();
      process.emit("SIGTERM");
      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
      expect(pools[0].end).toHaveBeenCalledTimes(1);
    } finally { for (const l of saved) process.on("SIGTERM", l as never); }
  });
});

describe("one request", () => {
  it("runs the latestScores query once even when called from metadata and page", async () => {
    handler = () => ({ rows: [] });
    const { latestScores } = await import("../data/store");
    await Promise.all([latestScores(), latestScores()]);
    await latestScores();
    expect(sqlSeen.filter((sql) => sql.includes("DISTINCT ON (s.ticker)"))).toHaveLength(1);
    expect(pools).toHaveLength(1);
    expect(pools[0].end).not.toHaveBeenCalled();
  });

  it("builds one pg.Pool for a full render of company/[ticker]", async () => {
    const { scoredUniverse } = await import("../data/scored");
    const { instruments } = await import("../data/fixtures");
    const rows = await scoredUniverse();
    const row = rows.find((r) => r.instrument.ticker === instruments[0].ticker)!;
    handler = (sql) => {
      if (sql.includes("FROM instruments WHERE source")) return { rows: [row.instrument] };
      if (sql.includes("DISTINCT ON (s.ticker)")) return { rows: [{ ...row.instrument, audit: row.result, as_of: row.result.asOf }] };
      return { rows: [] };
    };
    const Company = (await import("../app/[locale]/company/[ticker]/page")).default;
    const page = await import("../app/[locale]/company/[ticker]/page");
    const props = { params: Promise.resolve({ locale: "en", ticker: row.instrument.ticker }) };
    await page.generateMetadata(props);
    const html = renderToStaticMarkup(await Company(props));
    expect(html).toContain(row.instrument.ticker);
    expect(pools).toHaveLength(1);
    expect(sqlSeen.filter((sql) => sql.includes("DISTINCT ON (s.ticker)"))).toHaveLength(1);
    expect(sqlSeen.filter((sql) => sql.includes("FROM instruments WHERE source"))).toHaveLength(1);
    expect(pools[0].end).not.toHaveBeenCalled();
  });
});
