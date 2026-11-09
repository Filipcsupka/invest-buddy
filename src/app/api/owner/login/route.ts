import { ownerPostAllowed } from "@/security/owner-csrf";
import { ownerPasswordMatches } from "@/app/[locale]/owner/auth";
import { clientKey, createLimiter } from "@/security/rate-limit";
import { issueOwnerSession, OWNER_SESSION_COOKIE, OWNER_SESSION_SECONDS } from "@/security/owner-session";

const attempts = createLimiter({ perMinute: 5 });
const totalAttempts = createLimiter({ perMinute: 30 });
const privateHeaders = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };

export async function POST(request: Request): Promise<Response> {
  if (!ownerPostAllowed(request.headers)) {
    return new Response("Forbidden", { status: 403, headers: privateHeaders });
  }
  // Without a client address, use only the global failure budget, not a shared IP bucket.
  const hasClientAddress = request.headers.get("x-forwarded-for")?.split(",").some((part) => part.trim())
    || request.headers.get("x-real-ip")?.trim();
  if (hasClientAddress) {
    const limit = attempts.take(clientKey(request.headers));
    if (!limit.ok) return new Response("Too many attempts", { status: 429, headers: { ...privateHeaders, "Retry-After": String(limit.retryAfter) } });
  }
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
    const total = totalAttempts.take("owner-login");
    if (!total.ok) return new Response("Too many attempts", { status: 429, headers: { ...privateHeaders, "Retry-After": String(total.retryAfter) } });
    return new Response(null, { status: 303, headers: { ...privateHeaders, Location: `/${locale}/owner-sign-in?error=1` } });
  }
  return new Response(null, { status: 303, headers: {
    ...privateHeaders,
    Location: `/${locale}`,
    "Set-Cookie": `${OWNER_SESSION_COOKIE}=${token}; Path=/; Max-Age=${OWNER_SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
  } });
}
