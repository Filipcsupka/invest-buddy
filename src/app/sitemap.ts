import type { MetadataRoute } from "next";
import { locales } from "@/i18n";
import { siteUrl } from "@/i18n/metadata";
import { flags } from "@/config/flags";

export const dynamic = "force-dynamic";

const routes = ["", "/dashboard", "/track-record", "/portfolio", "/methodology", "/legal/privacy", "/legal/terms"];

export default function sitemap(): MetadataRoute.Sitemap {
  const visible = flags().ADVICE_OUTPUT ? [...routes, "/sizing"] : routes;
  return locales.flatMap((locale) => visible.map((route) => ({ url: `${siteUrl}/${locale}${route}` })));
}
