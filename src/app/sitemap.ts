import type { MetadataRoute } from "next";
import { intlTag, locales, type Locale } from "@/i18n";
import { siteUrl } from "@/i18n/metadata";
import { flags } from "@/config/flags";
import { instrumentUniverse, latestScores } from "@/data/store";

export const dynamic = "force-dynamic";

/** Public-safe, indexable pages. Only bare paths are listed: filtered scanner URLs and ?view= previews stay out. */
const routes = ["", "/dashboard", "/scanner", "/heatmap", "/track-record", "/portfolio", "/methodology", "/legal/privacy", "/legal/terms", "/legal/disclaimer"];

/** One entry per path and locale, each with hreflang alternates. `lastModified` is the data date, not the request time. */
function entries(paths: { path: string; lastModified?: string }[]): MetadataRoute.Sitemap {
  return paths.flatMap(({ path, lastModified }) =>
    locales.map((locale: Locale) => ({
      url: `${siteUrl}/${locale}${path}`,
      ...(lastModified ? { lastModified } : {}),
      alternates: { languages: { ...Object.fromEntries(locales.map((l) => [intlTag[l], `${siteUrl}/${l}${path}`])), "x-default": `${siteUrl}/en${path}` } },
    })),
  );
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = flags().INSIDERS_PAGE ? [...routes, "/insiders"] : routes;
  const withSizing = flags().ADVICE_OUTPUT ? [...base, "/sizing"] : base;
  const visible = flags().WAITLIST ? [...withSizing, "/pricing"] : withSizing;
  let universe: Awaited<ReturnType<typeof instrumentUniverse>> = [];
  let scores: Awaited<ReturnType<typeof latestScores>> | null = null;
  try {
    universe = await instrumentUniverse();
    scores = await latestScores();
  } catch {
    // The static pages stay listed when the database is unreachable.
  }
  const dataDate = scores?.lastUpdated ?? undefined;
  const dateByTicker = new Map(scores?.rows.map((row) => [row.instrument.ticker, row.result.asOf]) ?? []);
  return entries([
    ...visible.map((path) => ({ path, lastModified: dataDate })),
    ...universe.map((item) => ({ path: `/company/${item.ticker}`, lastModified: dateByTicker.get(item.ticker) ?? dataDate })),
  ]);
}
