import { describe, expect, it } from "vitest";
import { disclosureWindows, parseCongressArgs, runCongress } from "./eodhd-congress";

const NOW = new Date("2026-11-06T06:25:00Z");

describe("eodhd-congress arguments and windows", () => {
  it("parses options and rejects bad ones", () => {
    expect(parseCongressArgs(["--from", "2024-01-01", "--max-calls", "50"])).toMatchObject({ from: "2024-01-01", maxCalls: 50 });
    expect(() => parseCongressArgs(["--from", "2011-12-31"])).toThrow();
    expect(() => parseCongressArgs(["--max-calls", "5"])).toThrow();
  });

  it("splits the range into seven-day windows ending today", () => {
    expect(disclosureWindows("2026-10-20", "2026-11-06")).toEqual([
      { from: "2026-10-20", to: "2026-10-26" }, { from: "2026-10-27", to: "2026-11-02" }, { from: "2026-11-03", to: "2026-11-06" }]);
  });

  it("plans a dry run without requests", async () => {
    expect(await runCongress(null, null, parseCongressArgs(["--dry-run"]), NOW)).toMatchObject({ dryRun: true, from: "2026-10-07", windows: 5, estimatedMinCalls: 50, requests: 0 });
  });
});
