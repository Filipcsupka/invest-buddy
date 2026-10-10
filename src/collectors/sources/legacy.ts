import { XMLParser } from "fast-xml-parser";
import { RSS_FEEDS } from "../rss";
import { defaultHttp, type SourceHttp } from "./client";
import { parseJson, PING_REQUEST, runPing, type PingResult, type Env } from "./common";

/** Pings for the phase A collectors. They call the same endpoints and parse the same shapes, but write nothing. */
const NVDA_SUBMISSIONS = "https://data.sec.gov/submissions/CIK0001045810.json";

export const pingEdgar = (http: SourceHttp = defaultHttp(), env: Env = process.env): Promise<PingResult> => runPing("edgar", async () => {
  const body = parseJson<{ filings?: { recent?: { form?: string[]; filingDate?: string[] } } }>(await http.get(NVDA_SUBMISSIONS, PING_REQUEST), "EDGAR submissions");
  const forms = body.filings?.recent?.form;
  if (!forms?.length) throw new Error("submissions has no filings.recent.form");
  return `${forms.length} recent filings, newest ${forms[0]} ${body.filings?.recent?.filingDate?.[0] ?? ""}`.trim();
}, { sec: true, env });

export const pingRss = (http: SourceHttp = defaultHttp()): Promise<PingResult> => runPing("rss", async () => {
  const results = await Promise.all(RSS_FEEDS.map(async (feed) => {
    try {
      const channel = new XMLParser({ ignoreAttributes: false }).parse(await http.get(feed.url, PING_REQUEST)).rss?.channel;
      const items = channel?.item ? (Array.isArray(channel.item) ? channel.item : [channel.item]) : [];
      if (!items.length) throw new Error("feed parsed but has no items");
      return { feed: feed.id, ok: true, text: `${feed.id} ${items.length} items` };
    } catch (error) { return { feed: feed.id, ok: false, text: `${feed.id} failed: ${error instanceof Error ? error.message : String(error)}` }; }
  }));
  // The source is healthy when at least one wire answers; a dead feed shows in the detail.
  if (!results.some((result) => result.ok)) throw new Error(results.map((result) => result.text).join("; "));
  return results.map((result) => result.text).join("; ");
});

export const pingFred = (http: SourceHttp = defaultHttp(), env: Env = process.env): Promise<PingResult> => runPing("fred", async () => {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=FEDFUNDS&api_key=${encodeURIComponent(env.FRED_API_KEY ?? "")}&file_type=json&sort_order=desc&limit=1`;
  const observation = parseJson<{ observations?: { date: string; value: string }[] }>(await http.get(url, PING_REQUEST), "FRED").observations?.[0];
  if (!observation || !Number.isFinite(Number(observation.value))) throw new Error("no numeric observation");
  return `FEDFUNDS ${observation.date} = ${observation.value}`;
}, { env, requires: { variable: "FRED_API_KEY" } });
