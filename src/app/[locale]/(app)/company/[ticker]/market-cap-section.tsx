import { getViewer } from "@/viewer/get-viewer";
import type { Locale } from "@/i18n";
import { SectionHead } from "@/components/kit";
import { Chart } from "@/components/chart";
import { marketsViewable } from "@/markets/gate";
import { marketCapSeries, type MarketCapPoint } from "@/db/market-cap";
import { getMarketsMessages } from "@/i18n/markets-messages";

/**
 * The stored weekly market cap for the owner (MARKETS_VIEWS on and an owner session), or null for everyone else.
 * Without a request context it also returns null, so owner data never renders by accident.
 */
export async function ownerMarketCap(ticker: string): Promise<MarketCapPoint[] | null> {
  let viewable = false;
  try { viewable = marketsViewable(await getViewer()); } catch { /* No request context. */ }
  return viewable ? marketCapSeries(ticker) : null;
}

/** Weekly EODHD market cap in billions. Facts only: it is not a score input. */
export function MarketCapSection({ locale, ticker, series }: { locale: Locale; ticker: string; series: MarketCapPoint[] }) {
  const m = getMarketsMessages(locale).marketCap;
  const bars = series.map((point) => {
    const value = point.value / 1e9;
    return { date: point.date, open: value, high: value, low: value, close: value, volume: 0 };
  });
  return (
    <section className="co-card co-market-cap" aria-labelledby="market-cap" data-owner-only="">
      <SectionHead id="market-cap" title={m.title} lede={m.lede} rule="quiet" />
      {bars.length >= 2 ? (
        <Chart bars={bars} locale={locale} count={bars.length} dipZone={false} averages={false}
          labels={{ name: ticker, aria: m.chartAria, close: m.chartName, ma50: "MA50", ma200: "MA200", dip: "", last: "{value}" }} />
      ) : <p className="muted">{m.none}</p>}
    </section>
  );
}
