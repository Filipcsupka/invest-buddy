import type { Locale } from "@/i18n";

const messages = {
  en: {
    title: "Private data", lede: "Stored market data observations, their dates, and collection status. For owner use only.",
    tickerTitle: "Ticker facts", tickerHint: "Open a ticker to inspect its stored source rows.", tickerLabel: "Ticker", open: "Open facts",
    source: "Source", records: "Rows", latest: "Latest date", usage: "API usage, last seven days", day: "Day", job: "Job", requests: "Requests", credits: "Estimated calls",
    exchanges: "Symbol master by exchange", exchange: "Exchange", active: "Active", total: "Total", universe: "Selected universe by exchange", list: "List", tickers: "Tickers", scored: "Scored", scoredOn: "Score date",
    etfs: "Market data ETF catalog", region: "Region", ter: "TER", aum: "AUM, USD millions", holdings: "Holdings", status: "Status", enriched: "Enriched", currency: "Currency",
    macro: "Regional macro", jobs: "Collector runs", started: "Started", ended: "Ended", details: "Counts", assets: "Market assets", assetClass: "Asset class", close: "Latest close", callLog: "Market data call log", calls: "Calls",
    identity: "Listing and classification", bars: "Daily bars", fundamentals: "Revenue and share facts", eps: "EPS history", calendar: "Earnings calendar", catalysts: "Catalyst facts", insiders: "Insider transactions", documents: "News documents", actions: "Vendor splits", refresh: "Fundamentals refresh state",
    empty: "No stored market data rows yet.", back: "All private data", noTicker: "No stored ticker found.",
    families: { "Symbols": "Symbols", "Daily bars": "Daily bars", "Revenue and shares": "Revenue and shares", "EPS history": "EPS history", "Earnings calendar": "Earnings calendar", "Catalyst facts": "Catalyst facts", "Insider lines": "Insider lines", "News documents": "News documents", "Regional macro": "Regional macro", "ETF catalog": "ETF catalog", "Market asset bars": "Market asset bars", "Vendor splits": "Vendor splits", "Fundamentals refresh": "Fundamentals refresh" },
  },
  sk: {
    title: "Súkromné údaje", lede: "Uložené trhové údaje, ich dátumy a stav zberu. Len pre vlastníka.",
    tickerTitle: "Údaje o akcii", tickerHint: "Otvorte ticker a pozrite si jeho uložené zdrojové záznamy.", tickerLabel: "Ticker", open: "Otvoriť údaje",
    source: "Zdroj", records: "Riadky", latest: "Posledný dátum", usage: "Využitie API za sedem dní", day: "Deň", job: "Úloha", requests: "Požiadavky", credits: "Odhad volaní",
    exchanges: "Register symbolov podľa burzy", exchange: "Burza", active: "Aktívne", total: "Spolu", universe: "Vybraný okruh podľa burzy", list: "Zoznam", tickers: "Tickery", scored: "Hodnotené", scoredOn: "Dátum skóre",
    etfs: "Katalóg ETF z trhových dát", region: "Región", ter: "TER", aum: "AUM, mil. USD", holdings: "Pozície", status: "Stav", enriched: "Doplnené", currency: "Mena",
    macro: "Regionálne makro", jobs: "Spustenia zberu", started: "Začiatok", ended: "Koniec", details: "Počty", assets: "Trhové aktíva", assetClass: "Trieda aktíva", close: "Posledná cena", callLog: "Záznam volaní trhových dát", calls: "Volania",
    identity: "Kotácia a zaradenie", bars: "Denné ceny", fundamentals: "Tržby a počet akcií", eps: "História EPS", calendar: "Kalendár výsledkov", catalysts: "Fakty o katalyzátoroch", insiders: "Obchody insiderov", documents: "Správy", actions: "Splity od dodávateľa", refresh: "Stav obnovy fundamentov",
    empty: "Zatiaľ tu nie sú žiadne uložené trhové údaje.", back: "Všetky súkromné údaje", noTicker: "Ticker sa nenašiel.",
    families: { "Symbols": "Symboly", "Daily bars": "Denné ceny", "Revenue and shares": "Tržby a počet akcií", "EPS history": "História EPS", "Earnings calendar": "Kalendár výsledkov", "Catalyst facts": "Fakty o katalyzátoroch", "Insider lines": "Obchody insiderov", "News documents": "Správy", "Regional macro": "Regionálne makro", "ETF catalog": "Katalóg ETF", "Market asset bars": "Ceny trhových aktív", "Vendor splits": "Splity od dodávateľa", "Fundamentals refresh": "Obnova fundamentov" },
  },
} as const;
export const ownerDataMessages = (locale: Locale) => messages[locale];
