import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UNIVERSE_EXCHANGES } from "./market";
import { instrumentRegion, REGION_BENCHMARKS, regionForExchange } from "./region";

describe("regions", () => {
  it("maps US to US and every other supported exchange to Europe", () => {
    expect(regionForExchange("US")).toBe("US");
    for (const exchange of UNIVERSE_EXCHANGES.filter((item) => item !== "US")) expect(regionForExchange(exchange)).toBe("Europe");
    expect([null, undefined, "", "NASDAQ"].map(regionForExchange)).toEqual(["US", "US", "US", "US"]);
  });
  it("prefers the membership exchange and falls back to the key suffix", () => {
    expect(instrumentRegion("SAP.XETRA")).toBe("Europe");
    expect(instrumentRegion("BRK.B")).toBe("US");
    expect(instrumentRegion("NVDA")).toBe("US");
    expect(instrumentRegion("ASML", "AS")).toBe("Europe");
    expect(instrumentRegion("SAP.XETRA", "US")).toBe("US");
  });
  it("keeps SPY for the US and seeds the European benchmark in migration 101", () => {
    expect(REGION_BENCHMARKS.US).toBe("SPY");
    const sql = readFileSync(join(__dirname, "../../migrations/101_regional_macro.sql"), "utf8");
    expect(sql).toContain(`'${REGION_BENCHMARKS.Europe}','benchmark'`);
    expect(instrumentRegion(REGION_BENCHMARKS.Europe)).toBe("Europe");
  });
});
