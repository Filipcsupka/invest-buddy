import { SESSION_HINT_COOKIE } from "@/auth/cookie";
import { ME_HEADERS, meFromHeaders } from "./me";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const hinted = (cookie: string | null) => Boolean(cookie?.split(";").some((part) => part.trim().startsWith(`${SESSION_HINT_COOKIE}=`)));

/**
 * The signed-in state for the nav islands. Static pages stay static; this answer is never kept in a shared cache. A hint cookie left
 * behind by an ended session is cleared here, so the next page load skips the call.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const me = await meFromHeaders(request.headers);
    const headers = new Headers(ME_HEADERS);
    if (me.kind === "anon" && hinted(request.headers.get("cookie"))) headers.append("Set-Cookie", `${SESSION_HINT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`);
    return Response.json(me, { headers });
  } catch {
    return Response.json({ kind: "anon", markets: false }, { status: 503, headers: ME_HEADERS });
  }
}
