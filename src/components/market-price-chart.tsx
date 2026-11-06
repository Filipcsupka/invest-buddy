import { Chart } from "./chart";
import type { Locale } from "@/i18n";
import type { OHLCV } from "@/engine";

/** Price-only version of the stock chart for indices, currency pairs and coins. */
export function MarketPriceChart({ bars, locale, name, count = 100 }: { bars: OHLCV[]; locale: Locale; name: string; count?: number }) {
  return <Chart bars={bars} locale={locale} count={count} dipZone={false} averages={false} labels={{
    name, aria: locale === "sk" ? `${name}: {count} dní, {first} až {last}` : `${name}: {count} days, {first} to {last}`,
    close: locale === "sk" ? "Cena" : "Price", ma50: "MA50", ma200: "MA200", dip: "", last: "{value}",
  }} />;
}
