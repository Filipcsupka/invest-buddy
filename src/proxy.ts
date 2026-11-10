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
import { hasCustomerCookie, SESSION_HINT_COOKIE, sessionHintCookie } from "@/auth/cookie";
import { OWNER_SESSION_SECONDS } from "@/security/owner-session";

const marketSections = new Set(["indices", "forex", "crypto", "economy", "congress", "news", "screener"]);
const privateDataSections = new Set<string>(PRIVATE_DATA_SECTIONS);
const privateHeaders = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };
const ownerChallenge = () => new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Owner"', ...privateHeaders } });

/** Next.js client navigations and prefetches send these; a browser page load sends Accept text/html or Sec-Fetch-Dest document. */
const routerRequest = (h: Headers) => h.has("rsc") || h.has("next-router-prefetch") || h.has("next-router-state-tree");
const documentRequest = (h: Headers) => !routerRequest(h) && (h.get("sec-fetch-dest") === "document" || Boolean(h.get("accept")?.includes("text/html")));
/** Anything a browser sends. Browsers never get the Basic challenge, which is the owner password popup. */
const browserRequest = (h: Headers) => routerRequest(h) || documentRequest(h) || h.has("sec-fetch-dest") || h.has("sec-fetch-mode");

/**
 * Next rejects a relative Location from the proxy ("Invalid URL", a 500). Resolve the path against the request URL; Next turns a
 * same-origin Location back into a relative one before it leaves the server, so the bind address does not leak.
 */
const sameOrigin = (request: NextRequest, path: string) => new URL(path, request.nextUrl).toString();

/**
 * The answer for a gated route the visitor may not open. Non-browser clients (curl, scripts) get the Basic challenge. A browser page load
 * goes to sign-in, or to the "opens soon" page for a signed-in customer. Prefetches and fetches get a plain 401 with no challenge header.
 * Locations are relative so the proxy host never leaks into them.
 */
function denied(request: NextRequest, locale: string, section: string, signedIn: boolean): NextResponse {
  const h = request.headers;
  if (!browserRequest(h)) return ownerChallenge();
  if (!documentRequest(h)) return new NextResponse(null, { status: 401, headers: privateHeaders });
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const location = signedIn ? `/${locale}/opens-soon?page=${encodeURIComponent(section)}` : `/${locale}/sign-in?mode=sign-in&next=${encodeURIComponent(next)}`;
  return new NextResponse(null, { status: 307, headers: { ...privateHeaders, Location: sameOrigin(request, location) } });
}

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
  // A customer cookie never grants anything here; it only marks the response as per-user so shared caches skip it.
  const customerCookie = hasCustomerCookie(request.headers.get("cookie"));
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const response = (rateLimit(request) as NextResponse | undefined) ?? NextResponse.next();
    if (owner || customerCookie || request.nextUrl.pathname.startsWith("/api/auth/")) {
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("Vary", "Cookie");
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
  if (previewParam === "free" && resolveViewer(flags(), "free", owner).preview) incoming.set(PREVIEW_HEADER, "free");
  const [, locale, section, ticker] = request.nextUrl.pathname.split("/");
  const featureFlags = flags();
  const privateDataRoute = privateDataSections.has(section);
  if (process.env.EODHD_PRIVATE_USE === "on" && privateDataRoute &&
    !owner) return denied(request, locale, section, customerCookie);
  // Owner-only EODHD ETF tabs under /etf/fund/{key}/{tab} share the market gate.
  const market = marketSections.has(section) || isEtfDataPath(request.nextUrl.pathname);
  if (market && featureFlags.MARKETS_VIEWS &&
    !marketsViewable(incoming)) {
    return denied(request, locale, section, customerCookie);
  }
  if (section === "owner" && featureFlags.OWNER_VIEW &&
    !owner) {
    if (documentRequest(request.headers)) {
      return new NextResponse(null, { status: 303, headers: {
        Location: sameOrigin(request, `/${locale}/owner-sign-in`),
        "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex",
      } });
    }
    return browserRequest(request.headers) ? new NextResponse(null, { status: 401, headers: privateHeaders }) : ownerChallenge();
  }
  // Legal and owner gates come first and never read the viewer: admin does not bypass them. PAYWALL no longer hides /scanner.
  const unavailable = (section === "sizing" && !featureFlags.ADVICE_OUTPUT)
    || (section === "design" && !designViewEnabled())
    || (section === "ideas" && (!ideasEnabled() || !featureFlags.ADVICE_OUTPUT))
    || (section === "owner-allocation" && !ownerViewEnabled())
    || (section === "owner" && !featureFlags.OWNER_VIEW)
    || (market && !featureFlags.MARKETS_VIEWS)
    || (section === "company" && (!ticker || !(await instrumentForTicker(ticker))));
  if (!unavailable) {
    const response = NextResponse.next({ request: { headers: incoming } });
    if (owner || customerCookie || section === "account" || section === "owner" || section === "owner-sign-in" || market || (process.env.EODHD_PRIVATE_USE === "on" && privateDataRoute)) {
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("Vary", "Cookie");
    }
    if (owner || section === "account" || section === "owner" || section === "owner-sign-in" || market || (process.env.EODHD_PRIVATE_USE === "on" && privateDataRoute)) response.headers.set("X-Robots-Tag", "noindex");
    if (request.nextUrl.searchParams.has("view")) response.headers.set("X-Robots-Tag", "noindex");
    // The readable sign-in hint lets static pages show the owner state without a server read (nav island, /api/me).
    if (cookieOwner && !hasHint(request.headers.get("cookie"))) response.headers.append("Set-Cookie", sessionHintCookie(secureRequest(request), OWNER_SESSION_SECONDS));
    response.headers.set("x-request-id", requestId);
    response.headers.set("server-timing", `rid;desc="${requestId}"`);
    return response;
  }
  const response = statusPage("notFound", 404, locale === "sk" ? "sk" : "en", requestId);
  writeHttpLog({ route: section === "company" ? "/company/[ticker]" : `/${section}`, locale, status: 404, durationMs: Math.round(performance.now() - start), requestId, message: "Page not found" }, true);
  return response;
}

const hasHint = (cookie: string | null) => Boolean(cookie?.split(";").some((part) => part.trim().startsWith(`${SESSION_HINT_COOKIE}=`)));
const secureRequest = (request: NextRequest) => request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";

// Every path except Next's static assets, so the CSP also reaches unknown paths. `handle` keeps the old scope for everything else.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.svg).*)"] };
