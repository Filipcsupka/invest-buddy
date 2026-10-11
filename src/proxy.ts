import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { instrumentUniverse } from "@/data/store";
import { ideasEnabled } from "@/data/ideas-store";
import { ownerViewEnabled } from "@/data/owner-allocation";
import { flags } from "@/config/flags";
import { getMessages, type Locale } from "@/i18n";
import { rateLimit } from "@/security/rate-limit";
import { writeHttpLog } from "@/app/api/ingest/request-log";

/** Resolve unavailable pages before a streamed layout can commit a 200 response. */
export async function proxy(request: NextRequest) {
  const limited = rateLimit(request);
  if (limited) return limited as NextResponse;
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();
  const start = performance.now();
  const requestId = randomUUID();
  const incoming = new Headers(request.headers);
  incoming.set("x-request-id", requestId);
  incoming.set("x-request-start-ms", String(Date.now()));
  const [, locale, section, ticker] = request.nextUrl.pathname.split("/");
  const featureFlags = flags();
  const unavailable = (section === "scanner" && !featureFlags.PAYWALL)
    || (section === "sizing" && !featureFlags.ADVICE_OUTPUT)
    || (section === "ideas" && (!ideasEnabled() || !featureFlags.ADVICE_OUTPUT))
    || (section === "owner-allocation" && !ownerViewEnabled())
    || (section === "company" && (!ticker || !(await instrumentUniverse()).some((item) => item.ticker === ticker.toUpperCase())));
  if (!unavailable) {
    const response = NextResponse.next({ request: { headers: incoming } });
    response.headers.set("x-request-id", requestId);
    return response;
  }
  const m = getMessages(locale as Locale);
  const body = process.env.DATA_MODE === "fixture" ? m.errors.notFoundBody : m.errors.notFoundBodyLive;
  const response = new NextResponse(`<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>404 · InvestBuddy</title><style>body{margin:0;background:#eceeeb;color:#17201b;font:1rem/1.6 system-ui,sans-serif}main{max-width:42rem;margin:12vh auto;padding:2rem}h1{font-size:clamp(2rem,6vw,4rem);line-height:1.1}a{display:inline-block;margin-top:1rem;padding:.75rem 1.25rem;background:#17201b;color:white;text-decoration:none;border-radius:.25rem}@media(prefers-color-scheme:dark){body{background:#111416;color:#e6ebe7}a{background:#e6ebe7;color:#111416}}</style><main><h1>${m.errors.notFoundTitle}</h1><p>${body}</p><a href="/${locale}/dashboard">${m.errors.notFoundAction}</a></main></html>`,
    { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  response.headers.set("x-request-id", requestId);
  writeHttpLog({ route: section === "company" ? "/company/[ticker]" : `/${section}`, locale, status: 404, durationMs: Math.round(performance.now() - start), requestId, message: "Page not found" }, true);
  return response;
}

export const config = { matcher: ["/", "/(en|sk)/:path*", "/api/:path*"] };
