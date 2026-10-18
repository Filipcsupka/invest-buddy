import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseFlexPortfolio } from "./model";
import { holdingFacts, recycledCashLedger } from "./recycled-cash";

const fixture = new URL("./fixtures/flex-trades.xml", import.meta.url);

describe("executed Flex trades and recycled cash", () => {
  it("reads executions, converts proceeds and fees, and deduplicates repeated trade IDs", async () => {
    const portfolio = parseFlexPortfolio(await readFile(fixture, "utf8"));
    expect(portfolio.trades).toEqual([
      { date: "2026-09-01", symbol: "EVENT", quantity: -2, proceedsEur: 360, feesEur: 0.9 },
      { date: "2026-09-15", symbol: "LONG", quantity: 2, proceedsEur: -200, feesEur: 0.5 },
    ]);
    expect(holdingFacts("LONG", 2, 500, 400, portfolio.asOf, portfolio.trades)).toEqual({ gainFromCostPercent: 25, daysHeld: 15 });
  });

  it("marks net sale proceeds and subtracts later purchases, capped by broker cash", () => {
    const trades = [
      { date: "2026-09-01", symbol: "B", quantity: -2, proceedsEur: 360, feesEur: 0.9 },
      { date: "2026-09-15", symbol: "A", quantity: 2, proceedsEur: -200, feesEur: 0.5 },
    ];
    expect(recycledCashLedger(trades, 600)).toEqual({ sales: [{ date: "2026-09-01", symbol: "B", netProceedsEur: 359.1, remainingEur: 158.6 }], availableEur: 158.6 });
    expect(recycledCashLedger(trades, 100).availableEur).toBe(100);
  });
});
