import { flags, type Flags } from "@/config/flags";
import { TIER_LIMITS, tierEntry, type LimitKey, type TierId } from "@/config/tiers";

export type Tier = "free" | "paid" | "admin";
export type Viewer = { tier: Tier; preview: boolean };

/** Request header the proxy sets for `?view=free`. */
export const PREVIEW_HEADER = "x-tier-preview";

/**
 * The viewer before any preview. AUTH off: everyone is admin (today's open site).
 * AUTH on: no session or entitlement lookup exists yet (W29, W30), so others are `free` when PAYWALL enforces tiers
 * and `paid` when it does not (soft launch, nothing locked). The owner account becomes `admin` with W29.
 */
export function baseViewer(f: Pick<Flags, "AUTH" | "PAYWALL"> = flags()): Viewer {
  if (!f.AUTH) return { tier: "admin", preview: false };
  return { tier: f.PAYWALL ? "free" : "paid", preview: false };
}

/** `?view=free` turns an admin request into a free render. It is ignored for every other viewer. */
export function resolveViewer(f: Pick<Flags, "AUTH" | "PAYWALL"> = flags(), view?: string | null): Viewer {
  const base = baseViewer(f);
  return base.tier === "admin" && view === "free" ? { tier: "free", preview: true } : base;
}

/** False only for a free viewer on a paid lock segment. Depth-limited segments stay visible; use limitFor for the depth. */
export function canSee(viewer: Viewer, id: TierId): boolean {
  const entry = tierEntry(id);
  if (entry.tier === "free" || viewer.tier !== "free") return true;
  return entry.mode !== "lock";
}

/** The depth limit for this viewer, or null for no limit. Admin and paid use the paid column. */
export function limitFor(viewer: Viewer, key: LimitKey): number | null {
  return TIER_LIMITS[viewer.tier === "free" ? "free" : "paid"][key];
}
