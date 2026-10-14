import { NextResponse, type NextRequest } from "next/server";
import { instrumentUniverse } from "@/data/store";
import { ideasEnabled } from "@/data/ideas-store";
import { ownerViewEnabled } from "@/data/owner-allocation";
import { flags } from "@/config/flags";
import { rateLimit, rateLimitRetryAfter } from "@/security/rate-limit";
import { writeHttpLog } from "@/app/api/ingest/request-log";
import { resolveRequestId } from "@/app/request-id";
import { statusPage } from "@/app/status-page";
import { ownerResearchAuthorized } from "@/app/[locale]/owner/research/auth";

/** Resolve unavailable pages before a streamed layout can commit a 200 response. */
export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) return (rateLimit(request) as NextResponse | undefined) ?? NextResponse.next();
  const start = performance.now();
  const requestId = resolveRequestId(request.headers);
  const retryAfter = rateLimitRetryAfter(request);
  if (retryAfter !== undefined) return statusPage("rateLimited", 429, request.nextUrl.pathname.split("/")[1] === "sk" ? "sk" : "en", requestId, retryAfter);
  const incoming = new Headers(request.headers);
  incoming.set("x-request-id", requestId);
  incoming.set("x-request-start-ms", String(Date.now()));
  const [, locale, section, ticker] = request.nextUrl.pathname.split("/");
  const featureFlags = flags();
  if (section === "owner" && ticker === "research" && featureFlags.OWNER_VIEW &&
    !ownerResearchAuthorized(request.headers.get("authorization"), process.env.OWNER_RESEARCH_PASSWORD)) {
    return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Research"', "Cache-Control": "no-store" } });
  }
  const unavailable = (section === "scanner" && !featureFlags.PAYWALL)
    || (section === "sizing" && !featureFlags.ADVICE_OUTPUT)
    || (section === "pricing" && !featureFlags.WAITLIST)
    || (section === "ideas" && (!ideasEnabled() || !featureFlags.ADVICE_OUTPUT))
    || (section === "owner-allocation" && !ownerViewEnabled())
    || (section === "owner" && ticker === "research" && !featureFlags.OWNER_VIEW)
    || (section === "company" && (!ticker || !(await instrumentUniverse()).some((item) => item.ticker === ticker.toUpperCase())));
  if (!unavailable) {
    const response = NextResponse.next({ request: { headers: incoming } });
    if (section === "owner" && ticker === "research") response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("x-request-id", requestId);
    response.headers.set("server-timing", `rid;desc="${requestId}"`);
    return response;
  }
  const response = statusPage("notFound", 404, locale === "sk" ? "sk" : "en", requestId);
  writeHttpLog({ route: section === "company" ? "/company/[ticker]" : `/${section}`, locale, status: 404, durationMs: Math.round(performance.now() - start), requestId, message: "Page not found" }, true);
  return response;
}

export const config = { matcher: ["/", "/(en|sk)/:path*", "/api/:path*"] };
