import { describe, expect, it, vi } from "vitest";
import { EodhdHttpError } from "../data-providers/eodhd/client";
import { parseNewsArgs, runNews, runSentiment } from "./eodhd-news";

const NOW = new Date();

describe("eodhd-news arguments and plans", () => {
  it("parses modes, tags and symbols", () => {
    expect(parseNewsArgs(["--mode", "sentiment", "--symbols", "aapl.us,btc-usd.cc", "--batch", "2"])).toMatchObject({ mode: "sentiment", symbols: ["AAPL.US", "BTC-USD.CC"], batch: 2 });
    expect(parseNewsArgs(["--tags", "Earnings,IPO", "--no-general"])).toMatchObject({ tags: ["earnings", "ipo"], general: false });
    expect(() => parseNewsArgs(["--symbols", "AAPL"])).toThrow();
    expect(() => parseNewsArgs(["--mode", "x"])).toThrow();
  });

  it("plans dry runs without requests", async () => {
    expect(await runNews(null, null, parseNewsArgs(["--dry-run"]), NOW)).toMatchObject({ dryRun: true, plannedRequests: 2, estimatedCalls: 10, requests: 0 });
    expect(await runSentiment(null, null, parseNewsArgs(["--dry-run", "--mode", "sentiment"]), ["A.US", "B.US"], NOW)).toMatchObject({ dryRun: true, estimatedCalls: 10 });
  });

  it("retries a failed sentiment batch by symbol and keeps the good symbol", async () => {
    const requests: string[][] = [];
    const db = { query: async (sql: string, params: unknown[] = []) => sql.includes("FROM unnest($1::text[]) AS s LEFT JOIN sentiment_fetches")
      ? { rows: (params[0] as string[]).map((symbol) => ({ symbol, last: null })) } : { rows: [], rowCount: 0 } };
    const api = { sentiments: async (symbols: string[]) => {
      requests.push(symbols);
      if (symbols.length > 1 || symbols[0] === "BAD.US") throw new EodhdHttpError(404, "sentiments");
      return { "GOOD.US": [] };
    }, getCallCosts: () => ({ sentiments: requests.length * 5 }) };
    const warning = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const result = await runSentiment(db as never, api as never, parseNewsArgs(["--mode", "sentiment", "--batch", "2"]), ["BAD.US", "GOOD.US"], NOW);
      expect(requests).toEqual([["BAD.US", "GOOD.US"], ["BAD.US"], ["GOOD.US"]]);
      expect(result).toMatchObject({ symbolsFetched: 1, failedSymbols: 1, failures: 1 });
      expect(warning.mock.calls.map((call) => String(call[0])).join("")).toContain("WARN BAD.US: HTTP 404");
      const denied = { ...api, sentiments: async () => { throw new EodhdHttpError(401, "sentiments"); } };
      await expect(runSentiment(db as never, denied as never, parseNewsArgs(["--mode", "sentiment"]), ["GOOD.US"], NOW)).rejects.toMatchObject({ status: 401 });
    } finally { warning.mockRestore(); }
  });
});
