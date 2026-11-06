import { expect, it } from "vitest";
import { eodhdPrivateUse } from "./eodhd-private-use";

it("enables private EODHD reads only for the exact on value", () => {
  expect(eodhdPrivateUse({})).toBe(false);
  expect(eodhdPrivateUse({ EODHD_PRIVATE_USE: "off" })).toBe(false);
  expect(eodhdPrivateUse({ EODHD_PRIVATE_USE: "ON" })).toBe(false);
  expect(eodhdPrivateUse({ EODHD_PRIVATE_USE: "on" })).toBe(true);
});
