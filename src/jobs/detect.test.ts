import { expect, it } from "vitest";
import { detectSymbols, validDetectArgs } from "./detect";

it("deduplicates reasons and limits symbols in universe order", () => {
  const spike = { symbol: "NVDA", reason: "new fact", fact_key: "volume_ratio_20d", value: { ratio: 3 } };
  expect(detectSymbols([
    { symbol: "AMD", reason: "new document" }, spike, spike, { symbol: "NVDA", reason: "new document" },
  ], ["NVDA", "AMD"], 1)).toEqual({ symbols: ["NVDA"], reasons: { NVDA: ["volume 3.0x 20-day average", "new document"] } });
});

it("ignores the daily facts collect writes for every ticker", () => {
  const daily = ["NVDA", "AMD"].flatMap((symbol) => [
    { symbol, reason: "new fact", fact_key: "price_move_5d", value: { percent: 1.2 } },
    { symbol, reason: "new fact", fact_key: "volume_ratio_20d", value: { ratio: 1.1 } },
    { symbol, reason: "new fact", fact_key: "insider_net_buy_90d", value: { netShares: 10, netDollars: 100 } },
  ]);
  expect(detectSymbols(daily, ["NVDA", "AMD"])).toEqual({ symbols: [], reasons: {} });
});

it("flags a large price move, a volume spike and a new earnings 8-K", () => {
  const result = detectSymbols([
    { symbol: "NVDA", reason: "new fact", fact_key: "price_move_5d", value: { percent: -6.4 } },
    { symbol: "AMD", reason: "new fact", fact_key: "latest_earnings_8k", value: { date: "2026-10-01", documentId: 1 } },
    { symbol: "AVGO", reason: "new fact", fact_key: "price_move_5d", value: { percent: 4.9 } },
  ], ["NVDA", "AMD", "AVGO"]);
  expect(result.symbols).toEqual(["NVDA", "AMD"]);
  expect(result.reasons.NVDA).toEqual(["price move -6.4% over 5 days"]);
});

it("rejects an unknown flag even when --since is absent", () => {
  expect(validDetectArgs(["--bogus"])).toBe(false);
  expect(validDetectArgs(["--bogus", "--max", "3"])).toBe(false);
  expect(validDetectArgs(["--force-all", "--max", "3"])).toBe(true);
  expect(validDetectArgs(["--since", "2026-10-01"])).toBe(true);
  expect(validDetectArgs([])).toBe(true);
});
