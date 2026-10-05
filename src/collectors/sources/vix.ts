import { defaultHttp, type RequestOptions, type SourceHttp } from "./client";
import { csvRows, LICENSES, PING_REQUEST, round, runPing, sourceDocument, type PingResult, type SourceContext, type SourceOutput } from "./common";

export const VIX_URL = "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv";
/** cdn.cboe.com answers 307 to this host. Any other redirect target is refused. */
export const VIX_REDIRECT: RequestOptions = { redirectHosts: ["cdn-api.cboe.com"], maxBytes: 5 * 1024 * 1024 };
export interface VixRow { date: string; close: number }
/** DATE is MM/DD/YYYY, oldest first. */
export function parseVix(text: string): VixRow[] {
  const rows = csvRows(text);
  const header = rows[0]?.map((cell) => cell.trim().toUpperCase());
  if (!header || header[0] !== "DATE" || !header.includes("CLOSE")) throw new Error("Cboe VIX: unexpected header");
  const close = header.indexOf("CLOSE");
  return rows.slice(1).flatMap((row) => {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(row[0] ?? "");
    const value = Number(row[close]);
    return match && Number.isFinite(value) && value > 0 ? [{ date: `${match[3]}-${match[1]}-${match[2]}`, close: value }] : [];
  });
}

export async function collectVix(ctx: SourceContext): Promise<SourceOutput> {
  const rows = parseVix(await ctx.http.get(VIX_URL, VIX_REDIRECT));
  const latest = rows.at(-1);
  if (!latest) throw new Error("Cboe VIX: no rows");
  const last = (n: number) => rows.slice(-n);
  const average20 = last(20).reduce((sum, row) => sum + row.close, 0) / last(20).length;
  const yearly = rows.filter((row) => row.date > `${Number(latest.date.slice(0, 4)) - 1}${latest.date.slice(4)}`);
  const week = rows.at(-6);
  return { facts: [], documents: [sourceDocument({ source: "cboe", symbol: null, docType: "VIX close", url: "https://www.cboe.com/tradable_products/vix/vix_historical_data/#VIX", publishedAt: `${latest.date}T00:00:00Z`,
    body: `VIX close ${latest.date}: ${latest.close}. 5 trading days earlier: ${week ? week.close : "n/a"}. 20 day average ${round(average20)}. 52 week range ${Math.min(...yearly.map((row) => row.close))} to ${Math.max(...yearly.map((row) => row.close))}.`,
    meta: { close: latest.close, date: latest.date, average20: round(average20), recent: last(5) } }, LICENSES.cboe)] };
}

export const ping = (http: SourceHttp = defaultHttp()): Promise<PingResult> => runPing("vix", async () => {
  const rows = parseVix(await http.get(VIX_URL, { ...PING_REQUEST, ...VIX_REDIRECT }));
  const latest = rows.at(-1);
  if (!latest) throw new Error("no rows");
  return `${rows.length} rows, last ${latest.date} close ${latest.close}`;
});
