import { afterEach, expect, it } from "vitest";
import { recordSignalLabel } from "./record-signal";

const originalAdvice = process.env.ADVICE_OUTPUT;
afterEach(() => { if (originalAdvice === undefined) delete process.env.ADVICE_OUTPUT; else process.env.ADVICE_OUTPUT = originalAdvice; });

it("localizes score and judge record codes", () => {
  process.env.ADVICE_OUTPUT = "on";
  expect(recordSignalLabel("sk", { tier: "BROKEN", state: "Criteria broken" })).toBe("Kritériá porušené");
  expect(recordSignalLabel("sk", { tier: "ADD_THIRD", state: "ADD" })).toBe("Prikúpiť 1/3");
  expect(recordSignalLabel("en", { tier: "SETUP", state: "Setup met (>=18)" })).toBe("Setup · Setup met ≥18");
});

it("shows rule states without action or tier labels when advice is off", () => {
  process.env.ADVICE_OUTPUT = "off";
  expect(recordSignalLabel("en", { tier: "ADD_THIRD", state: "ADD" })).toBe("Recorded rule event");
  expect(recordSignalLabel("sk", { tier: "STARTER", state: "START_POSITION" })).toBe("Zaznamenaná udalosť pravidiel");
  expect(recordSignalLabel("en", { tier: "SETUP", state: "Setup met (>=18)" })).toBe("Setup met ≥18");
});
