import { NextResponse } from "next/server";
import { OWNER_SESSION_COOKIE } from "@/security/owner-session";

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get("sec-fetch-site") === "cross-site") return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } });
  const body = await request.text();
  if (body.length > 4096) return new Response("Invalid request", { status: 400, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } });
  const locale = new URLSearchParams(body).get("locale") === "sk" ? "sk" : "en";
  const response = NextResponse.redirect(new URL(`/${locale}/owner-sign-in`, request.url), { status: 303 });
  response.cookies.set(OWNER_SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex");
  return response;
}
