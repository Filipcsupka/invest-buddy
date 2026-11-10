import { expect, it } from "vitest";
import type pg from "pg";
import { ownerDataOverview, ownerTickerData } from "./store";

it("combines API usage and EODHD call log for the last seven days", async () => {
  const sql: string[] = [];
  const db = { query: async (text: string) => {
    sql.push(text);
    if (text.includes("FROM api_usage")) return { rows: [{ day: "2026-11-07", job: "legacy", requests: 1, credits: "1" }, { day: "2026-11-07", job: "symbols-sync", requests: null, credits: "10" }] };
    if (text.includes("FROM eodhd_call_log")) return { rows: [{ run_date: "2026-11-07", job: "symbols-sync", calls: 10, source_id: "eodhd" }] };
    return { rows: [] };
  } } as unknown as Pick<pg.Pool, "query">;
  const result = await ownerDataOverview(db);
  expect(result.usage).toEqual(expect.arrayContaining([
    expect.objectContaining({ day: "2026-11-07", job: "legacy", requests: 1 }),
    expect.objectContaining({ day: "2026-11-07", job: "symbols-sync", credits: "10" }),
  ]));
  expect(sql.some((query) => query.includes("run_date >= current_date-6"))).toBe(true);
});

it("matches a Nasdaq instrument to its US symbol without case sensitivity", async () => {
  const sql: string[] = [];
  const db = { query: async (text: string) => { sql.push(text); return { rows: [] }; } } as unknown as Pick<pg.Pool, "query">;
  await ownerTickerData(db, "NVDA");
  const identity = sql.find((query) => query.includes("FROM instruments i")) ?? "";
  expect(identity).toContain("upper(ids.exchange) IN ('NASDAQ','NYSE')");
});

it("finds the listing of a name without an instrument_ids row by its vendor key", async () => {
  const sql: string[] = [];
  const db = { query: async (text: string) => { sql.push(text); return { rows: [] }; } } as unknown as Pick<pg.Pool, "query">;
  await ownerTickerData(db, "AUTO.LSE");
  const identity = sql.find((query) => query.includes("FROM instruments i")) ?? "";
  expect(identity).toContain("ids.ticker IS NULL AND s.vendor_symbol = CASE WHEN position('.' IN i.ticker) > 0 THEN i.ticker ELSE i.ticker || '.US' END");
});
