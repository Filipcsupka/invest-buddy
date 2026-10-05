import type { CollectedDocument } from "../types";
import { defaultHttp, type SourceHttp } from "./client";
import { csvRows, daysBefore, isoDate, LICENSES, parseJson, PING_REQUEST, round, runPing, sourceDocument, type PingResult, type SourceContext, type SourceOutput } from "./common";

export const FOMC_URL = "https://www.federalreserve.gov/json/calendar.json";
/** Data Download Program series for the H.15 Treasury constant maturity set (all maturities, daily). */
export const H15_URL = "https://www.federalreserve.gov/datadownload/Output.aspx?rel=H15&series=bf17364827e38702b42a58cf8eaa3f78&lastobs=15&from=&to=&filetype=csv&label=include&layout=seriescolumn";
export const H15_SERIES: Record<string, string> = { "RIFLGFCM03_N.B": "3M", "RIFLGFCY02_N.B": "2Y", "RIFLGFCY10_N.B": "10Y", "RIFLGFCY30_N.B": "30Y" };
const HORIZON_DAYS = 180;
const decode = (text: string) => text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#10;/g, " ");

export interface Meeting { date: string; text: string; time: string }
interface CalendarEvent { title?: string; type?: string; month?: string; days?: string; description?: string; time?: string }
/** The calendar file mixes speeches, statistics and FOMC items. Keep "FOMC Meeting" rows; `month` is YYYY-MM and `days` is the last day. */
export function parseMeetings(text: string): Meeting[] {
  const calendar = parseJson<{ events?: CalendarEvent[] }>(text, "Fed calendar");
  if (!Array.isArray(calendar.events)) throw new Error("Fed calendar: no events array");
  const out: Meeting[] = [];
  for (const event of calendar.events) {
    if (event.type !== "FOMC" || !/^\s*FOMC meeting\s*$/i.test(event.title ?? "") || !/^\d{4}-\d{2}$/.test(event.month ?? "") || !/^\d{1,2}$/.test(event.days ?? "")) continue;
    out.push({ date: `${event.month}-${String(event.days).padStart(2, "0")}`, time: event.time ?? "", text: decode(event.description ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface YieldRow { date: string; values: Record<string, number> }
/** H.15 CSV: five metadata rows, then "Time Period" header, then one row per day. "ND" means no data that day. */
export function parseH15(text: string): YieldRow[] {
  const rows = csvRows(text);
  const header = rows.find((row) => row[0] === "Time Period");
  if (!header) throw new Error("H.15: no Time Period header");
  const columns = header.map((id) => H15_SERIES[id]);
  const out: YieldRow[] = [];
  for (const row of rows.slice(rows.indexOf(header) + 1)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row[0])) continue;
    const values: Record<string, number> = {};
    columns.forEach((name, i) => { const value = Number(row[i]); if (name && row[i] !== "ND" && row[i] !== "" && Number.isFinite(value)) values[name] = value; });
    if (Object.keys(values).length) out.push({ date: row[0], values });
  }
  return out;
}

export async function collectFed(ctx: SourceContext): Promise<SourceOutput> {
  const documents: CollectedDocument[] = [];
  const today = isoDate(ctx.now), horizon = daysBefore(ctx.now, -HORIZON_DAYS);
  const meetings = parseMeetings(await ctx.http.get(FOMC_URL, { maxBytes: 5 * 1024 * 1024 })).filter((meeting) => meeting.date >= today && meeting.date <= horizon);
  documents.push(sourceDocument({ source: "fed", symbol: null, docType: "FOMC calendar", url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", publishedAt: `${today}T00:00:00Z`,
    body: meetings.length ? `Upcoming FOMC meetings (decision day): ${meetings.map((meeting) => `${meeting.date}${meeting.text ? ` (${meeting.text})` : ""}`).join("; ")}.` : `No FOMC meetings listed in the next ${HORIZON_DAYS} days.`,
    meta: { meetings: meetings.map((meeting) => meeting.date), horizonDays: HORIZON_DAYS } }, LICENSES.fed));
  const yields = parseH15(await ctx.http.get(H15_URL));
  const latest = yields.at(-1);
  if (!latest) throw new Error("H.15: no observations");
  const spread = latest.values["10Y"] !== undefined && latest.values["2Y"] !== undefined ? round(latest.values["10Y"] - latest.values["2Y"]) : null;
  documents.push(sourceDocument({ source: "fed", symbol: null, docType: "H.15 Treasury yields", url: "https://www.federalreserve.gov/releases/h15/#treasury-constant-maturity", publishedAt: `${latest.date}T00:00:00Z`,
    body: `H.15 Treasury constant maturity yields, ${latest.date}: ${Object.entries(latest.values).map(([name, value]) => `${name} ${value}%`).join(", ")}${spread === null ? "" : `; 10Y minus 2Y ${spread} pp`}. Recent 10Y: ${yields.slice(-5).map((row) => `${row.date} ${row.values["10Y"] ?? "n/a"}`).join(", ")}.`,
    meta: { latest: latest.values, date: latest.date, spread10y2y: spread } }, LICENSES.fed));
  return { documents, facts: [] };
}

export const ping = (http: SourceHttp = defaultHttp()): Promise<PingResult> => runPing("fed", async () => {
  const yields = parseH15(await http.get(H15_URL, PING_REQUEST));
  const latest = yields.at(-1);
  if (!latest?.values["10Y"]) throw new Error("no 10Y observation");
  return `H.15 ${latest.date}: 10Y ${latest.values["10Y"]}%`;
});
