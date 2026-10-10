import pg from "pg";
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/twelvedata-nvda.json";
import { MemoryPriceRepository } from "../db/prices";
import { priceTickers, runPrices } from "../jobs/prices";
import { TwelveDataProvider } from "./twelvedata";
import { CapReached, checkReserve, MemoryUsageLedger, PostgresUsageLedger, RESERVED_SHARES, UnknownUsageSource, type Limits } from "./usage";

const after = Date.parse("2025-08-08T01:00:00Z");
const free: Limits = { dailyCap: 800, monthlyCostCapEur: 0 };
const noUsage = { dayTotal: 0, dayByShareJob: 0, monthCostEur: 0 };

describe("checkReserve", () => {
  it("allows up to the daily cap and throws past it", () => {
    expect(() => checkReserve("x", 5, { dailyCap: 5, monthlyCostCapEur: 0 }, noUsage)).not.toThrow();
    expect(() => checkReserve("x", 1, { dailyCap: 5, monthlyCostCapEur: 0 }, { ...noUsage, dayTotal: 5 })).toThrow(CapReached);
    expect(() => checkReserve("x", 6, { dailyCap: 5, monthlyCostCapEur: 0 }, noUsage)).toThrow(/daily cap 5/);
  });
  it("has no daily limit when the cap is null", () => {
    expect(() => checkReserve("x", 1000, { dailyCap: null, monthlyCostCapEur: 0 }, { ...noUsage, dayTotal: 1e6 })).not.toThrow();
  });
  it("refuses a paid call while the monthly cost cap is 0 or unset", () => {
    expect(() => checkReserve("x", 1, free, noUsage, { costEur: 0.01 })).toThrow(expect.objectContaining({ reason: "cost_cap" }));
    expect(() => checkReserve("x", 1, { dailyCap: null, monthlyCostCapEur: null }, noUsage, { costEur: 0.01 })).toThrow(CapReached);
    expect(() => checkReserve("x", 1, free, noUsage)).not.toThrow();
  });
  it("allows a paid call under a named cap and stops at it", () => {
    const limits = { dailyCap: null, monthlyCostCapEur: 10 };
    expect(() => checkReserve("x", 1, limits, { ...noUsage, monthCostEur: 9.5 }, { costEur: 0.5 })).not.toThrow();
    expect(() => checkReserve("x", 1, limits, { ...noUsage, monthCostEur: 9.5 }, { costEur: 0.51 })).toThrow(CapReached);
  });
  it("rejects bad request counts", () => {
    for (const n of [0, -1, 1.5, Number.NaN]) expect(() => checkReserve("x", n, free, noUsage)).toThrow(/positive whole number/);
  });
});

/** Fake pool that records every statement. Answers the limits and usage reads from the given numbers. */
function fakePool(limits: { daily_cap: number | null; monthly_cost_cap_eur: string | null } | null, usage: { day_total: string; day_by_share_job: string; month_cost: string }) {
  const statements: string[] = [];
  const client = {
    query: async (sql: string) => {
      statements.push(sql.trim().split(/\s+/)[0] + (sql.includes("INSERT INTO api_usage") ? " api_usage" : ""));
      if (sql.includes("FROM data_sources")) return { rows: limits ? [limits] : [] };
      if (sql.includes("FROM api_usage")) return { rows: [usage] };
      return { rows: [] };
    },
    release: () => undefined
  };
  return { pool: { connect: async () => client } as unknown as pg.Pool, statements };
}

