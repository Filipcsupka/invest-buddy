import type { CollectedDocument } from "../types";
import { defaultHttp, type SourceHttp } from "./client";
import { LICENSES, parseJson, PING_REQUEST, round, runPing, sourceDocument, type PingResult, type SourceContext, type SourceOutput } from "./common";

/** v1 needs no key and allows 25 queries per day. One run sends one query for all series. A ping uses one more. */
export const BLS_URL = "https://api.bls.gov/publicAPI/v1/timeseries/data/";
export const BLS_SERIES: Record<string, { name: string; yoy: boolean }> = {
  CUUR0000SA0: { name: "CPI-U all items, not seasonally adjusted (index)", yoy: true },
  LNS14000000: { name: "Unemployment rate, seasonally adjusted (percent)", yoy: false },
  CES0000000001: { name: "Total nonfarm employment, seasonally adjusted (thousands)", yoy: false },
};
export interface Observation { year: number; month: number; value: number }
export interface Series { id: string; observations: Observation[] }

/** Newest first, monthly rows only (M01 to M12). v1 returns "-" for values that are not available. */
export function parseSeries(text: string): Series[] {
  const body = parseJson<{ status?: string; message?: string[]; Results?: { series?: { seriesID: string; data: { year: string; period: string; value: string }[] }[] } }>(text, "BLS");
  if (body.status !== "REQUEST_SUCCEEDED") throw new Error(`BLS: ${body.status ?? "no status"}${body.message?.length ? ` (${body.message[0]})` : ""}`);
  return (body.Results?.series ?? []).map((series) => ({ id: series.seriesID, observations: series.data.flatMap((row) => {
    const month = /^M(0[1-9]|1[0-2])$/.exec(row.period)?.[1];
    const value = Number(row.value);
    return month && Number.isFinite(value) ? [{ year: Number(row.year), month: Number(month), value }] : [];
  }).sort((a, b) => b.year - a.year || b.month - a.month) }));
}

export const yearOverYear = (observations: Observation[]): number | null => {
  const [latest] = observations;
  const earlier = latest && observations.find((row) => row.year === latest.year - 1 && row.month === latest.month);
  return latest && earlier && earlier.value ? round((latest.value / earlier.value - 1) * 100) : null;
};
const period = (row: Observation) => `${row.year}-${String(row.month).padStart(2, "0")}`;

export async function collectBls(ctx: SourceContext): Promise<SourceOutput> {
  const year = ctx.now.getUTCFullYear();
  const series = parseSeries(await ctx.http.post(BLS_URL, { seriesid: Object.keys(BLS_SERIES), startyear: String(year - 1), endyear: String(year) }));
  const documents: CollectedDocument[] = [];
  for (const item of series) {
    const meta = BLS_SERIES[item.id];
    const [latest] = item.observations;
    if (!meta || !latest) continue;
    const yoy = meta.yoy ? yearOverYear(item.observations) : null;
    documents.push(sourceDocument({ source: "bls", symbol: null, docType: "BLS series", url: `https://data.bls.gov/timeseries/${item.id}`, publishedAt: `${period(latest)}-01T00:00:00Z`,
      body: `${meta.name}, ${item.id}: ${item.observations.slice(0, 6).map((row) => `${period(row)} ${row.value}`).join(", ")}${yoy === null ? "" : `. Year over year ${yoy}% in ${period(latest)}`}.`,
      meta: { series: item.id, latest: latest.value, period: period(latest), yearOverYearPercent: yoy } }, LICENSES.bls));
  }
  if (!documents.length) throw new Error("BLS: no usable series");
  return { documents, facts: [] };
}

export const ping = (http: SourceHttp = defaultHttp()): Promise<PingResult> => runPing("bls", async () => {
  const year = new Date().getUTCFullYear();
  const [series] = parseSeries(await http.post(BLS_URL, { seriesid: ["LNS14000000"], startyear: String(year), endyear: String(year) }, PING_REQUEST));
  if (!series?.observations.length) throw new Error("no monthly observations");
  return `${series.id} ${period(series.observations[0])} = ${series.observations[0].value} (uses 1 of 25 daily queries)`;
});
