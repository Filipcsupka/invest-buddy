import { expect, it } from "vitest";
import { caps, monthStart, withinBudget } from "./ai-budget";

it("stops before a call that would cross either monthly cap", () => {
  const cap = { tokens: 100, usd: 1 };
  expect(withinBudget({ tokens: 0, usd: 0 }, { tokens: 101, usd: 0.1 }, cap)).toBe(false);
  expect(withinBudget({ tokens: 90, usd: 0.9 }, { tokens: 1, usd: 0.2 }, cap)).toBe(false);
  expect(withinBudget({ tokens: 50, usd: 0.5 }, { tokens: 50, usd: 0.5 }, cap)).toBe(true);
  expect(caps({ ...process.env, AI_MONTHLY_TOKEN_CAP: "1", AI_MONTHLY_USD_CAP: "0.01" })).toEqual({ tokens: 1, usd: 0.01 });
  expect(monthStart(new Date("2026-10-06T20:00:00Z"))).toBe("2026-10-01");
});
