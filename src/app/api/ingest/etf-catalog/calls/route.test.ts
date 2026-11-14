import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const state = vi.hoisted(() => ({ db: null as PGlite | null }));
vi.mock("pg", () => ({ default: { Pool: class {
  query(sql: string, params?: unknown[]) { return state.db!.query(sql, params); }
  async end() {}
} } }));

import { GET, POST } from "./route";

const url = "http://localhost/api/ingest/etf-catalog/calls";
const request = (method: "GET" | "POST", body?: unknown, token = "secret") => new Request(url, {
  method, headers: { authorization: `Bearer ${token}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const original = { token: process.env.INGEST_TOKEN, database: process.env.DATABASE_URL, budget: process.env.EODHD_ACCOUNT_DAILY_BUDGET };

beforeAll(async () => {
  state.db = new PGlite();
  await state.db.exec("CREATE TABLE data_sources (id text PRIMARY KEY); INSERT INTO data_sources VALUES ('eodhd');");
  await state.db.exec(`CREATE TABLE eodhd_call_log (
    job text NOT NULL, run_date date NOT NULL, calls integer NOT NULL DEFAULT 0 CHECK (calls >= 0),
    source_id text NOT NULL DEFAULT 'eodhd' REFERENCES data_sources(id), PRIMARY KEY (job,run_date));`);
});
afterAll(async () => { await state.db?.close(); state.db = null; });
beforeEach(async () => {
  process.env.INGEST_TOKEN = "secret"; process.env.DATABASE_URL = "postgresql://example"; process.env.EODHD_ACCOUNT_DAILY_BUDGET = "100";
  await state.db!.exec("TRUNCATE eodhd_call_log");
});
afterEach(() => {
  for (const [key, value] of Object.entries({ INGEST_TOKEN: original.token, DATABASE_URL: original.database, EODHD_ACCOUNT_DAILY_BUDGET: original.budget })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

describe("ETF enrich call accounting", () => {
  it("requires ingest authentication for reading and reporting calls", async () => {
    expect((await GET(request("GET", undefined, "wrong"))).status).toBe(401);
    expect((await POST(request("POST", { totalCalls: 10 }, "wrong"))).status).toBe(401);
    expect((await POST(request("POST", { totalCalls: -10 }))).status).toBe(400);
    const rows = await state.db!.query("SELECT * FROM eodhd_call_log");
    expect(rows.rows).toHaveLength(0);
  });

  it("stores cumulative enrich calls once and includes them in the account total", async () => {
    await state.db!.query("INSERT INTO eodhd_call_log (job,run_date,calls) VALUES ('eodhd-etf',CURRENT_DATE,20)");
    expect(await (await GET(request("GET"))).json()).toMatchObject({ accountCallsToday: 20, enrichCallsToday: 0, accountBudget: 100 });
    expect((await POST(request("POST", { totalCalls: 10 }))).status).toBe(200);
    expect((await POST(request("POST", { totalCalls: 10 }))).status).toBe(200);
    expect((await POST(request("POST", { totalCalls: 30 }))).status).toBe(200);
    expect(await (await GET(request("GET"))).json()).toMatchObject({ accountCallsToday: 50, enrichCallsToday: 30, accountBudget: 100 });
    const rows = await state.db!.query<{ job: string; calls: number }>("SELECT job,calls FROM eodhd_call_log WHERE job='etf-enrich'");
    expect(rows.rows).toEqual([{ job: "etf-enrich", calls: 30 }]);
  });
});
