import type { Locale } from "./index";

/** Copy for the data status block. Kept apart from messages.ts so parallel branches do not collide. */
const en = {
  title: "Data status",
  note: "Newest stored date for each dataset behind this page. Informational only.",
  datasets: {
    prices: { label: "Prices", source: "End-of-day price feed" },
    fundamentals: { label: "Fundamentals", source: "SEC EDGAR financial statement data" },
    filings: { label: "Filings and 8-K", source: "SEC EDGAR" },
    insider: { label: "Insider Form 4", source: "SEC EDGAR" },
    macro: { label: "Macro series", source: "US government data series" },
    news: { label: "News", source: "News feeds" },
  },
  state: { current: "current", stale: "stale", none: "no data" },
  updated: "Updated {date}",
  coverageLabel: "Data coverage",
  coverage: "{known} of {total} core rules have data",
  coveragePoints: "{points} of {max} core points have data. Guard: {guard}.",
  level: { full: "Full", partial: "Partial", limited: "Limited", none: "None" },
  limitedNote: "Below the {percent}% coverage guard, so the score is flagged as incomplete data.",
  noScore: "No score yet, so there is no rule coverage to show.",
};

const sk: typeof en = {
  title: "Stav údajov",
  note: "Najnovší uložený dátum pre každú sadu údajov pre túto stránku. Len na informáciu.",
  datasets: {
    prices: { label: "Ceny", source: "Denný zdroj záverečných cien" },
    fundamentals: { label: "Fundamenty", source: "Finančné výkazy SEC EDGAR" },
    filings: { label: "Podania a 8-K", source: "SEC EDGAR" },
    insider: { label: "Insider Form 4", source: "SEC EDGAR" },
    macro: { label: "Makro údaje", source: "Časové rady vlády USA" },
    news: { label: "Správy", source: "Spravodajské zdroje" },
  },
  state: { current: "aktuálne", stale: "zastarané", none: "bez údajov" },
  updated: "Aktualizované {date}",
  coverageLabel: "Pokrytie údajmi",
  coverage: "{known} z {total} základných pravidiel má údaje",
  coveragePoints: "{points} z {max} základných bodov má údaje. Hranica: {guard}.",
  level: { full: "Úplné", partial: "Čiastočné", limited: "Obmedzené", none: "Žiadne" },
  limitedNote: "Pokrytie je pod hranicou {percent} %, preto je skóre označené ako založené na neúplných údajoch.",
  noScore: "Skóre zatiaľ nie je, preto nie je čo ukázať o pokrytí pravidiel.",
};

export type DataStatusMessages = typeof en;
const catalog: Record<Locale, DataStatusMessages> = { en, sk };
export function getDataStatusMessages(locale: Locale): DataStatusMessages {
  return catalog[locale];
}
