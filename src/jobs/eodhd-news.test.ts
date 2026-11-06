import { describe, expect, it } from "vitest";
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
});
