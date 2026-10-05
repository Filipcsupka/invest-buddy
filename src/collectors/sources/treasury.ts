import { defaultHttp, type SourceHttp } from "./client";
import { LICENSES, parseJson, PING_REQUEST, runPing, sourceDocument, type PingResult, type SourceContext, type SourceOutput } from "./common";

export const ratesUrl = (size: number) => `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?sort=-record_date&page%5Bsize%5D=${size}&filter=security_desc:in:(Treasury%20Notes,Treasury%20Bills,Treasury%20Bonds)&fields=record_date,security_desc,avg_interest_rate_amt`;
export const RATES_URL = ratesUrl(6);
export interface AverageRate { date: string; security: string; rate: number }
/** Monthly average interest rate on marketable debt outstanding, by security type. */
export function parseRates(text: string): AverageRate[] {
  const body = parseJson<{ data?: { record_date?: string; security_desc?: string; avg_interest_rate_amt?: string }[] }>(text, "FiscalData");
  if (!Array.isArray(body.data)) throw new Error("FiscalData: no data array");
  return body.data.flatMap((row) => {
    const rate = Number(row.avg_interest_rate_amt);
    return row.record_date && /^\d{4}-\d{2}-\d{2}$/.test(row.record_date) && row.security_desc && Number.isFinite(rate) ? [{ date: row.record_date, security: row.security_desc, rate }] : [];
  });
}

export async function collectTreasury(ctx: SourceContext): Promise<SourceOutput> {
  const rates = parseRates(await ctx.http.get(RATES_URL));
  const date = rates.map((row) => row.date).sort().at(-1);
  if (!date) throw new Error("FiscalData: no rows");
  const latest = rates.filter((row) => row.date === date), previous = rates.filter((row) => row.date < date);
  return { facts: [], documents: [sourceDocument({ source: "treasury", symbol: null, docType: "average interest rates", url: "https://fiscaldata.treasury.gov/datasets/average-interest-rates-treasury-securities/", publishedAt: `${date}T00:00:00Z`,
    body: `Average interest rate on Treasury debt, ${date}: ${latest.map((row) => `${row.security} ${row.rate}%`).join(", ")}.${previous.length ? ` Previous month: ${previous.filter((row) => row.date === previous[0].date).map((row) => `${row.security} ${row.rate}%`).join(", ")}.` : ""}`,
    meta: { date, rates: Object.fromEntries(latest.map((row) => [row.security, row.rate])) } }, LICENSES.treasury)] };
}

export const ping = (http: SourceHttp = defaultHttp()): Promise<PingResult> => runPing("treasury", async () => {
  const rates = parseRates(await http.get(ratesUrl(1), PING_REQUEST));
  if (!rates.length) throw new Error("no rows");
  return `${rates[0].security} ${rates[0].rate}% on ${rates[0].date}`;
});
