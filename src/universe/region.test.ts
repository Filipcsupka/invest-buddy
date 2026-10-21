import { describe, expect, it } from "vitest";
import { UNIVERSE_EXCHANGES } from "./market";
import { instrumentRegion, REGION_BENCHMARKS, regionForExchange } from "./region";

describe("regions", () => {
  it("maps US to US and every other supported exchange to Europe", () => {
    expect(regionForExchange("US")).toBe("US");
    for (const exchange of UNIVERSE_EXCHANGES.filter((item) => item !== "US")) expect(regionForExchange(exchange)).toBe("Europe");
    expect([null, undefined, "", "NASDAQ"].map(regionForExchange)).toEqual(["US", "US", "US", "US"]);
  });
  it("lets a non-US key suffix win over the default 'US' membership exchange", () => {
    expect(instrumentRegion("SAP.XETRA")).toBe("Europe");
    // universe_membership.exchange defaults to 'US', so a name approved before symbols:sync must still resolve from its suffix.
    expect(instrumentRegion("SAP.XETRA", "US")).toBe("Europe");
    expect(instrumentRegion("BRK.B")).toBe("US");
    expect(instrumentRegion("BRK.B", "US")).toBe("US");
    expect(instrumentRegion("NVDA")).toBe("US");
    expect(instrumentRegion("NVDA", "US")).toBe("US");
  });
  it("falls back to a real non-US listing exchange for a bare key", () => {
    expect(instrumentRegion("ASML", "AS")).toBe("Europe");
    expect(instrumentRegion("ASML", "NASDAQ")).toBe("US");
  });
  it("keeps SPY for the US and a European key for the European benchmark", () => {
    // Migration 101 seeding is checked against Postgres in src/jobs/macro-regions.test.ts.
    expect(REGION_BENCHMARKS.US).toBe("SPY");
    expect(instrumentRegion(REGION_BENCHMARKS.Europe)).toBe("Europe");
  });
});
