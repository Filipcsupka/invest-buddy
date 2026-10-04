import { NextResponse, type NextRequest } from "next/server";
import { isLocale, localeCookie, negotiateLocale } from "@/i18n";

/** `/` sends visitors to their saved language, else to the best Accept-Language match, else English. */
export function GET(request: NextRequest) {
  const saved = request.cookies.get(localeCookie)?.value;
  const locale = saved && isLocale(saved) ? saved : negotiateLocale(request.headers.get("accept-language"));
  const response = NextResponse.redirect(new URL(`/${locale}`, request.url), 307);
  response.headers.set("Vary", "Accept-Language, Cookie");
  return response;
}
