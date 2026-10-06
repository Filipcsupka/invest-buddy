import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { query, buildBundle } = vi.hoisted(() => ({ query: vi.fn(), buildBundle: vi.fn() }));
vi.mock("pg", () => ({ default: { Pool: class { query = query; async end() {} } } }));
vi.mock("../../../../../db/bundle", () => ({ MAX_WINDOW_DAYS: 100, buildBundle }));
import { GET } from "./route";
const old = { token: process.env.INGEST_TOKEN, db: process.env.DATABASE_URL };
beforeEach(() => { process.env.INGEST_TOKEN = "secret"; process.env.DATABASE_URL = "postgresql://example"; query.mockReset(); buildBundle.mockReset(); });
afterEach(() => {
  if (old.token === undefined) delete process.env.INGEST_TOKEN; else process.env.INGEST_TOKEN = old.token;
  if (old.db === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = old.db;
});
it("rejects an impossible calendar date before querying the bundle", async () => {
  const request = new Request("http://localhost/api/ingest/bundle/NVDA?asOf=2026-02-30", { headers: { authorization: "Bearer secret" } });
  expect((await GET(request, { params: Promise.resolve({ symbol: "NVDA" }) })).status).toBe(400);
});
it("serves a newly approved database instrument without a compiled universe entry", async () => {
  query.mockResolvedValue({ rows: [{ "?column?": 1 }] });
  buildBundle.mockResolvedValue({ symbol: "F7ZZ", documents: [], facts: [] });
  const request = new Request("http://localhost/api/ingest/bundle/F7ZZ?asOf=2026-10-05", { headers: { authorization: "Bearer secret" } });
  const response = await GET(request, { params: Promise.resolve({ symbol: "F7ZZ" }) });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ symbol: "F7ZZ" });
  expect(query).toHaveBeenCalledWith(expect.stringContaining("FROM instruments"), ["F7ZZ"]);
});
