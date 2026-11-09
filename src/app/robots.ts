import type { MetadataRoute } from "next";
import { siteNoindex, siteUrl } from "@/i18n/metadata";
import { PRIVATE_DATA_SECTIONS } from "./private-data-routes";

export const dynamic = "force-dynamic";

/** Public pages are open; `/api/` and the owner page are not for crawlers. Staging (SITE_NOINDEX) blocks everything. */
export default function robots(): MetadataRoute.Robots {
  if (siteNoindex()) return { rules: { userAgent: "*", disallow: "/" } };
  const privateRoutes = process.env.EODHD_PRIVATE_USE === "on" ? PRIVATE_DATA_SECTIONS : [];
  const routes = [...new Set([...privateRoutes, "owner-sign-in", "owner-allocation", "indices", "forex", "crypto", "economy", "congress", "news", "screener"])];
  const disallow = ["/api/", ...["en", "sk"].flatMap((locale) => [...routes.map((route) => `/${locale}/${route}`), `/${locale}/owner/`])];
  return { rules: { userAgent: "*", allow: "/", disallow }, sitemap: `${siteUrl}/sitemap.xml` };
}
