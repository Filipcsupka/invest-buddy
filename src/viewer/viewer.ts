import { flags, type Flags } from "@/config/flags";
import { TIER_LIMITS, tierEntry, type LimitKey, type TierId } from "@/config/tiers";

export type Tier = "free" | "paid" | "admin";
/**
 * `owner` is true only for a session whose user id is listed in OWNER_USER_IDS (see `isOwnerUser`).
 * `userId`, `plan` and `planEndsAt` are set for a signed-in customer.
 */
export type Viewer = { tier: Tier; preview: boolean; owner?: boolean; userId?: string | null; plan?: "free" | "passive" | "plus" | "trial"; planEndsAt?: Date | null };

/**
 * The three investor paths (docs/paywall-segments.md). `active` is the Plus plan and the trial: stocks plus everything Passive has.
 * `passive` is the Passive plan: ETF ratings, fund pages, indices, economy and the calendar. `overview` is a free account or a visitor.
 * The owner is outside the paths and sees everything.
 */
export type InvestorPath = "active" | "passive" | "overview";

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

/** A signed-in customer with an active Plus entitlement, paid or trial. */
export function hasActivePlan(viewer: Pick<Viewer, "userId" | "plan">): boolean {
  return Boolean(viewer.userId && (viewer.plan === "plus" || viewer.plan === "trial"));
}

/** A signed-in customer with an active Passive entitlement. */
export function hasPassivePlan(viewer: Pick<Viewer, "userId" | "plan">): boolean {
  return Boolean(viewer.userId && viewer.plan === "passive");
}

/** The path this viewer's plan opens, or null for the owner (who sees every path). */
export function investorPath(viewer: Viewer): InvestorPath | null {
  if (isOwner(viewer) && !viewer.preview) return null;
  if (viewer.preview) return "overview";
  if (hasActivePlan(viewer)) return "active";
  if (hasPassivePlan(viewer)) return "passive";
  return "overview";
}

/** A vendor display licence is in place and private use is off: vendor data may be shown to everyone. */
export function vendorLicensed(env: Record<string, string | undefined> = process.env): boolean {
  return env.EODHD_PRIVATE_USE !== "on" && env.VENDOR_DISPLAY_LICENSE === "on";
}

/**
 * Vendor-derived stock data (scores, prices, EPS) for this viewer. The owner always gets it. A customer with an active Plus
 * entitlement (paid or trial, not the PAYWALL-off soft tier) gets it too. A Passive customer does not. Everyone else needs VENDOR_DISPLAY_LICENSE=on
 * while EODHD_PRIVATE_USE is off.
 */
export function canUseVendorData(viewer: Viewer, env: Record<string, string | undefined> = process.env): boolean {
  if (isOwner(viewer)) return true;
  if (hasActivePlan(viewer)) return true;
  return vendorLicensed(env);
}

/**
 * Stock routes need a stock permission whenever they can show stored data: always outside fixture mode, and in fixture mode while
 * EODHD_PRIVATE_USE is on. Fixture mode with private use off shows only the sample universe, which is open to every visitor.
 */
export function stockRoutesGated(env: Record<string, string | undefined> = process.env): boolean {
  return env.EODHD_PRIVATE_USE === "on" || env.DATA_MODE !== "fixture";
}

/**
 * May this viewer see stock data on the dashboard and the stock routes? Whatever EODHD_PRIVATE_USE says, stored stock data needs
 * canUseVendorData: the owner, an Active plan, or a vendor display licence. The owner's free preview counts as a visitor.
 */
export function canSeeStockData(viewer: Viewer, env: Record<string, string | undefined> = process.env): boolean {
  if (!stockRoutesGated(env)) return true;
  return !viewer.preview && canUseVendorData(viewer, env);
}

/**
 * ETF ratings, the ETF catalog and fund pages: the owner, Active customers and Passive customers, never a preview. A free account and
 * a visitor do not get them even with a vendor licence; the ETF screen is a paid path.
 */
export function canOpenFunds(viewer: Viewer, env: Record<string, string | undefined> = process.env): boolean {
  return !viewer.preview && canUseFundData(viewer, env) && (isOwner(viewer) || hasActivePlan(viewer) || hasPassivePlan(viewer));
}

/**
 * Vendor-derived fund and market data (ETF ratings, fund pages, indices, economy, calendar). Everyone with stock access has it, and
 * so does a Passive customer. It never opens stock routes: those keep using canUseVendorData.
 */
export function canUseFundData(viewer: Viewer, env: Record<string, string | undefined> = process.env): boolean {
  return canUseVendorData(viewer, env) || hasPassivePlan(viewer);
}