describe("PostgresUsageLedger (fake pool)", () => {
  it("throws beyond the cap and writes nothing", async () => {
    const { pool, statements } = fakePool({ daily_cap: 5, monthly_cost_cap_eur: "0.00" }, { day_total: "5", day_by_share_job: "0", month_cost: "0" });
    await expect(new PostgresUsageLedger(pool).reserve("alphavantage", 1, { job: "collect" })).rejects.toBeInstanceOf(CapReached);
    expect(statements).not.toContain("INSERT api_usage");
    expect(statements.at(-1)).toBe("ROLLBACK");
  });
  it("inserts and commits when the request fits", async () => {
    const { pool, statements } = fakePool({ daily_cap: 5, monthly_cost_cap_eur: "0.00" }, { day_total: "4", day_by_share_job: "0", month_cost: "0" });
    expect(await new PostgresUsageLedger(pool).reserve("alphavantage", 1, { job: "collect", now: new Date("2026-10-12T10:00:00Z") })).toEqual({ source: "alphavantage", day: "2026-10-12", requests: 1 });
    expect(statements).toContain("INSERT api_usage");
    expect(statements.at(-1)).toBe("COMMIT");
  });
  it("takes the advisory lock before reading usage", async () => {
    const { pool, statements } = fakePool({ daily_cap: null, monthly_cost_cap_eur: "0.00" }, { day_total: "0", day_by_share_job: "0", month_cost: "0" });
    await new PostgresUsageLedger(pool).reserve("twelvedata", 1);
    expect(statements.slice(0, 3)).toEqual(["BEGIN", "SELECT", "SELECT"]);
  });
  it("rejects a source with no data_sources row", async () => {
    const { pool } = fakePool(null, { day_total: "0", day_by_share_job: "0", month_cost: "0" });
    await expect(new PostgresUsageLedger(pool).reserve("nope", 1)).rejects.toBeInstanceOf(UnknownUsageSource);
  });
});

