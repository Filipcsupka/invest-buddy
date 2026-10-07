import { afterEach, describe, expect, it } from "vitest";
import { ownerAllocation, ownerViewEnabled } from "./owner-allocation";

const previous = { mode: process.env.DATA_MODE, flag: process.env.OWNER_VIEW };
afterEach(() => {
  if (previous.mode === undefined) delete process.env.DATA_MODE; else process.env.DATA_MODE = previous.mode;
  if (previous.flag === undefined) delete process.env.OWNER_VIEW; else process.env.OWNER_VIEW = previous.flag;
});

describe("private owner allocation data", () => {
  it("stays off unless OWNER_VIEW is on", () => {
    delete process.env.OWNER_VIEW;
    expect(ownerViewEnabled()).toBe(false);
    process.env.OWNER_VIEW = "on";
    expect(ownerViewEnabled()).toBe(true);
  });
  it("uses the baseline cash and waits for missing executed-add history", async () => {
    process.env.DATA_MODE = "fixture";
    const data = await ownerAllocation();
    expect(data.sample).toBe(true);
    expect(data.baseline?.cashEur).toBe(600);
    expect(data.result?.suggestions.find((s) => s.symbol === "NVDA")).toMatchObject({ tier: "ADD_THIRD", amountEur: 0, reason: "ADD_HISTORY_UNKNOWN" });
    expect(data.result?.carriedCashEur).toBe(600);
  });
});
