import type { Locale } from "./index";

/**
 * Copy added by the company page redesign. Kept apart from messages.ts so parallel page work does not collide.
 * ADR-001: describes rules and data only, no instruction to act on a security.
 */
const en = {
  rulesLede: "Each row shows what the rule needs, the value it found and the points it adds. A rule without data adds nothing and is not counted as a miss.",
  rejectionLede: "Any one of these sets the status to Criteria broken, whatever the percentage.",
  checkColumns: { check: "Check", triggers: "Triggers when", value: "Value", result: "Result" },
  rejectionTable: "Rejection checks for {ticker}",
  rulesTable: "Rules for {ticker}",
  dataStatusTitle: "Data behind this page",
  zoneTag: "Dip zone",
  paidNote: {
    "score-history": "Admin view: history beyond {days} is in the paid tier",
    "idea-card": "Admin view: the idea card is in the paid tier",
  },
};

export type CompanyMessages = typeof en;

const sk: CompanyMessages = {
  rulesLede: "Každý riadok ukazuje, čo pravidlo vyžaduje, akú hodnotu našlo a koľko bodov pridáva. Pravidlo bez údajov nepridá nič a nepočíta sa ako nesplnené.",
  rejectionLede: "Ktorákoľvek z týchto kontrol nastaví stav Kritériá porušené bez ohľadu na percento.",
  checkColumns: { check: "Kontrola", triggers: "Spustí sa, keď", value: "Hodnota", result: "Výsledok" },
  rejectionTable: "Vyraďovacie kontroly pre {ticker}",
  rulesTable: "Pravidlá pre {ticker}",
  dataStatusTitle: "Údaje za touto stránkou",
  zoneTag: "Pásmo poklesu",
  paidNote: {
    "score-history": "Pohľad administrátora: história staršia než {days} je v platenej úrovni",
    "idea-card": "Pohľad administrátora: karta nápadu je v platenej úrovni",
  },
};

const catalog: Record<Locale, CompanyMessages> = { en, sk };
export const getCompanyMessages = (locale: Locale): CompanyMessages => catalog[locale];
