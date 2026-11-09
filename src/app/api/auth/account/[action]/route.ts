import { customerAuth, authSiteUrl, TERMS_VERSION } from "@/auth/server";
import { clearCustomerCookies } from "@/auth/cookie";
import { getPool } from "@/db/pool";
import { deleteUser, recordConsent } from "@/db/users";
import { validAuthOrigin } from "@/auth/rate-limit";
import { flags } from "@/config/flags";

export const runtime = "nodejs";
const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };

/** Reads the session from the database, skipping the cookie cache, so a revoked session cannot export or delete. */
async function sessionUser(request: Request) {
  if (!flags().AUTH) return null;
  const session = await customerAuth().api.getSession({ headers: request.headers, query: { disableCookieCache: true } });
  return session?.user?.id ? String(session.user.id) : null;
}

function localeOf(form: FormData): "en" | "sk" {
  return form.get("locale") === "sk" ? "sk" : "en";
}

function redirect(location: string, clearCookies = false): Response {
  const response = new Response(null, { status: 303, headers: { ...privateHeaders, Location: location } });
  if (clearCookies) for (const value of clearCustomerCookies()) response.headers.append("Set-Cookie", value);
  return response;
}

export async function GET(request: Request, { params }: { params: Promise<{ action: string }> }): Promise<Response> {
  if ((await params).action !== "export") return new Response("Not found", { status: 404, headers: privateHeaders });
  const userId = await sessionUser(request);
  if (!userId) return new Response("Sign in required", { status: 401, headers: privateHeaders });
  const db = getPool();
  if (!db) return new Response("Unavailable", { status: 503, headers: privateHeaders });
  const [user, consents, entitlement, accounts] = await Promise.all([
    db.query("SELECT id::text, email, name, locale, created_at, terms_accepted_at, terms_version, marketing_consent_at, marketing_consent_version FROM users WHERE id = $1", [userId]),
    db.query("SELECT kind, version, granted, recorded_at FROM user_consents WHERE user_id = $1 ORDER BY recorded_at", [userId]),
    db.query("SELECT tier, status, source, starts_at, ends_at, cancel_at_period_end FROM entitlements WHERE user_id = $1", [userId]),
    db.query("SELECT provider_id, created_at FROM auth_accounts WHERE user_id = $1 ORDER BY created_at", [userId]),
  ]);
  return Response.json(
    { user: user.rows[0], signInMethods: accounts.rows, consents: consents.rows, entitlement: entitlement.rows[0] ?? null },
    { headers: { ...privateHeaders, "Content-Disposition": "attachment; filename=investbuddy-account.json" } },
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }): Promise<Response> {
  const { action } = await params;
  if (!flags().AUTH) return new Response("Not found", { status: 404, headers: privateHeaders });
  if (!validAuthOrigin(request, authSiteUrl())) return new Response("Forbidden", { status: 403, headers: privateHeaders });
  const form = await request.formData().catch(() => new FormData());
  const locale = localeOf(form);
  if (action === "sign-out") {
    try { await customerAuth().api.signOut({ headers: request.headers }); } catch { /* No valid session: still clear the cookies. */ }
    return redirect(`/${locale}`, true);
  }
  const userId = await sessionUser(request);
  if (!userId) return new Response("Sign in required", { status: 401, headers: privateHeaders });
  const db = getPool();
  if (!db) return new Response("Unavailable", { status: 503, headers: privateHeaders });
  if (action === "consent") {
    await recordConsent(db, { userId, kind: "marketing", version: TERMS_VERSION, granted: form.get("marketing") === "on" });
    return redirect(`/${locale}/account`);
  }
  if (action === "delete") {
    if (form.get("confirm") !== "DELETE") return new Response("Type DELETE to confirm", { status: 400, headers: privateHeaders });
    await deleteUser(db, userId);
    return redirect(`/${locale}`, true);
  }
  return new Response("Not found", { status: 404, headers: privateHeaders });
}
