import { expect, it } from "vitest";
import { DEFAULT_PRICE_VARIANT, PLANNED, PRICE_VARIANTS, resolveVariant, yearlyTotalEur } from "./plans";

it("marks every price as planned", () => expect(PLANNED).toBe(true));
it("computes the yearly total from the monthly price", () => {
  expect(yearlyTotalEur("a")).toBe(118.8);
  expect(yearlyTotalEur("b")).toBe(168);
  expect(Object.keys(PRICE_VARIANTS).sort()).toEqual(["a", "b"]);
});
it("resolves variants and falls back to the default", () => {
  expect(resolveVariant("b")).toBe("b");
  expect(resolveVariant(["b", "a"])).toBe("b");
  for (const bad of [undefined, "", "c", "A", ["x"]]) expect(resolveVariant(bad)).toBe(DEFAULT_PRICE_VARIANT);
});
