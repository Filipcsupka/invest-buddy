import type { Locale } from "./index";

const en = {
  summary: "Tickers by rule state",
  jump: "Show {count} {unit} in {state}",
  tickerOne: "ticker",
  tickerFew: "tickers",
  tickerMany: "tickers",
  setup: "72% or more; coverage at least 80%",
  watch: "60–71.9%; or higher with limited coverage",
  wait: "48–59.9% of covered core points",
  ignore: "Below 48% of covered core points",
  broken: "A rejection rule applies",
  insufficient: "Not enough inputs to score",
};

const sk: typeof en = {
  summary: "Tickery podľa stavu pravidiel",
  jump: "Zobraziť {count} {unit} v stave {state}",
  tickerOne: "ticker",
  tickerFew: "tickery",
  tickerMany: "tickerov",
  setup: "Aspoň 72 %; pokrytie aspoň 80 %",
  watch: "60 – 71,9 %; alebo viac pri nižšom pokrytí",
  wait: "48 – 59,9 % dostupných hlavných bodov",
  ignore: "Menej ako 48 % dostupných hlavných bodov",
  broken: "Platí vylučovacie pravidlo",
  insufficient: "Nedostatok vstupných údajov na hodnotenie",
};

export const getScannerBentoMessages = (locale: Locale) => locale === "sk" ? sk : en;
