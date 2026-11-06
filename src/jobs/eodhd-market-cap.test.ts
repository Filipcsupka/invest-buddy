import { expect, it, vi } from "vitest";
import type pg from "pg";
import { EodhdHttpError } from "../data-providers/eodhd/client";

const subjects = vi.hoisted(() => ({ rows: [] as { ticker: string; vendorSymbol: string; attemptedAt: string | null; latestWeek: string | null }[] }));
vi.mock("../db/market-cap", async (original) => ({ ...(await original<typeof import("../db/market-cap")>()), marketCapSubjects: async () => subjects.rows }));
const { marketCapDue, parseMarketCapArgs, runMarketCap } = await import("./eodhd-market-cap");

const recordingDb = () => {
  const params: unknown[][] = [];
  return { params, db: { query: async (_text: string, values: unknown[]) => { params.push(values); return { rows: [] }; } } as unknown as Pick<pg.Pool, "query"> };
};

it("parses bounded options", () => {
  expect(parseMarketCapArgs([])).toEqual({ dryRun: false, maxSymbols: 80, staleDays: 28 });
  expect(parseMarketCapArgs(["--only", "aapl,msft", "--max-symbols", "2", "--stale-days", "7", "--dry-run"])).toEqual({ dryRun: true, maxSymbols: 2, staleDays: 7, only: ["AAPL", "MSFT"] });
  expect(() => parseMarketCapArgs(["--max-symbols", "0"])).toThrow();
  expect(() => parseMarketCapArgs(["--stale-days", "x"])).toThrow();
});

it("is due when never attempted or attempted at least the stale window ago", () => {
  expect(marketCapDue({ attemptedAt: null }, "2026-11-08", 28)).toBe(true);
  expect(marketCapDue({ attemptedAt: "2026-10-11T01:40:00Z" }, "2026-11-08", 28)).toBe(true);
  expect(marketCapDue({ attemptedAt: "2026-10-12T01:40:00Z" }, "2026-11-08", 28)).toBe(false);
});

it("refreshes due names from the latest stored week, caps the batch and logs calls", async () => {
  subjects.rows = [
    { ticker: "AAPL", vendorSymbol: "AAPL.US", attemptedAt: null, latestWeek: null },
    { ticker: "MSFT", vendorSymbol: "MSFT.US", attemptedAt: "2026-09-01T00:00:00Z", latestWeek: "2026-08-28" },
    { ticker: "NVDA", vendorSymbol: "NVDA.US", attemptedAt: "2026-11-07T00:00:00Z", latestWeek: "2026-11-06" },
  ];
  let calls = 0;
  const requests: { symbol: string; from?: string; to?: string }[] = [];
  const api = { historicalMarketCap: async (symbol: string, options: { from?: string; to?: string }) => {
    calls += 10; requests.push({ symbol, ...options });
    return { "0": { date: "2026-10-30", value: 4e12 } };
  }, getCallCosts: () => ({ "historical-market-cap": calls }) };
  const { db, params } = recordingDb();
  const result = await runMarketCap(db, api, parseMarketCapArgs(["--max-symbols", "1"]), "2026-11-08");
  expect(result).toMatchObject({ subjects: 3, due: 2, batch: 1, estimatedCalls: 10, refreshed: 1, points: 1, calls: 10, failures: 0 });
  expect(requests).toEqual([{ symbol: "AAPL.US", to: "2026-11-08" }]);
  expect(params.at(-1)).toEqual(["eodhd-market-cap", 10]);
  requests.length = 0;
  await runMarketCap(recordingDb().db, api, parseMarketCapArgs(["--max-symbols", "5"]), "2026-11-08");
  expect(requests[1]).toEqual({ symbol: "MSFT.US", from: "2026-08-28", to: "2026-11-08" });
});

it("records a failed attempt, stops on an access error and makes no request on a dry run", async () => {
  subjects.rows = [{ ticker: "AAPL", vendorSymbol: "AAPL.US", attemptedAt: null, latestWeek: null }, { ticker: "MSFT", vendorSymbol: "MSFT.US", attemptedAt: null, latestWeek: null }];
  const denied = { historicalMarketCap: async () => { throw new EodhdHttpError(403, "historical-market-cap"); }, getCallCosts: () => ({ "historical-market-cap": 10 }) };
  const { db, params } = recordingDb();
  expect(await runMarketCap(db, denied, parseMarketCapArgs([]), "2026-11-08")).toMatchObject({ refreshed: 0, failures: 1, failedTickers: "AAPL" });
  expect(params).toContainEqual(["AAPL.US", "AAPL", null, "failed"]);
  const dry = recordingDb();
  expect(await runMarketCap(dry.db, null, parseMarketCapArgs(["--dry-run"]), "2026-11-08")).toMatchObject({ due: 2, estimatedCalls: 20, calls: 0 });
  expect(dry.params).toEqual([]);
});
