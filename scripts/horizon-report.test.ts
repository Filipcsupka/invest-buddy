import { describe, expect, it } from "vitest";
import realCases from "../src/collectors/sources/fixtures/sec-real-collector-cases.json";
import { parseCompanyfacts } from "../src/collectors/sources/companyfacts";
import { yoySeries } from "../src/engine/horizon";
import { mergeRevenueConcepts } from "./horizon-report";

describe("horizon revenue history", () => {
  it("joins Alphabet's revenue tags into one quarterly series", () => {
    const rows = parseCompanyfacts(JSON.stringify(realCases.GOOGL), "GOOGL")
      .filter((row) => row.unit === "USD" && row.periodStart && row.periodEnd &&
        (Date.parse(row.periodEnd) - Date.parse(row.periodStart)) / 86400000 >= 80 &&
        (Date.parse(row.periodEnd) - Date.parse(row.periodStart)) / 86400000 <= 100)
      .map((row) => ({ ticker: row.ticker, concept: row.concept, period_end: row.periodEnd, value: String(row.value) }));
    const merged = mergeRevenueConcepts(rows).get("GOOGL")!;
    expect(merged.filter((row) => row.periodEnd === "2025-03-31")).toHaveLength(1);
    expect(yoySeries(merged, 4)).toHaveLength(4);
  });
});
