import { RecordCard } from "@/components/record-parts";
import { congressTrades } from "@/db/congress";
import { fill, type Locale } from "@/i18n";
import { getFlowMessages } from "@/i18n/flow-messages";
import { CongressTable } from "./congress-table";

/**
 * Congressional disclosures for one US ticker, for a later company-page section. Owner-only data: render it only on a page that has
 * passed assertViewable(). Facts only; no state, score or call.
 */
export async function CongressTickerSection({ locale, ticker, limit = 20 }: { locale: Locale; ticker: string; limit?: number }) {
  const m = getFlowMessages(locale).congress;
  const symbol = ticker.toUpperCase().replace(/\.US$/, "");
  const trades = await congressTrades({ ticker: symbol, limit });
  const title = fill(m.tickerSection, { ticker: symbol });
  return <RecordCard id={`congress-${symbol.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} title={title} lede={m.tableNote} flush={trades.length > 0}>
    {trades.length === 0 ? <p className="rp-empty">{fill(m.tickerEmpty, { ticker: symbol })}</p> : <CongressTable locale={locale} trades={trades} ticker={symbol} label={title} />}
  </RecordCard>;
}
