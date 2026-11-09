import { beforeEach, describe, expect, it, vi } from "vitest";

const { query, getPool } = vi.hoisted(() => {
  const query = vi.fn();
  return { query, getPool: vi.fn(() => ({ query })) };
});
vi.mock("@/db/pool", () => ({ getPool }));

import { GET } from "./route";

beforeEach(() => { query.mockReset(); getPool.mockClear(); });

describe("GET /api/health", () => {
  it("uses the shared pool and a bounded SELECT 1 for repeated probes", async () => {
    query.mockResolvedValue({ rows: [{ "?column?": 1 }] });
    for (let n = 0; n < 3; n++) {
      const response = await GET();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ database: "ok" });
    }
    expect(getPool).toHaveBeenCalledTimes(3);
    expect(query).toHaveBeenCalledTimes(3);
    expect(query).toHaveBeenCalledWith({ text: "SELECT 1", query_timeout: 1000 });
  });

  it("returns 503 when the database is unavailable", async () => {
    query.mockRejectedValue(new Error("connection timeout"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ database: "unavailable" });
  });
});
