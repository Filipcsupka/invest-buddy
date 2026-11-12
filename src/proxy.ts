import { NextResponse, type NextRequest } from "next/server";
import { instrumentForTicker } from "@/data/store";
import { ideasEnabled } from "@/data/ideas-store";
import { ownerViewEnabled } from "@/data/owner-allocation";
import { designViewEnabled, flags } from "@/config/flags";
import { PREVIEW_HEADER, canUseVendorData, resolveViewer } from "@/viewer/viewer";
import { withContentSecurityPolicy } from "@/security/headers";
import { rateLimit, rateLimitRetryAfter } from "@/security/rate-limit";
import { writeHttpLog } from "@/app/api/ingest/request-log";
import { resolveRequestId } from "@/app/request-id";
import { statusPage } from "@/app/status-page";
import { isEtfDataPath } from "@/components/etf/tabs";
import { PRIVATE_DATA_SECTIONS } from "@/app/private-data-routes";
import { hasCustomerCookie } from "@/auth/cookie";
import type { Viewer } from "@/viewer/viewer";

const marketSections = new Set(["indices", "forex", "crypto", "economy", "congress", "news", "screener"]);
const privateDataSections = new Set<string>(PRIVATE_DATA_SECTIONS);
const privateHeaders = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" };

/** Next.js client navigations and prefetches send these; a browser page load sends Accept text/html or Sec-Fetch-Dest document. */
const routerRequest = (h: Headers) => h.has("rsc") || h.has("next-router-prefetch") || h.has("next-router-state-tree");
const documentRequest = (h: Headers) => !routerRequest(h) && (h.get("sec-fetch-dest") === "document" || Boolean(h.get("accept")?.includes("text/html")));
/** Anything a browser sends. */
const browserRequest = (h: Headers) => routerRequest(h) || documentRequest(h) || h.has("sec-fetch-dest") || h.has("sec-fetch-mode");

/**
 * Next rejects a relative Location from the proxy ("Invalid URL", a 500). Resolve the path against the request URL; Next turns a
 * same-origin Location back into a relative one before it leaves the server, so the bind address does not leak.
 */
const sameOrigin = (request: NextRequest, path: string) => new URL(path, request.nextUrl).toString();

/**
 * The viewer behind a live customer session (signature, expiry, user row), or null. A forged or expired cookie, or the readable
 * ib_signed_in hint alone, is anonymous. Runs only for gated routes and for redirects, never on allowed public requests; an unsigned
 * cookie fails before any database read. The owner is the viewer with `owner` set (user id in OWNER_USER_IDS), never a hint.
 */
async function sessionViewer(headers: Headers): Promise<Viewer | null> {
  if (!flags().AUTH || !hasCustomerCookie(headers.get("cookie"))) return null;
  try {
    const { viewerFromHeaders } = await import("@/viewer/get-viewer");
    const viewer = await viewerFromHeaders(headers);
    return viewer.userId ? viewer : null;
  } catch {
    return null;
  }
}

/**
 * The answer for a gated route the visitor may not open. Non-browser clients (curl, scripts) get a plain 401, never a Basic challenge. A browser page load
 * goes to sign-in, or to the "opens soon" page for a signed-in customer. Prefetches and fetches get a plain 401 with no challenge header.
 * Locations are relative so the proxy host never leaks into them.
 */
async function denied(request: NextRequest, locale: string, section: string, signedIn: boolean): Promise<NextResponse> {
  const h = request.headers;
  if (!browserRequest(h)) return new NextResponse(null, { status: 401, headers: privateHeaders });
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
  // A customer cookie never grants anything here; it only marks the response as per-user so shared caches skip it.
  const customerCookie = hasCustomerCookie(request.headers.get("cookie"));
  // The owner is decided by the session (user id in OWNER_USER_IDS), read once and only when a gate or ?view=free needs it.
  let viewerRead: Promise<Viewer | null> | undefined;
  const viewer = () => (viewerRead ??= sessionViewer(request.headers));
  const ownerRequest = async () => (await viewer())?.owner === true;
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const response = (rateLimit(request) as NextResponse | undefined) ?? NextResponse.next();
    if (customerCookie || request.nextUrl.pathname.startsWith("/api/auth/")) {
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
  // No credential header is trusted past this point; pages read the session cookie.
  incoming.delete("authorization");
  incoming.set("x-request-id", requestId);
  incoming.set("x-request-start-ms", String(Date.now()));
  // Never trust a client-sent preview header. Only an admin request with ?view=free gets one; resolveViewer ignores it for others.
  incoming.delete(PREVIEW_HEADER);
  const previewParam = request.nextUrl.searchParams.get("view");
  if (previewParam === "free" && resolveViewer(flags(), "free", await ownerRequest()).preview) incoming.set(PREVIEW_HEADER, "free");
  const [, locale, section, ticker] = request.nextUrl.pathname.split("/");
  const featureFlags = flags();
  const privateDataRoute = privateDataSections.has(section);
  // Vendor-derived pages: the owner and customers with an active Plus plan (paid or trial). owner-allocation stays owner-only.
  if (process.env.EODHD_PRIVATE_USE === "on" && privateDataRoute) {
    const who = await viewer();
    const allowed = section === "owner-allocation" ? who?.owner === true : Boolean(who && canUseVendorData(who));
    if (!allowed) return denied(request, locale, section, Boolean(who));
  }
  // Owner-only EODHD ETF tabs under /etf/fund/{key}/{tab} share the market gate.
  const market = marketSections.has(section) || isEtfDataPath(request.nextUrl.pathname);
  if (market && featureFlags.MARKETS_VIEWS && !(await ownerRequest())) {
    return denied(request, locale, section, Boolean(await viewer()));
  }
  // Owner pages: anonymous browsers go to sign-in, a signed-in non-owner gets the 404 page, other clients a plain 401.
  if (section === "owner" && featureFlags.OWNER_VIEW && !(await ownerRequest())) {
    const signedIn = Boolean(await viewer());
    if (signedIn) return withPrivate(statusPage("notFound", 404, locale === "sk" ? "sk" : "en", requestId));
    if (documentRequest(request.headers)) {
      const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
      return new NextResponse(null, { status: 303, headers: {
        Location: sameOrigin(request, `/${locale}/sign-in?mode=sign-in&next=${encodeURIComponent(next)}`),
        "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex",
      } });
    }
    return new NextResponse(null, { status: 401, headers: privateHeaders });
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
    if (customerCookie || section === "account" || section === "owner" || market || (process.env.EODHD_PRIVATE_USE === "on" && privateDataRoute)) {
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("Vary", "Cookie");
    }
    if (section === "account" || section === "owner" || market || (process.env.EODHD_PRIVATE_USE === "on" && privateDataRoute)) response.headers.set("X-Robots-Tag", "noindex");
    if (request.nextUrl.searchParams.has("view")) response.headers.set("X-Robots-Tag", "noindex");
    response.headers.set("x-request-id", requestId);
    response.headers.set("server-timing", `rid;desc="${requestId}"`);
    return response;
  }
  const response = statusPage("notFound", 404, locale === "sk" ? "sk" : "en", requestId);
  writeHttpLog({ route: section === "company" ? "/company/[ticker]" : `/${section}`, locale, status: 404, durationMs: Math.round(performance.now() - start), requestId, message: "Page not found" }, true);
  return response;
}

const withPrivate = (response: Response) => {
  for (const [key, value] of Object.entries(privateHeaders)) response.headers.set(key, value);
  return response;
};

// Every path except Next's static assets, so the CSP also reaches unknown paths. `handle` keeps the old scope for everything else.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.svg).*)"] };
