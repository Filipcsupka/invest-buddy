import { flags, type Flags } from "@/config/flags";
import { TIER_LIMITS, tierEntry, type LimitKey, type TierId } from "@/config/tiers";

export type Tier = "free" | "paid" | "admin";
/**
 * `owner` is true only for a session whose user id is listed in OWNER_USER_IDS (see `isOwnerUser`).
 * `userId`, `plan` and `planEndsAt` are set for a signed-in customer.
 */
export type Viewer = { tier: Tier; preview: boolean; owner?: boolean; userId?: string | null; plan?: "free" | "plus" | "trial"; planEndsAt?: Date | null };

/** Request header the proxy sets for `?view=free`. */
export const PREVIEW_HEADER = "x-tier-preview";

/**
 * Non-owner fallback. PAYWALL off keeps the soft launch open without granting owner access.
 */
export function baseViewer(f: Pick<Flags, "AUTH" | "PAYWALL"> = flags()): Viewer {
  return { tier: f.PAYWALL ? "free" : "paid", preview: false };
}

/** The one owner check. Owner viewers come only from `viewerFromHeaders`, never from a cookie hint. */
export function isOwner(viewer: Pick<Viewer, "owner">): boolean {
  return viewer.owner === true;
}

/** `?view=free` turns an admin request into a free render. It is ignored for every other viewer. */
export function resolveViewer(f: Pick<Flags, "AUTH" | "PAYWALL"> = flags(), view?: string | null, owner = false): Viewer {
  if (owner) return view === "free" ? { tier: "free", preview: true, owner: true, userId: null } : { tier: "admin", preview: false, owner: true, userId: null };
  return baseViewer(f);
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

/** Null when the viewer may use the feature, otherwise a private 401 (signed out) or 403 (signed in, upgrade needed). */
export function requireFeature(viewer: Viewer, id: TierId): Response | null {
  if (canSee(viewer, id)) return null;
  return Response.json({ error: viewer.userId ? "Upgrade required" : "Sign in required" }, {
    status: viewer.userId ? 403 : 401,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
}

/**
 * Vendor-derived data (scores, prices, EPS) for this viewer. The owner always gets it. A customer with an active Plus
 * entitlement (paid or trial, not the PAYWALL-off soft tier) gets it too. Everyone else needs VENDOR_DISPLAY_LICENSE=on
 * while EODHD_PRIVATE_USE is off.
 */
export function canUseVendorData(viewer: Viewer, env: Record<string, string | undefined> = process.env): boolean {
  if (isOwner(viewer)) return true;
  if (viewer.userId && (viewer.plan === "plus" || viewer.plan === "trial")) return true;
  return env.EODHD_PRIVATE_USE !== "on" && env.VENDOR_DISPLAY_LICENSE === "on";
}
