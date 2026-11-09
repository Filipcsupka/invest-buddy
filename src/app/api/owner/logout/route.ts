import { ownerPostAllowed } from "@/security/owner-csrf";
import { OWNER_SESSION_COOKIE } from "@/security/owner-session";

export async function POST(request: Request): Promise<Response> {
  if (!ownerPostAllowed(request.headers)) return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } });
  const body = await request.text();
  if (body.length > 4096) return new Response("Invalid request", { status: 400, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } });
  const locale = new URLSearchParams(body).get("locale") === "sk" ? "sk" : "en";
  return new Response(null, { status: 303, headers: {
    Location: `/${locale}/owner-sign-in`,
    "Set-Cookie": `${OWNER_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex",
  } });
}
