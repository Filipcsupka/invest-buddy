import { afterEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
const end = vi.fn(async () => undefined);
vi.mock("pg", () => ({ default: { Pool: vi.fn(() => ({ query, end, on: vi.fn() })) } }));

import { instrumentUniverse, latestPortfolio } from "./store";
import { closePool } from "../db/pool";
import { instruments as fixtures } from "./fixtures";

const env = { mode: process.env.DATA_MODE, url: process.env.DATABASE_URL };
afterEach(() => {
  for (const [k, v] of [["DATA_MODE", env.mode], ["DATABASE_URL", env.url]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  query.mockReset();
  return closePool().then(() => end.mockReset());
});

it("does not expose a stored fixture portfolio in db mode", async () => {
  process.env.DATA_MODE = "db"; process.env.DATABASE_URL = "postgresql://x";
  query.mockResolvedValue({ rows: [{ snapshot: { sample: true, asOf: "2025-08-08", weights: [], series: [{ benchmark: 1234 }] } }] });
  expect(await latestPortfolio()).toBeNull();
  expect(end).not.toHaveBeenCalled();
});

describe("instrumentUniverse", () => {
  it("returns fixture instruments in fixture mode without touching the database", async () => {
    process.env.DATA_MODE = "fixture";
    expect(await instrumentUniverse()).toBe(fixtures);
    expect(query).not.toHaveBeenCalled();
  });

  it("reads current membership in db mode and excludes benchmarks", async () => {
    process.env.DATA_MODE = "db"; process.env.DATABASE_URL = "postgresql://x";
    const rows = [{ ticker: "AAA", name: "A", sector: "S", tier: null, source: "guide" }];
    query.mockResolvedValue({ rows });
    expect(await instrumentUniverse()).toEqual(rows);
    expect(query.mock.calls[0][0]).toContain("m.list <> 'benchmark'");
    expect(end).not.toHaveBeenCalled();
  });

  it("is empty in db mode without DATABASE_URL", async () => {
    process.env.DATA_MODE = "db"; delete process.env.DATABASE_URL;
    expect(await instrumentUniverse()).toEqual([]);
  });
});
