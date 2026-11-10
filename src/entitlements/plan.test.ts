import { expect, it } from "vitest";
import { planFor } from "./plan";

const day = 86_400_000;
const start = new Date("2026-11-01T00:00:00Z");
const after = (days: number) => new Date(start.getTime() + days * day);

it.each([
  ["no row", { tier: "free", source: null, startsAt: null, endsAt: null }, "free"],
  ["expired trial (getEntitlement returns free)", { tier: "free", source: "manual", startsAt: start, endsAt: after(14) }, "free"],
  ["active 14-day manual grant", { tier: "plus", source: "manual", startsAt: start, endsAt: after(14) }, "trial"],
  ["manual Plus without end", { tier: "plus", source: "manual", startsAt: start, endsAt: null }, "plus"],
  ["manual Plus for 30 days", { tier: "plus", source: "manual", startsAt: start, endsAt: after(30) }, "plus"],
  ["Stripe Plus", { tier: "plus", source: "stripe", startsAt: start, endsAt: after(14) }, "plus"],
] as const)("%s resolves to %s", (_name, entitlement, plan) => {
  expect(planFor(entitlement).plan).toBe(plan);
});

it("keeps the end date only for a paid plan", () => {
  expect(planFor({ tier: "plus", source: "manual", startsAt: start, endsAt: after(14) }).endsAt).toEqual(after(14));
  expect(planFor({ tier: "free", source: "manual", startsAt: start, endsAt: after(14) }).endsAt).toBeNull();
});
