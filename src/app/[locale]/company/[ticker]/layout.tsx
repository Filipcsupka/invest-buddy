import { JsonLd } from "@/components/json-ld";
import { instrumentUniverse, latestScores } from "@/data/store";
import { fill, getMessages, isLocale } from "@/i18n";
import { companyJsonLd } from "@/i18n/metadata";
import { tickerSeoText } from "@/seo/ticker-text";

export const dynamic = "force-dynamic";

/** Neutral structured data for a company page: page, dataset, breadcrumb. No ratings or advice markup. */
export default async function CompanyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string; ticker: string }> }) {
  const { locale, ticker } = await params;
  let data: object[] = [];
  if (isLocale(locale)) {
    try {
      const symbol = ticker.toUpperCase();
      const instrument = (await instrumentUniverse()).find((item) => item.ticker === symbol);
      if (instrument) {
        const scores = await latestScores();
        const result = scores.rows.find((row) => row.instrument.ticker === symbol)?.result;
        const asOf = result?.asOf ?? scores.lastUpdated;
        const m = getMessages(locale);
        const seo = tickerSeoText(locale, symbol, instrument.name, result ?? null);
        data = companyJsonLd(locale, symbol, instrument.name, asOf, seo?.description ?? fill(scores.sample ? m.meta.companyDescription : m.meta.companyDescriptionLive, { ticker: symbol }));
      }
    } catch {
      data = [];
    }
  }
  return (
    <>
      {data.length > 0 && <JsonLd data={data} />}
      {children}
    </>
  );
}
