import type { MacroObservation } from "./macro-observations";

/** ECB euro foreign exchange reference rates, published once per TARGET working day around 16:00 CET. Data portal page: https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html */
export const ECB_PAGE = "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html";
export const ECB_DAILY_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
/** Last 90 days. */
export const ECB_HIST_90D_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";
/** Full history since 1999-01-04. */
export const ECB_HIST_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml";

/** Currency code to stored series id. Rate is units of the currency per 1 EUR. */
export const ECB_SERIES: Readonly<Record<string, string>> = { USD: "ECB_EURUSD", CZK: "ECB_EURCZK", GBP: "ECB_EURGBP" };
export const ECB_SERIES_IDS: readonly string[] = Object.values(ECB_SERIES);

/**
 * Parses the ECB eurofxref XML (daily, 90 day or full history) into observations for USD, CZK and GBP. Only dates the ECB
 * published are returned, so weekends and TARGET holidays stay empty. The ECB does not revise, so the vintage is the observation date.
 */
export function parseEcbFx(xml: string): MacroObservation[] {
  const out: MacroObservation[] = [];
  const days = /<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']\s*>([\s\S]*?)<\/Cube>/g;
  let any = false;
  for (let day = days.exec(xml); day; day = days.exec(xml)) {
    any = true;
    const [, date, body] = day;
    const rates = /<Cube\s+currency=["']([A-Z]{3})["']\s+rate=["']([0-9.]+)["']\s*\/>/g;
    for (let rate = rates.exec(body); rate; rate = rates.exec(body)) {
      const id = ECB_SERIES[rate[1]];
      const value = Number(rate[2]);
      if (id && Number.isFinite(value) && value > 0) out.push({ seriesId: id, obsDate: date, value, realtimeStart: date, sourceId: "ecb", sourceUrl: ECB_PAGE });
    }
  }
  if (!any) throw new Error("ECB reference rate XML has no dated Cube");
  return out.sort((a, b) => a.obsDate.localeCompare(b.obsDate) || a.seriesId.localeCompare(b.seriesId));
}
