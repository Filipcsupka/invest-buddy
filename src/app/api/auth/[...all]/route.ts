import { customerAuth, authSiteUrl } from "@/auth/server";
import { authClientIp, takeAuthLimit, validAuthOrigin } from "@/auth/rate-limit";
import { validPassword } from "@/auth/password";
import { getPool } from "@/db/pool";
import { flags } from "@/config/flags";

export const runtime = "nodejs";

const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };

function privateResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Vary", "Cookie");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function handle(request: Request): Promise<Response> {
  if (!flags().AUTH) return new Response("Not found", { status: 404, headers: privateHeaders });
  const path = new URL(request.url).pathname;
  if (path.endsWith("/magic-link/consume") && request.method === "POST") {
    if (!flags().MAGIC_LINK || !validAuthOrigin(request, authSiteUrl())) return new Response("Forbidden", { status: 403 });
    const form = await request.formData();
    const token = form.get("token");
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{20,128}$/.test(token)) return new Response("Invalid link", { status: 400 });
    const verify = new URL("/api/auth/magic-link/verify", authSiteUrl());
    verify.searchParams.set("token", token);
    verify.searchParams.set("callbackURL", "/en/account");
    return privateResponse(await customerAuth().handler(new Request(verify, { headers: request.headers })));
  }
  if (path.endsWith("/sign-in/magic-link") && !flags().MAGIC_LINK) return new Response("Not found", { status: 404 });
  let forwarded = request;
  if (request.method === "POST") {
    if (!validAuthOrigin(request, authSiteUrl())) return new Response("Forbidden", { status: 403 });
    const db = getPool();
    if (!db) return new Response("Unavailable", { status: 503 });
    const ip = authClientIp(request.headers);
    const signup = path.endsWith("/sign-up/email");
    const emailFlow = signup || path.endsWith("/sign-in/email") || path.endsWith("/sign-in/magic-link");
    const social = path.endsWith("/sign-in/social");
    if (emailFlow || social) {
      const allowed = await takeAuthLimit(db, "ip", `${signup ? "signup" : "signin"}:${ip}`, signup ? 5 : 20, 3600);
      if (!allowed) return Response.json({ error: "Too many requests" }, { status: 429, headers: { ...privateHeaders, "Retry-After": "3600" } });
    }
    if (emailFlow) {
      let body: Record<string, unknown>;
      try { body = await request.json(); } catch { return Response.json({ error: "Invalid request" }, { status: 400, headers: privateHeaders }); }
      if (typeof body.email !== "string" || !body.email.includes("@") || body.email.length > 254) return Response.json({ error: "Invalid request" }, { status: 400, headers: privateHeaders });
      const email = body.email.trim().toLowerCase();
      // Per-email limits: Better Auth only limits per IP (ADR gotcha 4).
      const magic = path.endsWith("/sign-in/magic-link");
      const emailMax = signup || magic ? 5 : 10;
      if (!await takeAuthLimit(db, "email", `${signup ? "signup" : magic ? "magic" : "signin"}:${email}`, emailMax, 3600)) return Response.json({ error: "Too many requests" }, { status: 429, headers: { ...privateHeaders, "Retry-After": "3600" } });
      if (signup && !validPassword(body.password)) return Response.json({ error: "Use a stronger password of at least 10 characters" }, { status: 400, headers: privateHeaders });
      body.email = email;
      const bodyHeaders = new Headers(request.headers);
      bodyHeaders.delete("content-length");
      forwarded = new Request(request.url, { method: "POST", headers: bodyHeaders, body: JSON.stringify(body) });
    }
  }
  const headers = new Headers(forwarded.headers);
  headers.delete("x-auth-client-ip");
  headers.set("x-auth-client-ip", authClientIp(request.headers));
  return privateResponse(await customerAuth().handler(new Request(forwarded, { headers })));
}

export { handle as GET, handle as POST };
