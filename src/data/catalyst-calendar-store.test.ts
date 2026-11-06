import { afterEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
const pool = vi.fn<() => { query: typeof query } | null>(() => ({ query }));
vi.mock("../db/pool", () => ({ getPool: () => pool() }));

import { publicEarningsDate } from "./catalyst-calendar-store";

const original = process.env.DATA_MODE;
afterEach(() => {
  query.mockReset(); pool.mockReset(); pool.mockReturnValue({ query });
  if (original === undefined) delete process.env.DATA_MODE; else process.env.DATA_MODE = original;
});

function rows(list: { ticker: string; observedOn: string; reportDate: string; timeOfDay: string | null }[], latestPull: string) {
  query.mockImplementation(async (sql: string) => sql.includes('AS "latestPull"')
    ? { rows: [{ latestPull }] }
    : { rows: list.map((r) => ({ ...r, fiscalDateEnding: "2026-09-30" })) });
}

describe("publicEarningsDate", () => {
  it("returns null and reads nothing while PUBLIC_EARNINGS_DATES is off or unset", async () => {
    delete process.env.DATA_MODE;
    rows([{ ticker: "AMD", observedOn: "2026-10-19", reportDate: "2026-10-28", timeOfDay: "post-market" }], "2026-10-19");
    expect(await publicEarningsDate("AMD", "2026-10-19", {})).toBeNull();
    expect(await publicEarningsDate("AMD", "2026-10-19", { PUBLIC_EARNINGS_DATES: "off" })).toBeNull();
    expect(await publicEarningsDate("AMD", "2026-10-19", { PUBLIC_EARNINGS_DATES: "true" })).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it("returns only the date and time of day of the next report when the flag is on", async () => {
    delete process.env.DATA_MODE;
    rows([{ ticker: "AMD", observedOn: "2026-10-19", reportDate: "2026-10-28", timeOfDay: "post-market" }], "2026-10-19");
    expect(await publicEarningsDate("AMD", "2026-10-19", { PUBLIC_EARNINGS_DATES: "on" })).toEqual({ date: "2026-10-28", timeOfDay: "post-market" });
    expect(query.mock.calls[0][1]).toEqual(["2026-10-19", ["AMD"]]);
  });

  it("leaves out a stale date, a failed read, fixture mode and a missing pool", async () => {
    delete process.env.DATA_MODE;
    const on = { PUBLIC_EARNINGS_DATES: "on" };
    rows([{ ticker: "AMD", observedOn: "2026-10-10", reportDate: "2026-10-28", timeOfDay: null }], "2026-10-19");
    expect(await publicEarningsDate("AMD", "2026-10-19", on)).toBeNull();
    query.mockReset(); query.mockRejectedValue(new Error("relation does not exist"));
    expect(await publicEarningsDate("AMD", "2026-10-19", on)).toBeNull();
    pool.mockReturnValue(null);
    expect(await publicEarningsDate("AMD", "2026-10-19", on)).toBeNull();
    pool.mockReturnValue({ query });
    query.mockReset();
    process.env.DATA_MODE = "fixture";
    expect(await publicEarningsDate("AMD", "2026-10-19", on)).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
});
