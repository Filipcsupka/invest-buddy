import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("pg", () => ({ default: { Pool: class { async end() {} } } }));
import { GET } from "./route";
const old = { token: process.env.INGEST_TOKEN, db: process.env.DATABASE_URL };
beforeEach(() => { process.env.INGEST_TOKEN = "secret"; process.env.DATABASE_URL = "postgresql://example"; });
afterEach(() => {
  if (old.token === undefined) delete process.env.INGEST_TOKEN; else process.env.INGEST_TOKEN = old.token;
  if (old.db === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = old.db;
});
it("rejects an impossible calendar date before querying the bundle", async () => {
  const request = new Request("http://localhost/api/ingest/bundle/NVDA?asOf=2026-02-30", { headers: { authorization: "Bearer secret" } });
  expect((await GET(request, { params: Promise.resolve({ symbol: "NVDA" }) })).status).toBe(400);
});
