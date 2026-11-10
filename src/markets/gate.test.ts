import { expect, it } from "vitest";
import { marketsViewable } from "./gate";

it("requires the markets flag and an owner viewer", () => {
  const owner = { owner: true };
  expect(marketsViewable(owner, { MARKETS_VIEWS: "off" })).toBe(false);
  expect(marketsViewable({}, { MARKETS_VIEWS: "on" })).toBe(false);
  expect(marketsViewable({ owner: false }, { MARKETS_VIEWS: "on" })).toBe(false);
  expect(marketsViewable(owner, { MARKETS_VIEWS: "on" })).toBe(true);
});
