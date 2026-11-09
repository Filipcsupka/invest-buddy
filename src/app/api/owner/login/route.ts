import { NextResponse } from "next/server";
import { ownerPasswordMatches } from "@/app/[locale]/owner/auth";
import { clientKey, createLimiter } from "@/security/rate-limit";
import { issueOwnerSession, OWNER_SESSION_COOKIE, OWNER_SESSION_SECONDS } from "@/security/owner-session";

const attempts = createLimiter({ perMinute: 5 });
const totalAttempts = createLimiter({ perMinute: 30 });
const privateHeaders = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return new Response("Forbidden", { status: 403, headers: privateHeaders });
  }
  const limit = attempts.take(clientKey(request.headers));
  const total = totalAttempts.take("owner-login");
  if (!limit.ok || !total.ok) return new Response("Too many attempts", { status: 429, headers: { ...privateHeaders, "Retry-After": String(Math.max(limit.retryAfter, total.retryAfter)) } });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 4096 || !request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) {
    return new Response("Invalid request", { status: 400, headers: privateHeaders });
  }
  const body = await request.text();
  if (body.length > 4096) return new Response("Invalid request", { status: 400, headers: privateHeaders });
  const fields = new URLSearchParams(body);
  const locale = fields.get("locale") === "sk" ? "sk" : "en";
  const password = fields.get("password") ?? "";
  const configured = process.env.OWNER_RESEARCH_PASSWORD;
  const token = ownerPasswordMatches(password, configured) ? issueOwnerSession(configured!, process.env) : null;
  if (!token) {
    const response = NextResponse.redirect(new URL(`/${locale}/owner-sign-in?error=1`, request.url), { status: 303 });
    for (const [key, value] of Object.entries(privateHeaders)) response.headers.set(key, value);
    return response;
  }
  const response = NextResponse.redirect(new URL(`/${locale}`, request.url), { status: 303 });
  response.cookies.set(OWNER_SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: OWNER_SESSION_SECONDS });
  for (const [key, value] of Object.entries(privateHeaders)) response.headers.set(key, value);
  return response;
}
