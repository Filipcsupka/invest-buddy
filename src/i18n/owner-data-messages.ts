import type { Locale } from "@/i18n";

const messages = {
  en: {
    title: "Private data", lede: "Stored EODHD observations, their dates, and collection status. For owner use only.",
    tickerTitle: "Ticker facts", tickerHint: "Open a ticker to inspect its stored source rows.", tickerLabel: "Ticker", open: "Open facts",
    source: "Source", records: "Rows", latest: "Latest date", usage: "API usage, last seven days", day: "Day", job: "Job", requests: "Requests", credits: "Estimated calls",
    exchanges: "Symbol master by exchange", active: "Active", total: "Total", universe: "Selected universe by exchange", list: "List", tickers: "Tickers",
    etfs: "EODHD ETF catalog", region: "Region", ter: "TER", aum: "AUM, USD millions", holdings: "Holdings", status: "Status", enriched: "Enriched", currency: "Currency",
    macro: "Regional macro", jobs: "Collector runs", started: "Started", ended: "Ended", details: "Counts", assets: "Market assets", assetClass: "Asset class", close: "Latest close", callLog: "EODHD call log", calls: "Calls",
    identity: "Listing and classification", bars: "Daily bars", fundamentals: "Revenue and share facts", eps: "EPS history", calendar: "Earnings calendar", catalysts: "Catalyst facts", insiders: "Insider transactions", documents: "News documents", actions: "Vendor splits", refresh: "Fundamentals refresh state",
    empty: "No stored EODHD rows yet.", back: "All private data", noTicker: "No stored ticker found.",
  },
  sk: {
    title: "Súkromné údaje", lede: "Uložené pozorovania EODHD, ich dátumy a stav zberu. Len pre vlastníka.",
    tickerTitle: "Údaje o akcii", tickerHint: "Otvorte ticker a pozrite si uložené záznamy so zdrojom.", tickerLabel: "Ticker", open: "Otvoriť údaje",
    source: "Zdroj", records: "Riadky", latest: "Posledný dátum", usage: "Využitie API za sedem dní", day: "Deň", job: "Úloha", requests: "Požiadavky", credits: "Odhad volaní",
    exchanges: "Register symbolov podľa burzy", active: "Aktívne", total: "Spolu", universe: "Vybraný okruh podľa burzy", list: "Zoznam", tickers: "Tickery",
    etfs: "Katalóg ETF z EODHD", region: "Región", ter: "TER", aum: "AUM, mil. USD", holdings: "Pozície", status: "Stav", enriched: "Obohatené", currency: "Mena",
    macro: "Regionálne makro", jobs: "Spustenia zberu", started: "Začiatok", ended: "Koniec", details: "Počty", assets: "Trhové aktíva", assetClass: "Trieda aktíva", close: "Posledná cena", callLog: "Záznam volaní EODHD", calls: "Volania",
    identity: "Kotácia a zaradenie", bars: "Denné ceny", fundamentals: "Tržby a počet akcií", eps: "História EPS", calendar: "Kalendár výsledkov", catalysts: "Fakty o katalyzátoroch", insiders: "Obchody insiderov", documents: "Správy", actions: "Splity od dodávateľa", refresh: "Stav obnovy fundamentov",
    empty: "Zatiaľ nie sú uložené údaje z EODHD.", back: "Všetky súkromné údaje", noTicker: "Ticker sa nenašiel.",
  },
} as const;
export const ownerDataMessages = (locale: Locale) => messages[locale];
