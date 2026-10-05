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
