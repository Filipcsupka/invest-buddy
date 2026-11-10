import { customerAuth, authSiteUrl, SESSION_DAYS, TERMS_VERSION } from "@/auth/server";
import { customerCookieName, sessionHintCookie, SESSION_HINT_COOKIE } from "@/auth/cookie";
import { recordConsent } from "@/db/users";
import { authClientIp, takeAuthLimit, validAuthOrigin } from "@/auth/rate-limit";
import { validPassword } from "@/auth/password";
import { getPool } from "@/db/pool";
import { flags } from "@/config/flags";
import { canonicalEmail } from "@/auth/trial";

export const runtime = "nodejs";

const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };

/** Mirrors the session cookie into the readable `ib_signed_in` hint: set with a session, cleared when the session cookie is cleared. */
function syncSessionHint(headers: Headers): void {
  const names = [customerCookieName("session", true), customerCookieName("session", false)];
  const session = headers.getSetCookie().find((value) => names.some((name) => value.startsWith(`${name}=`)));
  if (!session) return;
  const secure = session.startsWith("__Host-");
  const cleared = /^[^=]+=;/.test(session) || /;\s*Max-Age=0\b/i.test(session);
  headers.append("Set-Cookie", cleared ? `${SESSION_HINT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax` : sessionHintCookie(secure, SESSION_DAYS * 86_400));
}

function privateResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Vary", "Cookie");
  syncSessionHint(headers);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Better Auth routes reachable from outside, by method. Everything else 404s: change-password, revoke-sessions,
 * send-verification-email (no per-email limit, so it could mail-bomb), and GET magic-link/verify, which only runs
 * through the POST consume step so mail scanners cannot spend a token.
 */
function allowedRoute(method: string, route: string): boolean {
  const current = flags();
  if (method === "POST") {
    return ["/sign-up/email", "/sign-in/email", "/sign-in/social", "/sign-out"].includes(route)
      || (route === "/sign-in/magic-link" && current.MAGIC_LINK);
  }
  if (method === "GET") {
    return ["/get-session", "/callback/google", "/error"].includes(route) || (route === "/verify-email" && current.EMAIL_VERIFY);
  }
  return false;
}

async function handle(request: Request): Promise<Response> {
  if (!flags().AUTH) return new Response("Not found", { status: 404, headers: privateHeaders });
  const path = new URL(request.url).pathname;
  const route = path.startsWith("/api/auth/") ? path.slice("/api/auth".length) : path;
  if (path.endsWith("/magic-link/consume") && request.method === "POST") {
    if (!flags().MAGIC_LINK || !validAuthOrigin(request, authSiteUrl())) return new Response("Forbidden", { status: 403 });
    const form = await request.formData();
    const token = form.get("token");
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{20,128}$/.test(token)) return new Response("Invalid link", { status: 400 });
    const verify = new URL("/api/auth/magic-link/verify", authSiteUrl());
    verify.searchParams.set("token", token);
    verify.searchParams.set("callbackURL", "/en/account");
    const verifyHeaders = new Headers(request.headers);
    verifyHeaders.set("x-auth-client-ip", authClientIp(request.headers));
    return privateResponse(await customerAuth().handler(new Request(verify, { headers: verifyHeaders })));
  }
  if (!allowedRoute(request.method, route)) return new Response("Not found", { status: 404, headers: privateHeaders });
  let forwarded = request;
  let marketing = false;
  if (request.method === "POST") {
    if (!validAuthOrigin(request, authSiteUrl())) return new Response("Forbidden", { status: 403 });
    const db = getPool();
    if (!db) return new Response("Unavailable", { status: 503 });
    const ip = authClientIp(request.headers);
    const signup = route === "/sign-up/email";
    const magic = route === "/sign-in/magic-link";
    const emailFlow = signup || magic || route === "/sign-in/email";
    const social = route === "/sign-in/social";
    const bucket = signup ? "signup" : magic ? "magic" : "signin";
    if (emailFlow || social) {
      // Magic link can create an account, so it gets the sign-up limit.
      const allowed = await takeAuthLimit(db, "ip", `${bucket}:${ip}`, signup || magic ? 5 : 20, 3600);
      if (!allowed) return Response.json({ error: "Too many requests" }, { status: 429, headers: { ...privateHeaders, "Retry-After": "3600" } });
    }
    if (emailFlow) {
      let body: Record<string, unknown>;
      try { body = await request.json(); } catch { return Response.json({ error: "Invalid request" }, { status: 400, headers: privateHeaders }); }
      if (typeof body.email !== "string" || !body.email.includes("@") || body.email.length > 254) return Response.json({ error: "Invalid request" }, { status: 400, headers: privateHeaders });
      const email = body.email.trim().toLowerCase();
      // Per-email limits: Better Auth only limits per IP (ADR gotcha 4). Account-creating flows key on the canonical
      // mailbox, so +tags and Gmail dots share one bucket.
      const emailMax = signup || magic ? 5 : 10;
      const limitKey = signup || magic ? canonicalEmail(email) : email;
      if (!await takeAuthLimit(db, "email", `${bucket}:${limitKey}`, emailMax, 3600)) return Response.json({ error: "Too many requests" }, { status: 429, headers: { ...privateHeaders, "Retry-After": "3600" } });
      if (signup && !validPassword(body.password)) return Response.json({ error: "Use a stronger password of at least 10 characters" }, { status: 400, headers: privateHeaders });
      body.email = email;
      // The sign-up form's marketing box is our field, not Better Auth's: take it off the body and record it after the user exists.
      marketing = signup && body.marketing === true;
      delete body.marketing;
      const bodyHeaders = new Headers(request.headers);
      bodyHeaders.delete("content-length");
      forwarded = new Request(request.url, { method: "POST", headers: bodyHeaders, body: JSON.stringify(body) });
    }
  }
  const headers = new Headers(forwarded.headers);
  headers.delete("x-auth-client-ip");
  headers.set("x-auth-client-ip", authClientIp(request.headers));
  const response = await customerAuth().handler(new Request(forwarded, { headers }));
  if (marketing && response.ok) {
    const userId = (await response.clone().json().catch(() => null) as { user?: { id?: unknown } } | null)?.user?.id;
    const db = getPool();
    if (db && (typeof userId === "string" || typeof userId === "number")) {
      await recordConsent(db, { userId: String(userId), kind: "marketing", version: TERMS_VERSION, granted: true });
    }
  }
  return privateResponse(response);
}

export { handle as GET, handle as POST };
