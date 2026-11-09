import { beforeEach, expect, it, vi } from "vitest";

const { cacheRows, query, listIdeas, symbolReviewDates, fundamentalsHistory } = vi.hoisted(() => ({
  cacheRows: new Map<string, unknown>(),
  query: vi.fn(),
  listIdeas: vi.fn(),
  symbolReviewDates: vi.fn(),
  fundamentalsHistory: vi.fn(),
}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>, key: string[]) => async (...args: unknown[]) => {
    const cacheKey = JSON.stringify([key, args]);
    if (!cacheRows.has(cacheKey)) cacheRows.set(cacheKey, await fn(...args));
    return cacheRows.get(cacheKey);
  },
}));

vi.mock("../db/pool", () => ({ getPool: () => ({ query }) }));
vi.mock("../db/ideas", () => ({ listIdeas }));
vi.mock("../db/extraction-runs", () => ({ symbolReviewDates }));
vi.mock("../db/history", () => ({ fundamentalsHistory }));
vi.mock("./eodhd-private-use", () => ({ eodhdPrivateUse: () => false }));

import { companyIdea, companyReview } from "./ideas-store";
import { latestShareCounts, storedInterestFacts, storedShareCounts } from "./flag-facts";

beforeEach(() => {
  cacheRows.clear();
  query.mockReset();
  listIdeas.mockReset();
  symbolReviewDates.mockReset();
  fundamentalsHistory.mockReset();
  delete process.env.DATA_MODE;
  process.env.DATABASE_URL = "postgres://test";
});

it("keys company ideas and review dates by normalized ticker", async () => {
  listIdeas.mockResolvedValue([{ symbol: "AAPL", action: "WATCH" }, { symbol: "MSFT", action: "HOLD" }]);
  symbolReviewDates.mockImplementation(async (_db, ticker: string) => ({ lastReviewed: ticker, nextDue: ticker }));
  expect((await companyIdea("aapl"))?.idea.symbol).toBe("AAPL");
  expect(await companyIdea("MSFT")).toBeNull();
  expect((await companyIdea("AAPL"))?.idea.symbol).toBe("AAPL");
  expect(await companyReview("aapl")).toEqual({ lastReviewed: "AAPL", nextDue: "AAPL" });
  expect(await companyReview("MSFT")).toEqual({ lastReviewed: "MSFT", nextDue: "MSFT" });
  await companyReview("AAPL");
  expect(symbolReviewDates).toHaveBeenCalledTimes(2);
  expect([...cacheRows.keys()].filter((key) => key.includes("company-idea"))).toHaveLength(2);
});

it("keeps interest and share facts separate per ticker", async () => {
  fundamentalsHistory.mockImplementation(async (_db, ticker: string, concept: string) => ({ rows: concept === "EntityCommonStockSharesOutstanding" ? [{ periodEnd: ticker, value: ticker === "AAPL" ? 100 : 200 }] : [] }));
  expect(await storedShareCounts("aapl")).toEqual([{ periodEnd: "AAPL", value: 100 }]);
  expect(await storedShareCounts("MSFT")).toEqual([{ periodEnd: "MSFT", value: 200 }]);
  await storedShareCounts("AAPL");
  expect(fundamentalsHistory.mock.calls.filter((call) => call[2] === "EntityCommonStockSharesOutstanding")).toHaveLength(2);
  await storedInterestFacts("AAPL");
  await storedInterestFacts("MSFT");
  await storedInterestFacts("aapl");
  expect([...cacheRows.keys()].filter((key) => key.includes("stored-interest-facts"))).toHaveLength(2);
});

it("uses one scanner share query for the same ticker set in any order", async () => {
  query.mockImplementation(async (_sql, [tickers]: [string[]]) => ({ rows: tickers.map((ticker) => ({ ticker, value: ticker === "AAPL" ? 100 : 200 })) }));
  expect(await latestShareCounts(["MSFT", "AAPL"])).toEqual({ AAPL: 100, MSFT: 200 });
  expect(await latestShareCounts(["aapl", "MSFT", "AAPL"])).toEqual({ AAPL: 100, MSFT: 200 });
  expect(query).toHaveBeenCalledTimes(1);
  expect(query.mock.calls[0][1][0]).toEqual(["AAPL", "MSFT"]);
});
