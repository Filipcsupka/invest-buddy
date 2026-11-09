import { afterEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
const end = vi.fn(async () => undefined);
vi.mock("pg", () => ({ default: { Pool: vi.fn(() => ({ query, end, on: vi.fn() })) } }));

import { instrumentForTicker, instrumentUniverse, latestPortfolio, latestScoreSummaries, latestScores, scoreForTicker } from "./store";
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
    expect(query.mock.calls[0][0]).toContain("m.list NOT IN ('benchmark', 'extended')");
    expect(end).not.toHaveBeenCalled();
  });

  it("hides the collect-only list from pages and the sitemap (instrumentUniverse and latestScores)", async () => {
    process.env.DATA_MODE = "db"; process.env.DATABASE_URL = "postgresql://x";
    query.mockResolvedValue({ rows: [] });
    await instrumentUniverse();
    await latestScores();
    for (const call of query.mock.calls) expect(call[0]).toContain("m.list NOT IN ('benchmark', 'extended')");
    expect(query.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("is empty in db mode without DATABASE_URL", async () => {
    process.env.DATA_MODE = "db"; delete process.env.DATABASE_URL;
    expect(await instrumentUniverse()).toEqual([]);
  });
});

it("loads bar-free score summaries for listings and one full chart for a company", async () => {
  process.env.DATA_MODE = "fixture";
  const summaries = await latestScoreSummaries();
  expect(summaries.rows).toHaveLength(fixtures.length);
  expect(summaries.rows.every((row) => row.result.inputs.bars.length === 0)).toBe(true);
  expect(await instrumentForTicker(fixtures[0].ticker)).toEqual(fixtures[0]);
  const company = await scoreForTicker(fixtures[0].ticker);
  expect(company.rows?.result.inputs.bars).toHaveLength(220);
  expect(company.rows?.result.inputs.bars).toEqual((await latestScores()).rows[0].result.inputs.bars);
  expect(company.rows?.result.total).toBe(summaries.rows[0].result.total);
  expect(query).not.toHaveBeenCalled();
});

it("uses parameterized one-ticker reads and drops bars in the summary SQL", async () => {
  process.env.DATA_MODE = "db"; process.env.DATABASE_URL = "postgresql://x";
  query.mockResolvedValue({ rows: [] });
  expect(await instrumentForTicker("nvda")).toBeNull();
  expect(query.mock.calls[0][1]).toEqual(["NVDA"]);
  expect(query.mock.calls[0][0]).toContain("i.ticker=$1");
  await scoreForTicker("nvda");
  expect(query.mock.calls[1][1]).toEqual(["NVDA"]);
  expect(query.mock.calls[1][0]).toContain("ORDER BY s.as_of DESC LIMIT 1");
  await latestScoreSummaries();
  expect(query.mock.calls[2][0]).toContain("'{inputs,bars}','[]'::jsonb");
});
