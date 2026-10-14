import { beforeEach, expect, it, vi } from "vitest";

const query = vi.fn();
vi.mock("../db/pool", () => ({ getPool: () => ({ query }) }));
import { recordStartDate } from "./launch-facts";

beforeEach(() => { query.mockReset(); delete process.env.DATA_MODE; });

it("reads the first stored scan date from score_results.as_of where the audit has a scanRunId", async () => {
  query.mockResolvedValue({ rows: [{ first: "2026-10-05" }] });
  expect(await recordStartDate()).toBe("2026-10-05");
  const sql = String(query.mock.calls[0][0]);
  // Columns and table exist in migrations/001_initial.sql: score_results(as_of date, audit jsonb).
  expect(sql).toContain("MIN(as_of)");
  expect(sql).toContain("FROM score_results");
  expect(sql).toContain("audit ? 'scanRunId'");
});

it("is null in fixture mode, with no rows and on a database error", async () => {
  process.env.DATA_MODE = "fixture";
  expect(await recordStartDate()).toBeNull();
  delete process.env.DATA_MODE;
  query.mockResolvedValue({ rows: [{ first: null }] });
  expect(await recordStartDate()).toBeNull();
  query.mockRejectedValue(new Error("down"));
  expect(await recordStartDate()).toBeNull();
});
