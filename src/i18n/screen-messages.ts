import type { Locale } from "./index";

/** Copy for the stock screen, scanner and sector map layouts. Kept apart from messages.ts so parallel branches do not collide. */
const en = {
  rank: "Rank",
  rankShort: "#",
  kpiHint: "Select a state to filter the lists below.",
  filters: "Filters",
  rulesPips: "{met} of {total} rules met",
  results: "Results",
};

const sk: typeof en = {
  rank: "Poradie",
  rankShort: "#",
  kpiHint: "Vyberte stav a zoznamy nižšie sa prefiltrujú.",
  filters: "Filtre",
  rulesPips: "Splnené pravidlá: {met} z {total}",
  results: "Výsledky",
};

export function getScreenMessages(locale: Locale) {
  return locale === "sk" ? sk : en;
}
