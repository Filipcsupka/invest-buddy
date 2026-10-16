import type { Locale } from "./index";

/** Copy for the scanner liquidity and market-cap floor. Kept apart from messages.ts so parallel branches do not collide. English has one and many; Slovak has one, few (2 to 4) and many. */
const en = {
  result: "{count} of {total} tickers, floor applied",
  resultOff: "{count} of {total} tickers, floor off",
  remove: "Remove the floor",
  apply: "Apply the floor",
  rule: "Floor: average daily trading value of at least {volume} over {days} sessions, and market cap of at least {cap}. Tickers without these figures stay in the list.",
  hiddenOne: "{n} ticker is below the floor and hidden. Held tickers always show.",
  hiddenFew: "{n} tickers are below the floor and hidden. Held tickers always show.",
  hiddenMany: "{n} tickers are below the floor and hidden. Held tickers always show.",
  hiddenNone: "No ticker is below the floor.",
  ruleOff: "The floor is off, so thinly traded and small names show too. The floor is average daily trading value of at least {volume} and market cap of at least {cap}.",
  noData: "no data",
  noDataNote: "Floor figure missing: not enough price bars or no stored share count.",
  millions: "{n}M USD",
};

const sk: typeof en = {
  result: "{count} z {total} tickerov, filter likvidity použitý",
  resultOff: "{count} z {total} tickerov, filter likvidity vypnutý",
  remove: "Zrušiť filter likvidity",
  apply: "Použiť filter likvidity",
  rule: "Filter: priemerná denná obchodovaná hodnota aspoň {volume} za {days} dní a trhová kapitalizácia aspoň {cap}. Tickery bez týchto údajov zostávajú v zozname.",
  hiddenOne: "{n} ticker je pod filtrom a je skrytý. Držané tickery sa zobrazia vždy.",
  hiddenFew: "{n} tickery sú pod filtrom a sú skryté. Držané tickery sa zobrazia vždy.",
  hiddenMany: "{n} tickerov je pod filtrom a je skrytých. Držané tickery sa zobrazia vždy.",
  hiddenNone: "Žiadny ticker nie je pod filtrom.",
  ruleOff: "Filter je vypnutý, preto sa zobrazia aj málo obchodované a malé spoločnosti. Filter je priemerná denná obchodovaná hodnota aspoň {volume} a trhová kapitalizácia aspoň {cap}.",
  noData: "bez údajov",
  noDataNote: "Chýba údaj pre filter: málo cenových dní alebo žiadny uložený počet akcií.",
  millions: "{n} mil. USD",
};

export type ScannerFloorMessages = typeof en;
const catalog: Record<Locale, ScannerFloorMessages> = { en, sk };
export const getScannerFloorMessages = (locale: Locale): ScannerFloorMessages => catalog[locale];

/** Hidden-count sentence with plural forms. */
export function hiddenText(locale: Locale, n: number): string {
  const f = getScannerFloorMessages(locale);
  const template = n === 0 ? f.hiddenNone : n === 1 ? f.hiddenOne : locale === "sk" && n >= 2 && n <= 4 ? f.hiddenFew : f.hiddenMany;
  return template.replace("{n}", String(n));
}
