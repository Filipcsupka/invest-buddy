import { afterEach, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());
const get = (query = "", token = "test-token") => GET(new Request(`http://localhost/api/ingest/etf-catalog/top-rated${query}`, { headers: token ? { authorization: `Bearer ${token}` } : {} }));

it("requires the ingest token and a bounded limit before touching the database", async () => {
  vi.stubEnv("INGEST_TOKEN", "test-token");
  vi.stubEnv("DATABASE_URL", "");
  expect((await get("", "")).status).toBe(401);
  expect((await get("", "wrong")).status).toBe(401);
  for (const limit of ["0", "151", "2.5", "x"]) expect((await get(`?limit=${limit}`)).status).toBe(400);
  expect((await get("?limit=25")).status).toBe(503);
  vi.stubEnv("INGEST_TOKEN", "");
  expect((await get()).status).toBe(503);
});
