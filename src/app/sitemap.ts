import type { MetadataRoute } from "next";
import { locales } from "@/i18n";
import { siteUrl } from "@/i18n/metadata";

const routes = ["", "/dashboard", "/track-record", "/portfolio", "/methodology", "/sizing", "/legal/privacy", "/legal/terms"];

export default function sitemap(): MetadataRoute.Sitemap {
  return locales.flatMap((locale) => routes.map((route) => ({ url: `${siteUrl}/${locale}${route}` })));
}
