import { describe, expect, it } from "vitest";
import { parseEconomyArgs, runEconomy, ustYears } from "./eodhd-economy";

const NOW = new Date("2026-11-06T05:10:00Z");

describe("eodhd-economy arguments and plan", () => {
  it("parses parts, lists and bounds", () => {
    expect(parseEconomyArgs(["--part", "ust", "--max-calls", "20", "--countries", "us,de"])).toMatchObject({ parts: ["ust"], maxCalls: 20, countries: ["US", "DE"] });
    expect(() => parseEconomyArgs(["--part", "x"])).toThrow();
    expect(() => parseEconomyArgs(["--countries", "USA"])).toThrow();
    expect(() => parseEconomyArgs(["--indicator-countries", "US"])).toThrow();
    expect(() => parseEconomyArgs(["--max-calls", "0"])).toThrow();
  });

  it("reads the previous Treasury year only in the first week of January", () => {
    expect(ustYears("2027-01-03")).toEqual([2026, 2027]);
    expect(ustYears("2026-11-06")).toEqual([2026]);
  });

  it("plans a dry run without a database, a key or any request", async () => {
    const result = await runEconomy(null, null, parseEconomyArgs(["--dry-run"]), NOW);
    expect(result).toMatchObject({ dryRun: true, plannedRequests: 8 + 4 + 40, estimatedCalls: 8 + 4 + 400, requests: 0, calls: 0 });
    await expect(runEconomy(null, null, parseEconomyArgs([]), NOW)).rejects.toThrow(/DATABASE_URL/);
  });
});
