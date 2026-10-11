import { describe, expect, it } from "vitest";
import { materialChange, type AlertFingerprint } from "./materiality";

const base: AlertFingerprint = { state: "WATCH", action: "WATCH", tier: "NONE", confirmedKeys: ["known"], close: 100,
  ratings: { company: "Good", entry: "Good", catalyst: "Good" }, relativeScore: 60, band: "blue",
  amountMinEur: 100, amountMaxEur: 200, promotionStatus: "none" };
const old = "2026-10-01T00:00:00Z";
const now = new Date("2026-10-11T00:00:00Z");

describe("research materiality", () => {
  it.each([
    [{ state: "START_READY" }, "state changed"], [{ action: "START_POSITION" }, "action changed"],
    [{ tier: "STARTER" }, "action changed"], [{ confirmedKeys: ["known", "new"] }, "confirmed finding"],
    [{ close: 110 }, "close changed"], [{ ratings: { company: "Strong", entry: "Good", catalyst: "Good" } }, "rating changed"],
    [{ relativeScore: 70 }, "relative score changed"], [{ band: "green" }, "band changed"],
    [{ amountMinEur: 150, amountMaxEur: 250 }, "amount changed"], [{ promotionStatus: "proposed" }, "promotion proposed"],
  ] as const)("sends for a material difference", (change, reason) => {
    expect(materialChange({ ...base, ...change } as AlertFingerprint, base, old, now)).toEqual({ send: true, reason });
  });
  it("ignores cash changes, restatements and subthreshold moves", () => {
    expect(materialChange({ ...base, confirmedKeys: ["known"], close: 109, amountMaxEur: 240 }, base, old, now).send).toBe(false);
  });
  it("enforces the cooldown except broken and reduce", () => {
    const recent = "2026-10-10T00:00:00Z";
    expect(materialChange({ ...base, state: "START_READY" }, base, recent, now).send).toBe(false);
    expect(materialChange({ ...base, state: "BROKEN" }, base, recent, now).send).toBe(true);
    expect(materialChange({ ...base, state: "REDUCE" }, base, recent, now).send).toBe(true);
    expect(materialChange({ ...base, state: "BROKEN", close: 120 }, { ...base, state: "BROKEN" }, recent, now).send).toBe(false);
  });
  it("does not send routine HOLD or DROPPED transitions", () => {
    expect(materialChange({ ...base, state: "HOLD" }, base, old, now).send).toBe(false);
    expect(materialChange({ ...base, state: "DROPPED" }, base, old, now).send).toBe(false);
  });
});