describe("prices job and the usage ledger", () => {
  const tdFetch = (async () => new Response(JSON.stringify(fixture), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  const provider = (ledger: MemoryUsageLedger, job: string) => {
    let clock = after;
    return new TwelveDataProvider({ apiKey: "k", fetch: tdFetch, now: () => clock, sleep: async (ms) => { clock += ms; }, reserve: () => ledger.reserve("twelvedata", 1, { job, credits: 1, now: new Date(after) }) });
  };
  it("a Twelve Data run of 37 symbols records 37 requests under the prices job", async () => {
    const ledger = new MemoryUsageLedger({ twelvedata: free });
    const tickers = priceTickers();
    expect(tickers).toHaveLength(37);
    const result = await runPrices(provider(ledger, "prices"), new MemoryPriceRepository(), tickers);
    expect(result.succeeded).toBe(37);
    expect(ledger.rows.reduce((n, r) => n + r.requests, 0)).toBe(37);
    expect(ledger.rows.every((r) => r.job === "prices" && r.source === "twelvedata" && r.credits === 1)).toBe(true);
  });
  it("discovery cannot take the share reserved for prices, and prices still fetches every symbol", async () => {
    const ledger = new MemoryUsageLedger({ twelvedata: free });
    const discovery = provider(ledger, "discovery");
    const allowed = free.dailyCap! - RESERVED_SHARES.twelvedata.requests;
    for (let i = 0; i < allowed; i++) await ledger.reserve("twelvedata", 1, { job: "discovery", now: new Date(after) });
    await expect(discovery.bars("AAPL")).rejects.toMatchObject({ name: "CapReached", reason: "reserved_share" });
    expect(ledger.rows).toHaveLength(allowed);
    const result = await runPrices(provider(ledger, "prices"), new MemoryPriceRepository(), priceTickers());
    expect(result).toMatchObject({ succeeded: 37, failed: 0, exitCode: 0, stoppedReason: null });
  });
  it("a prices run stops cleanly when the hard cap is reached", async () => {
    const ledger = new MemoryUsageLedger({ twelvedata: { dailyCap: 10, monthlyCostCapEur: 0 } });
    const result = await runPrices(provider(ledger, "prices"), new MemoryPriceRepository(), priceTickers());
    expect(result.succeeded).toBe(10);
    expect(result.stoppedReason).toMatch(/daily cap 10/);
    expect(ledger.rows).toHaveLength(10);
  });
});

const dbDescribe = describe.skipIf(!process.env.TEST_DATABASE_URL);
dbDescribe("api_usage (Postgres)", () => {
  const SOURCE = "usage-test";
  async function withSource<T>(cap: number, fn: (pool: pg.Pool) => Promise<T>): Promise<T> {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 12 });
    try {
      await pool.query("DELETE FROM api_usage WHERE source_id=$1", [SOURCE]);
      await pool.query("DELETE FROM data_sources WHERE id=$1", [SOURCE]);
      await pool.query("INSERT INTO data_sources (id,name,kind,licence_class,daily_cap) VALUES ($1,'Usage test','other','internal_only',$2)", [SOURCE, cap]);
      return await fn(pool);
    } finally {
      await pool.query("DELETE FROM api_usage WHERE source_id=$1", [SOURCE]);
      await pool.query("DELETE FROM data_sources WHERE id=$1", [SOURCE]);
      await pool.end();
    }
  }
  it("defaults the cost cap to 0 and seeds none as null", async () => {
    await withSource(5, async (pool) => {
      expect((await pool.query("SELECT monthly_cost_cap_eur::text AS c FROM data_sources WHERE id=$1", [SOURCE])).rows[0].c).toBe("0.00");
      expect((await pool.query("SELECT count(*)::int AS n FROM data_sources WHERE monthly_cost_cap_eur IS NULL")).rows[0].n).toBe(0);
    });
  });
  it("two concurrent reserves respect the cap", async () => {
    await withSource(1, async (pool) => {
      const ledger = new PostgresUsageLedger(pool);
      const results = await Promise.allSettled([ledger.reserve(SOURCE, 1, { job: "a" }), ledger.reserve(SOURCE, 1, { job: "b" })]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")[0]).toMatchObject({ reason: expect.any(CapReached) });
      expect((await pool.query("SELECT COALESCE(sum(requests),0)::int AS n FROM api_usage WHERE source_id=$1", [SOURCE])).rows[0].n).toBe(1);
    });
  });
  it("ten concurrent reserves against a cap of 5 write exactly 5 rows", async () => {
    await withSource(5, async (pool) => {
      const ledger = new PostgresUsageLedger(pool);
      const results = await Promise.allSettled(Array.from({ length: 10 }, () => ledger.reserve(SOURCE, 1, { job: "x" })));
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
      expect((await pool.query("SELECT count(*)::int AS n FROM api_usage WHERE source_id=$1", [SOURCE])).rows[0].n).toBe(5);
    });
  });
  it("reserve beyond the cap throws and writes no row; a paid call fails while the cost cap is 0", async () => {
    await withSource(2, async (pool) => {
      const ledger = new PostgresUsageLedger(pool);
      await expect(ledger.reserve(SOURCE, 3)).rejects.toBeInstanceOf(CapReached);
      await expect(ledger.reserve(SOURCE, 1, { costEur: 0.01 })).rejects.toMatchObject({ reason: "cost_cap" });
      expect((await pool.query("SELECT count(*)::int AS n FROM api_usage WHERE source_id=$1", [SOURCE])).rows[0].n).toBe(0);
      await pool.query("UPDATE data_sources SET monthly_cost_cap_eur=1 WHERE id=$1", [SOURCE]);
      await ledger.reserve(SOURCE, 1, { costEur: 0.5 });
      await expect(ledger.reserve(SOURCE, 1, { costEur: 0.6 })).rejects.toMatchObject({ reason: "cost_cap" });
    });
  });
  it("keeps the share reserved for prices on the real twelvedata row", async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const day = new Date("2031-03-03T10:00:00Z");
    try {
      await pool.query("DELETE FROM api_usage WHERE day='2031-03-03'");
      const ledger = new PostgresUsageLedger(pool);
      const cap = (await pool.query("SELECT daily_cap FROM data_sources WHERE id='twelvedata'")).rows[0].daily_cap as number;
      await ledger.reserve("twelvedata", cap - RESERVED_SHARES.twelvedata.requests, { job: "discovery", now: day });
      await expect(ledger.reserve("twelvedata", 1, { job: "discovery", now: day })).rejects.toMatchObject({ reason: "reserved_share" });
      await ledger.reserve("twelvedata", 37, { job: "prices", now: day });
    } finally { await pool.query("DELETE FROM api_usage WHERE day='2031-03-03'"); await pool.end(); }
  });
});
