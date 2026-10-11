import type { MetadataRoute } from "next";
import { siteNoindex, siteUrl } from "@/i18n/metadata";

export const dynamic = "force-dynamic";

/** Public pages are open; `/api/` and the owner page are not for crawlers. Staging (SITE_NOINDEX) blocks everything. */
export default function robots(): MetadataRoute.Robots {
  if (siteNoindex()) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/en/owner-allocation", "/sk/owner-allocation"] }, sitemap: `${siteUrl}/sitemap.xml` };
}
