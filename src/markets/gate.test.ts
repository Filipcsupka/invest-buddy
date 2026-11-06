import { expect, it } from "vitest";
import { marketsViewable } from "./gate";

it("requires the markets flag and the owner research password", () => {
  const password = "private-test-password";
  const auth = `Basic ${Buffer.from(`owner:${password}`).toString("base64")}`;
  expect(marketsViewable(auth, { MARKETS_VIEWS: "off", OWNER_RESEARCH_PASSWORD: password })).toBe(false);
  expect(marketsViewable(null, { MARKETS_VIEWS: "on", OWNER_RESEARCH_PASSWORD: password })).toBe(false);
  expect(marketsViewable(auth, { MARKETS_VIEWS: "on" })).toBe(false);
  expect(marketsViewable(auth, { MARKETS_VIEWS: "on", OWNER_RESEARCH_PASSWORD: password })).toBe(true);
});
