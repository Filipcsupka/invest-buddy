import type { Locale } from "./index";

const copy = {
  en: { stocksTitle: "Stocks", marketsCalendar: "Markets & calendar", calendar: "Calendar", myPortfolioSoon: "My portfolio (connect your broker)" },
  sk: { stocksTitle: "Akcie", marketsCalendar: "Trhy a kalendár", calendar: "Kalendár", myPortfolioSoon: "Moje portfólio (prepojenie s brokerom)" },
} as const;

export function getNavSectionsMessages(locale: Locale) { return copy[locale]; }
