import { describe, expect, it } from "vitest";
import type { InsiderEvent } from "@/db/insiders";
import { TIER_LIMITS } from "@/config/tiers";
import { withinDays } from "./depth";

const event = (transactionDate: string): InsiderEvent => ({
  accession: transactionDate, lineNo: 1, ticker: "NVDA", ownerName: "A", reportingOwners: [], isDirector: null, isOfficer: null, isTenPercentOwner: null, isOther: null,
  transactionDate, filedAt: transactionDate, code: "P", shares: 1, value: 1, secUrl: null,
});
const now = new Date("2026-10-16T12:00:00Z");

describe("insider depth", () => {
  const events = [event("2026-10-01"), event("2026-04-20"), event("2026-04-10"), event("2025-01-01")];
  it("keeps only the free window", () => {
    expect(TIER_LIMITS.free.insiderDays).toBe(180);
    expect(withinDays(events, 180, now).map((e) => e.transactionDate)).toEqual(["2026-10-01", "2026-04-20"]);
  });
  it("keeps everything without a limit", () => {
    expect(withinDays(events, null, now)).toHaveLength(4);
  });
});
