import { NextResponse, type NextRequest } from "next/server";
import { isLocale, localeCookie, negotiateLocale } from "@/i18n";

/** `/` sends visitors to their saved language, else to the best Accept-Language match, else English. */
export function GET(request: NextRequest) {
  const saved = request.cookies.get(localeCookie)?.value;
  const locale = saved && isLocale(saved) ? saved : negotiateLocale(request.headers.get("accept-language"));
  // Relative Location: behind the proxy request.url carries the container bind address, not the public host.
  return new NextResponse(null, { status: 307, headers: { Location: `/${locale}`, Vary: "Accept-Language, Cookie" } });
}
