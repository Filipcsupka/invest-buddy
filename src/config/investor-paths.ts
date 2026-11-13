import type { InvestorPath } from "@/viewer/viewer";

/**
 * The three investor paths (owner request 2026-11-13, docs/paywall-segments.md). Pure data: which plan each path is, what it
 * includes, where it leads. Access itself is decided by the server gates (canUseVendorData, canUseFundData, marketsViewable); the
 * dashboard and the pricing page only read the result.
 */
export const PATH_ORDER = ["active", "passive", "overview"] as const satisfies readonly InvestorPath[];

/** Stored plan behind each path. `plus` is the existing Plus plan, shown as the Active investor path. */
export const PATH_PLAN = { active: "plus", passive: "passive", overview: "free" } as const satisfies Record<InvestorPath, string>;

/** Active includes Passive and the market overview; Passive includes the market overview. */
export const PATH_INCLUDES: Record<InvestorPath, readonly InvestorPath[]> = {
  active: ["active", "passive", "overview"],
  passive: ["passive", "overview"],
  overview: ["overview"],
};

/** Area each path opens. The market overview leads to the indices when the viewer may open them, otherwise to the method. */
export const PATH_HREF = { active: "/stocks", passive: "/etf", overview: "/indices", overviewFallback: "/methodology" } as const;

/** Each path's plan card on /pricing (element ids on that page). */
export const PRICING_ANCHOR: Record<InvestorPath, string> = { active: "plus", passive: "passive", overview: "free" };

export type PathCardState = "current" | "open" | "locked";
/** `included`: the viewer's own plan covers this path (as opposed to a path that is open to everyone, for example without private use). */
export type PathCard = { id: InvestorPath; state: PathCardState; href: string; included: boolean };

/**
 * One card per path. `current` is the signed-in viewer's own path, `open` a path the viewer can open, `locked` one it cannot; a
 * locked card leads to that plan on the pricing page. `path` is null for the owner, who sees no cards (see investorPath).
 */
export function pathCards(input: { path: InvestorPath; signedIn: boolean; access: Record<InvestorPath, boolean>; overviewHref: string }): PathCard[] {
  return PATH_ORDER.map((id) => {
    const open = input.access[id];
    const state: PathCardState = !open ? "locked" : input.signedIn && input.path === id ? "current" : "open";
    const href = !open ? `/pricing#${PRICING_ANCHOR[id]}` : id === "overview" ? input.overviewHref : PATH_HREF[id];
    return { id, state, href, included: PATH_INCLUDES[input.path].includes(id) };
  });
}
