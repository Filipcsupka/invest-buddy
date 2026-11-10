import { headers } from "next/headers";
import { cache } from "react";
import { flags } from "@/config/flags";
import { ownerAuthorized } from "@/app/[locale]/owner/auth";
import { hasCustomerCookie } from "@/auth/cookie";
import { customerAuth } from "@/auth/server";
import { getPool } from "@/db/pool";
import { customerPlan } from "@/entitlements/plan";
import { PREVIEW_HEADER, resolveViewer, type Viewer } from "./viewer";

export { baseViewer, canSee, canUseVendorData, limitFor, requireFeature, resolveViewer, PREVIEW_HEADER, type Tier, type Viewer } from "./viewer";

type SessionReader = (requestHeaders: Headers) => Promise<{ user?: { id?: string | number } } | null>;
const readCustomerSession: SessionReader = (requestHeaders) => customerAuth().api.getSession({ headers: requestHeaders });

/**
 * Owner first (Basic or owner session), then a customer session, then the anonymous fallback.
 * A customer session never yields `owner` or the admin tier. Exported for tests; pages use getViewer.
 */
export async function viewerFromHeaders(requestHeaders: Headers, readSession: SessionReader = readCustomerSession): Promise<Viewer> {
  const currentFlags = flags();
  if (ownerAuthorized(requestHeaders, process.env.OWNER_RESEARCH_PASSWORD)) return resolveViewer(currentFlags, requestHeaders.get(PREVIEW_HEADER), true);
  if (!currentFlags.AUTH || !hasCustomerCookie(requestHeaders.get("cookie"))) return resolveViewer(currentFlags);
  const db = getPool();
  if (!db) return resolveViewer(currentFlags);
  const session = await readSession(requestHeaders);
  if (!session?.user?.id) return resolveViewer(currentFlags);
  const userId = String(session.user.id);
  // The session cookie cache can outlive a deleted user by up to a minute; the row check closes that gap.
  const [user, state] = await Promise.all([
    db.query<{ id: string }>("SELECT id::text FROM users WHERE id = $1 AND deleted_at IS NULL", [userId]),
    customerPlan(db, userId),
  ]);
  if (!user.rows[0]) return resolveViewer(currentFlags);
  return {
    tier: !currentFlags.PAYWALL || state.plan !== "free" ? "paid" : "free",
    preview: false,
    owner: false,
    userId,
    plan: state.plan,
    planEndsAt: state.endsAt,
  };
}

/** Request-local memo (React cache). A viewer never goes into Next's shared data or full-route cache. */
export const resolveViewerFromHeaders = cache((requestHeaders: Headers) => viewerFromHeaders(requestHeaders));

/** Viewer of the current request. Outside a request (direct component tests) it is the anonymous fallback. */
export async function getViewer(): Promise<Viewer> {
  let requestHeaders: Headers;
  try { requestHeaders = await headers() as unknown as Headers; }
  catch { return resolveViewer(flags()); }
  return resolveViewerFromHeaders(requestHeaders);
}
