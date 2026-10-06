import { afterEach, beforeEach, expect, it, vi } from "vitest";

const query = vi.fn();
vi.mock("pg", () => ({ default: { Pool: class { query = query; async end() {} } } }));
import { GET } from "./route";

const previous = { token: process.env.INGEST_TOKEN, database: process.env.DATABASE_URL };
beforeEach(() => { process.env.INGEST_TOKEN = "secret"; process.env.DATABASE_URL = "postgresql://example"; query.mockReset(); });
afterEach(() => {
  if (previous.token === undefined) delete process.env.INGEST_TOKEN; else process.env.INGEST_TOKEN = previous.token;
  if (previous.database === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous.database;
});

it("requires ingest authentication and returns database additions", async () => {
  expect((await GET(new Request("http://localhost/api/ingest/universe"))).status).toBe(401);
  query.mockResolvedValue({ rows: [{ ticker: "F7ZZ", name: "New Company", sector: "Biotech", tier: null }] });
  const response = await GET(new Request("http://localhost/api/ingest/universe", { headers: { authorization: "Bearer secret" } }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ instruments: [{ symbol: "F7ZZ", name: "New Company", sector: "Biotech", tier: null }] });
  expect(query).toHaveBeenCalledWith(expect.stringContaining("FROM instruments WHERE source <> 'benchmark'"));
});
