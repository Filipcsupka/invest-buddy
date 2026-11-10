import type { Locale } from "./index";

/** The ranked score strip on the dashboard. Counts and names come from the stored scores; the text only labels them. */
const en = {
  title: "Highest scores at a glance",
  note: "The {n} best-scoring of {total} names in the latest scan, coloured by rule state. A score is the share of rule points met, not a forecast.",
  all: "All names are in the table below",
  ariaItem: "{ticker}, {state}, {score}",
};
const sk = {
  title: "Najvyššie skóre na prvý pohľad",
  note: "{n} najlepšie hodnotených z {total} spoločností v poslednom skene, zafarbených podľa stavu pravidiel. Skóre je podiel splnených bodov pravidiel, nie predpoveď.",
  all: "Všetky spoločnosti sú v tabuľke nižšie",
  ariaItem: "{ticker}, {state}, {score}",
};
export function getScoreStripMessages(locale: Locale) {
  return locale === "sk" ? sk : en;
}
