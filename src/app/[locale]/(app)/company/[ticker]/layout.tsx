import { JsonLd } from "@/components/json-ld";
import { instrumentForTicker, scoreForTicker } from "@/data/store";
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
      const instrument = await instrumentForTicker(symbol);
      if (instrument) {
        const score = await scoreForTicker(symbol);
        const result = score.rows?.result;
        const asOf = result?.asOf ?? score.lastUpdated;
        const m = getMessages(locale);
        const seo = tickerSeoText(locale, symbol, instrument.name, result ?? null);
        data = companyJsonLd(locale, symbol, instrument.name, asOf, seo?.description ?? fill(score.sample ? m.meta.companyDescription : m.meta.companyDescriptionLive, { ticker: symbol }));
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
