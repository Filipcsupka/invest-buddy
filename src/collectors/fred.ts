import { document, type CollectedDocument } from "./types";
import { getText } from "./http";

export async function collectFred(key: string, get = getText): Promise<CollectedDocument> {
  const series = "FEDFUNDS";
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${series}&api_key=${encodeURIComponent(key)}&file_type=json&sort_order=desc&limit=1`;
  const response = JSON.parse(await get(url)) as { observations?: { date: string; value: string }[] };
  const observation = response.observations?.[0];
  if (!observation || !/^\d{4}-\d{2}-\d{2}$/.test(observation.date) || !Number.isFinite(Number(observation.value))) throw new Error("FRED returned no numeric observation");
  return document({ source: "fred", symbol: null, docType: "FEDFUNDS observation",
    url: `https://fred.stlouisfed.org/series/${series}`, publishedAt: `${observation.date}T00:00:00Z`,
    body: `${series} ${observation.date}: ${observation.value}`, meta: { series, value: Number(observation.value) } });
}

/** FRED series the macro rules read. DGS10 is the daily 10-year Treasury yield. */
export const FRED_YIELD_SERIES = "DGS10";
export const fredSeriesUrl = (series: string) => `https://fred.stlouisfed.org/series/${series}`;
export interface FredObservation { date: string; value: number }
/** FRED lists newest first. Returns oldest first. A holiday or missing day is "." in FRED and is dropped. */
export function parseFredObservations(text: string): FredObservation[] {
  const response = JSON.parse(text) as { observations?: { date: string; value: string }[] };
  return (response.observations ?? [])
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date) && item.value !== "." && Number.isFinite(Number(item.value)))
    .map((item) => ({ date: item.date, value: Number(item.value) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
/**
 * Stores the last `limit` observations of one series as one document (meta.observations, oldest first). It is third-party data,
 * so display_allowed is false: the page may show a derived flag, never the numbers. The API key is not part of the stored url.
 */
export async function collectFredSeries(key: string, series: string, get = getText, limit = 40): Promise<CollectedDocument> {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${series}&api_key=${encodeURIComponent(key)}&file_type=json&sort_order=desc&limit=${limit}`;
  const observations = parseFredObservations(await get(url));
  const latest = observations.at(-1);
  if (!latest) throw new Error(`FRED returned no numeric observation for ${series}`);
  return document({ source: "fred", symbol: null, docType: `${series} observations`, url: fredSeriesUrl(series), publishedAt: `${latest.date}T00:00:00Z`,
    body: `${series} latest ${latest.date}. ${observations.length} observations from ${observations[0].date}.`,
    meta: { series, observations, display_allowed: false, license_note: "FRED series. Terms of the underlying data not checked; internal signal only. This product uses the FRED API but is not endorsed or certified by the Federal Reserve Bank of St. Louis." } });
}
