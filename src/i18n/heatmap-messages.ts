import type { Locale } from "./index";

/** Copy for the sector heat map. Kept apart from messages.ts so parallel branches do not collide. */
const en = {
  navLabel: "Sector map",
  metaTitle: "Sector map",
  metaDescription: "Tracked tickers grouped by sector, coloured by 1-month or 3-month price change or by the share of published rules met. Informational screening only.",
  title: "Sector map",
  lede: "The tracked tickers grouped by sector. Each tile shows its value as text and as a colour. Informational screening only.",
  metricLabel: "Colour by",
  metrics: { "1m": "1-month price change", "3m": "3-month price change", rules: "Share of rules met" },
  average: "Sector average",
  tickers: "{n} of {total} tickers with data",
  noValue: "no data",
  empty: "No tracked tickers yet.",
  sectorEmpty: "No data for this sector",
  legendTitle: "How to read the colours",
  legendPrice: "Blue tiles are up, orange tiles are down, and the sign (+ or −) is written on every tile. Stronger colour means a larger move. Grey means close to flat or no data.",
  legendRules: "Darker blue means a larger share of the rules with data are met. The percentage is written on every tile. Grey means no data.",
  note1m: "Change in closing price over the last 21 trading sessions.",
  note3m: "Change in closing price over the last 63 trading sessions.",
  noteRules: "Rules met out of the rules that had data for the ticker on its last score date.",
  scope: "Only tickers in the tracked universe appear. Prices come from the same daily series as the stock screen.",
  asOf: "Scores as of {date}",
};

const sk: typeof en = {
  navLabel: "Mapa sektorov",
  metaTitle: "Mapa sektorov",
  metaDescription: "Sledované tickery zoskupené podľa sektora, zafarbené podľa 1-mesačnej alebo 3-mesačnej zmeny ceny alebo podľa podielu splnených zverejnených pravidiel. Len informačný prehľad.",
  title: "Mapa sektorov",
  lede: "Sledované tickery zoskupené podľa sektora. Každá dlaždica ukazuje hodnotu textom aj farbou. Len informačný prehľad.",
  metricLabel: "Farba podľa",
  metrics: { "1m": "1-mesačná zmena ceny", "3m": "3-mesačná zmena ceny", rules: "Podiel splnených pravidiel" },
  average: "Priemer sektora",
  tickers: "{n} z {total} tickerov s údajmi",
  noValue: "bez údajov",
  empty: "Zatiaľ nie sú sledované žiadne tickery.",
  sectorEmpty: "Pre tento sektor nie sú údaje",
  legendTitle: "Ako čítať farby",
  legendPrice: "Modré dlaždice rástli, oranžové klesli a znamienko (+ alebo −) je napísané na každej dlaždici. Silnejšia farba znamená väčší pohyb. Sivá znamená takmer nulovú zmenu alebo chýbajúce údaje.",
  legendRules: "Tmavšia modrá znamená väčší podiel splnených pravidiel z tých, ktoré mali údaje. Percento je napísané na každej dlaždici. Sivá znamená chýbajúce údaje.",
  note1m: "Zmena záverečnej ceny za posledných 21 obchodných dní.",
  note3m: "Zmena záverečnej ceny za posledných 63 obchodných dní.",
  noteRules: "Splnené pravidlá z pravidiel, ktoré mali pre ticker údaje v dátume posledného skóre.",
  scope: "Zobrazené sú len tickery zo sledovaného zoznamu. Ceny pochádzajú z rovnakého denného radu ako prehľad akcií.",
  asOf: "Skóre k {date}",
};

export type HeatmapMessages = typeof en;
const catalog: Record<Locale, HeatmapMessages> = { en, sk };
export function getHeatmapMessages(locale: Locale): HeatmapMessages {
  return catalog[locale];
}
