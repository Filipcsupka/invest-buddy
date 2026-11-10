import { headers } from "next/headers";
import { cache } from "react";
import { flags } from "@/config/flags";
import { isOwnerUser } from "@/auth/owner";
import { hasCustomerCookie } from "@/auth/cookie";
import { customerAuth } from "@/auth/server";
import { getPool } from "@/db/pool";
import { customerPlan } from "@/entitlements/plan";
import { PREVIEW_HEADER, resolveViewer, type Viewer } from "./viewer";

export { baseViewer, canSee, isOwner, canUseVendorData, limitFor, requireFeature, resolveViewer, PREVIEW_HEADER, type Tier, type Viewer } from "./viewer";

type SessionReader = (requestHeaders: Headers) => Promise<{ user?: { id?: string | number } } | null>;
const readCustomerSession: SessionReader = (requestHeaders) => customerAuth().api.getSession({ headers: requestHeaders });

/**
 * A customer session, then the anonymous fallback. The owner is the session user whose id is listed in OWNER_USER_IDS. Exported for tests; pages use getViewer.
 */
export async function viewerFromHeaders(requestHeaders: Headers, readSession: SessionReader = readCustomerSession): Promise<Viewer> {
  const currentFlags = flags();
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
  if (isOwnerUser(session.user)) return { ...resolveViewer(currentFlags, requestHeaders.get(PREVIEW_HEADER), true), userId };
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
