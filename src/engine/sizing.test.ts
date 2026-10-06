import { describe, expect, it } from "vitest";
import { ACCOUNT_BUCKETS, CASH_BUCKETS, sizingCap, sizingPercent } from "./sizing";

describe("draft sizing matrix", () => {
  it("returns every published tier and account bucket at normal cash", () => {
    const rows = [
      [3, 5, 7, 7 / 3, 3.5, 10],
      [2, 4, 6, 2, 3, 8],
      [1.5, 3, 5, 5 / 3, 2.5, 7],
      [1, 2.5, 4, 4 / 3, 2, 5],
    ];
    for (const [index, bucket] of ACCOUNT_BUCKETS.entries()) {
      const [starter, standard, full, addThird, addHalf, cap] = rows[index];
      expect(sizingPercent("STARTER", bucket, "10_TO_30")).toBe(starter);
      expect(sizingPercent("STANDARD", bucket, "10_TO_30")).toBe(standard);
      expect(sizingPercent("FULL", bucket, "10_TO_30")).toBe(full);
      expect(sizingPercent("ADD_THIRD", bucket, "10_TO_30")).toBeCloseTo(addThird);
      expect(sizingPercent("ADD_HALF", bucket, "10_TO_30")).toBe(addHalf);
      expect(sizingCap(bucket)).toBe(cap);
    }
  });

  it("halves low-cash amounts, leaves high-cash amounts unchanged, and gives NONE zero", () => {
    for (const account of ACCOUNT_BUCKETS) {
      for (const tier of ["STARTER", "STANDARD", "FULL", "ADD_THIRD", "ADD_HALF"] as const) {
        expect(sizingPercent(tier, account, "UNDER_10")).toBeCloseTo(sizingPercent(tier, account, "10_TO_30") / 2);
        expect(sizingPercent(tier, account, "OVER_30")).toBe(sizingPercent(tier, account, "10_TO_30"));
      }
      for (const cash of CASH_BUCKETS) expect(sizingPercent("NONE", account, cash)).toBe(0);
    }
  });
});
