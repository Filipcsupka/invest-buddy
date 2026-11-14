import { marketsViewable } from "@/markets/gate";
import { canOpenFunds, canSeeStockData, type Viewer } from "@/viewer/viewer";

/**
 * What each plan opens, read from the real gates rather than written by hand, so /pricing cannot drift from the route rules.
 * "yes": open in production (EODHD_PRIVATE_USE on). "licence": open only once a vendor display licence exists (private use off,
 * VENDOR_DISPLAY_LICENSE on). "no": closed either way.
 */
export type PlanAccess = "yes" | "no" | "licence";
export type PricedPlan = "free" | "passive" | "plus";
export type AccessArea = "method" | "macro" | "markets" | "funds" | "stocks";

const PLAN_VIEWERS: Record<PricedPlan, Viewer> = {
  free: { tier: "free", preview: false, userId: "plan-free", plan: "free" },
  passive: { tier: "free", preview: false, userId: "plan-passive", plan: "passive" },
  plus: { tier: "paid", preview: false, userId: "plan-plus", plan: "plus" },
};
const PRODUCTION = { EODHD_PRIVATE_USE: "on", DATA_MODE: "db", MARKETS_VIEWS: "on" };
const LICENSED = { EODHD_PRIVATE_USE: "off", DATA_MODE: "db", MARKETS_VIEWS: "on", VENDOR_DISPLAY_LICENSE: "on" };

const GATES: Record<AccessArea, (viewer: Viewer, env: Record<string, string>) => boolean> = {
  method: () => true,
  macro: () => true,
  markets: (viewer, env) => marketsViewable(viewer, env, "indices"),
  funds: (viewer, env) => canOpenFunds(viewer, env),
  stocks: (viewer, env) => canSeeStockData(viewer, env),
};

export const ACCESS_AREAS: readonly AccessArea[] = ["method", "macro", "markets", "funds", "stocks"];
export const PRICED_PLANS: readonly PricedPlan[] = ["free", "passive", "plus"];

export function planAccess(area: AccessArea, plan: PricedPlan): PlanAccess {
  const viewer = PLAN_VIEWERS[plan];
  if (GATES[area](viewer, PRODUCTION)) return "yes";
  return GATES[area](viewer, LICENSED) ? "licence" : "no";
}
