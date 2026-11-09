import { NextResponse, type NextRequest } from "next/server";
import { instrumentForTicker } from "@/data/store";
import { ideasEnabled } from "@/data/ideas-store";
import { ownerViewEnabled } from "@/data/owner-allocation";
import { designViewEnabled, flags } from "@/config/flags";
import { PREVIEW_HEADER, resolveViewer } from "@/viewer/viewer";
import { withContentSecurityPolicy } from "@/security/headers";
import { rateLimit, rateLimitRetryAfter } from "@/security/rate-limit";
import { writeHttpLog } from "@/app/api/ingest/request-log";
import { resolveRequestId } from "@/app/request-id";
import { statusPage } from "@/app/status-page";
import { ownerAuthorized } from "@/app/[locale]/owner/auth";
import { ownerSessionFromCookieHeader, verifyOwnerSession } from "@/security/owner-session";
import { marketsViewable } from "@/markets/gate";
import { isEtfDataPath } from "@/components/etf/tabs";
import { PRIVATE_DATA_SECTIONS } from "@/app/private-data-routes";

const marketSections = new Set(["indices", "forex", "crypto", "economy", "congress", "news", "screener"]);
const privateDataSections = new Set<string>(PRIVATE_DATA_SECTIONS);
const ownerChallenge = () => new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Owner"', "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } });

/** Resolve unavailable pages before a streamed layout can commit a 200 response. */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // The CSP depends on ANALYTICS_*, so it is set here per request and not in next.config.ts, which runs at build time.
  if (pathname !== "/" && !/^\/(en|sk)(\/|$)/.test(pathname) && !pathname.startsWith("/api/")) return withContentSecurityPolicy(NextResponse.next());
  return withContentSecurityPolicy(await handle(request));
}

async function handle(request: NextRequest) {
  const password = process.env.OWNER_RESEARCH_PASSWORD;
  const basic = request.headers.get("authorization");
  const basicOwner = basic?.startsWith("Basic ") ? ownerAuthorized(basic, password) : false;
  const session = ownerSessionFromCookieHeader(request.headers.get("cookie"));
  const cookieOwner = verifyOwnerSession(session, password);
  const owner = basicOwner || cookieOwner;
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const response = (rateLimit(request) as NextResponse | undefined) ?? NextResponse.next();
    if (owner) {
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("X-Robots-Tag", "noindex");
    }
    return response;
  }
  const start = performance.now();
  const requestId = resolveRequestId(request.headers);
  const retryAfter = rateLimitRetryAfter(request);
  if (retryAfter !== undefined) return statusPage("rateLimited", 429, request.nextUrl.pathname.split("/")[1] === "sk" ? "sk" : "en", requestId, retryAfter);
  const incoming = new Headers(request.headers);
  // Forward only credentials verified here. A client-supplied OwnerSession header is never trusted.
  incoming.delete("authorization");
  if (basicOwner) incoming.set("authorization", basic!);
  else if (cookieOwner && session) incoming.set("authorization", `OwnerSession ${session}`);
  incoming.set("x-request-id", requestId);
  incoming.set("x-request-start-ms", String(Date.now()));
  // Never trust a client-sent preview header. Only an admin request with ?view=free gets one; resolveViewer ignores it for others.
  incoming.delete(PREVIEW_HEADER);
  const previewParam = request.nextUrl.searchParams.get("view");
  if (previewParam === "free" && resolveViewer(flags(), "free").preview) incoming.set(PREVIEW_HEADER, "free");
  const [, locale, section, ticker] = request.nextUrl.pathname.split("/");
  const featureFlags = flags();
  const privateDataRoute = privateDataSections.has(section);
  if (process.env.EODHD_PRIVATE_USE === "on" && privateDataRoute &&
    !owner) return ownerChallenge();
  // Owner-only EODHD ETF tabs under /etf/fund/{key}/{tab} share the market gate.
  const market = marketSections.has(section) || isEtfDataPath(request.nextUrl.pathname);
  if (market && featureFlags.MARKETS_VIEWS &&
    !marketsViewable(incoming)) {
    return ownerChallenge();
  }
  if (section === "owner" && featureFlags.OWNER_VIEW &&
    !owner) {
    if (request.headers.get("accept")?.includes("text/html")) {
      return new NextResponse(null, { status: 303, headers: {
        Location: `/${locale}/owner-sign-in`,
        "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex",
      } });
    }
    return ownerChallenge();
  }
  // Legal and owner gates come first and never read the viewer: admin does not bypass them. PAYWALL no longer hides /scanner.
  const unavailable = (section === "sizing" && !featureFlags.ADVICE_OUTPUT)
    || (section === "pricing" && !featureFlags.WAITLIST)
    || (section === "design" && !designViewEnabled())
    || (section === "ideas" && (!ideasEnabled() || !featureFlags.ADVICE_OUTPUT))
    || (section === "owner-allocation" && !ownerViewEnabled())
    || (section === "owner" && !featureFlags.OWNER_VIEW)
    || (market && !featureFlags.MARKETS_VIEWS)
    || (section === "company" && (!ticker || !(await instrumentForTicker(ticker))));
  if (!unavailable) {
    const response = NextResponse.next({ request: { headers: incoming } });
    if (owner || section === "owner" || section === "owner-sign-in" || market || (process.env.EODHD_PRIVATE_USE === "on" && privateDataRoute)) response.headers.set("Cache-Control", "private, no-store");
    if (owner || section === "owner" || section === "owner-sign-in" || market || (process.env.EODHD_PRIVATE_USE === "on" && privateDataRoute)) response.headers.set("X-Robots-Tag", "noindex");
    if (request.nextUrl.searchParams.has("view")) response.headers.set("X-Robots-Tag", "noindex");
    response.headers.set("x-request-id", requestId);
    response.headers.set("server-timing", `rid;desc="${requestId}"`);
    return response;
  }
  const response = statusPage("notFound", 404, locale === "sk" ? "sk" : "en", requestId);
  writeHttpLog({ route: section === "company" ? "/company/[ticker]" : `/${section}`, locale, status: 404, durationMs: Math.round(performance.now() - start), requestId, message: "Page not found" }, true);
  return response;
}

// Every path except Next's static assets, so the CSP also reaches unknown paths. `handle` keeps the old scope for everything else.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.svg).*)"] };
