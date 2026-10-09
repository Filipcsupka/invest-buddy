import { expect, it } from "vitest";
import { recordSignalLabel } from "./record-signal";

it("localizes score and judge record codes", () => {
  expect(recordSignalLabel("sk", { tier: "BROKEN", state: "Criteria broken" })).toBe("Porušené kritériá · Kritériá porušené");
  expect(recordSignalLabel("sk", { tier: "ADD_THIRD", state: "ADD" })).toBe("Prikúpiť 1/3 · Prikúpiť");
  expect(recordSignalLabel("en", { tier: "SETUP", state: "Setup met (>=18)" })).toBe("Setup · Setup met ≥18");
});
