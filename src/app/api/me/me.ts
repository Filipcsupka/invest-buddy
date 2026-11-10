import { flags } from "@/config/flags";
import { ownerAuthorized } from "@/app/[locale]/owner/auth";
import { customerAuth } from "@/auth/server";
import { viewerFromHeaders } from "@/viewer/get-viewer";

export type Me =
  | { kind: "anon"; markets: false }
  | { kind: "owner"; markets: boolean }
  | { kind: "customer"; email: string; plan: "free" | "plus" | "trial"; trialDaysLeft?: number; markets: false };

type Session = { user?: { id?: string | number; email?: string | null } } | null;
export type SessionReader = (requestHeaders: Headers) => Promise<Session>;

/** Headers for every /api/me answer. The body is per visitor, so no shared cache may keep it. */
export const ME_HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Robots-Tag": "noindex" } as const;

const DAY_MS = 86_400_000;
const readCustomerSession: SessionReader = (requestHeaders) => customerAuth().api.getSession({ headers: requestHeaders }) as Promise<Session>;

/**
 * Who is asking: owner (Basic or owner session), a signed-in customer, or nobody. The owner check is the same one the market pages use;
 * the customer path reuses viewerFromHeaders, so a deleted user or an ended trial reads as on the account page. No vendor data, no ids.
 */
export async function meFromHeaders(requestHeaders: Headers, readSession: SessionReader = readCustomerSession, now = new Date()): Promise<Me> {
  const current = flags();
  if (ownerAuthorized(requestHeaders, process.env.OWNER_RESEARCH_PASSWORD)) return { kind: "owner", markets: current.MARKETS_VIEWS };
  if (!current.AUTH) return { kind: "anon", markets: false };
  let email: string | null = null;
  const capture = async (headers: Headers) => {
    const session = await readSession(headers);
    email = session?.user?.email ?? null;
    return session;
  };
  const viewer = await viewerFromHeaders(requestHeaders, capture);
  if (!viewer.userId || !email) return { kind: "anon", markets: false };
  const plan = viewer.plan ?? "free";
  if (plan !== "trial") return { kind: "customer", email, plan, markets: false };
  const left = viewer.planEndsAt ? Math.max(0, Math.ceil((viewer.planEndsAt.getTime() - now.getTime()) / DAY_MS)) : 0;
  return { kind: "customer", email, plan, trialDaysLeft: left, markets: false };
}

