import type { Plural } from "./messages";
import type { Locale } from "./index";

/**
 * Owner-only copy for the research card and the owner research page (P7): next catalyst, next macro event, graduation line and
 * estimate revision. Kept apart from messages.ts so parallel branches do not collide. Size tiers and estimate revisions are owner
 * side under ADR-001 and docs/wording-gate.md; nothing here is rendered on a public route.
 */
const en = {
  title: "Dates and next tier",
  nextCatalyst: "Next catalyst: {event}",
  noCatalyst: "Next catalyst: none in the stored calendar",
  earnings: "earnings report {date}{time} ({when})",
  time: { "pre-market": ", before the open", "post-market": ", after the close" },
  research: "{kind} {date} ({when}): {claim}",
  unconfirmed: "unconfirmed",
  stale: "calendar date may be out of date",
  moved: "moved from {date}",
  today: "today",
  days: { one: "in {n} day", few: "in {n} days", many: "in {n} days", other: "in {n} days" } as Plural,
  sessions: { one: "in {n} session", few: "in {n} sessions", many: "in {n} sessions", other: "in {n} sessions" } as Plural,
  macro: "Next macro event: {events}",
  noMacro: "Next macro event: none in the stored calendar",
  macroEvent: "{label} {date} ({when})",
  macroKinds: { CPI: "CPI release", PPI: "PPI release", NFP: "Jobs report", FOMC: "FOMC decision", EARNINGS: "Earnings" },
  graduation: "Next tier: {tier} needs {conditions}.",
  noGraduation: "Next tier: none for the current signal",
  tiers: { STANDARD: "Standard", FULL: "Full" },
  score: "score {needed} of {evidenced} (now {total})",
  rating: "{group} {need} ({details})",
  ratingNow: "now {have}, {points} of {max} points",
  short: "{n} short",
  open: "open: {rules}",
  ruleMissing: "{rule} +{points}",
  ruleCarried: "{rule} on fresh data",
  narrative: "a confirmed narrative change lowers it one step",
  execution: "a fresh confirmed EPS beat or guidance raise",
  freshData: "fresh data for {fields}",
  carried: "{field} (carried from {date})",
  keyFields: "the key fields",
  groups: { company: "company", catalyst: "catalyst" },
  ratings: { Weak: "Weak", Neutral: "Neutral", Good: "Good", Strong: "Strong", "Very strong": "Very strong" },
  rules: {
    "revenue-acceleration": "revenue acceleration", earnings: "EPS beat or guidance raise", catalyst: "product catalyst",
    accumulation: "insider or institutional buying",
  } as Record<string, string>,
  revision: "Estimate revision, not scored: report {date}, {estimate}; {windows}. {source}.",
  noRevision: "Estimate revision: no stored estimate for the next report",
  estimate: "EPS estimate {value}",
  noEstimate: "no EPS estimate",
  window: "{days}d {change}",
  notAvailable: "n/a",
};

type OwnerResearchMessages = typeof en;

const sk: OwnerResearchMessages = {
  title: "Termíny a ďalší stupeň",
  nextCatalyst: "Najbližší katalyzátor: {event}",
  noCatalyst: "Najbližší katalyzátor: v uloženom kalendári žiadny",
  earnings: "výsledky {date}{time} ({when})",
  time: { "pre-market": ", pred otvorením trhu", "post-market": ", po zatvorení trhu" },
  research: "{kind} {date} ({when}): {claim}",
  unconfirmed: "nepotvrdené",
  stale: "termín v kalendári môže byť zastaraný",
  moved: "presunuté z {date}",
  today: "dnes",
  days: { one: "o {n} deň", few: "o {n} dni", many: "o {n} dňa", other: "o {n} dní" } as Plural,
  sessions: { one: "o {n} obchodný deň", few: "o {n} obchodné dni", many: "o {n} obchodného dňa", other: "o {n} obchodných dní" } as Plural,
  macro: "Najbližšia makro udalosť: {events}",
  noMacro: "Najbližšia makro udalosť: v uloženom kalendári žiadna",
  macroEvent: "{label} {date} ({when})",
  macroKinds: { CPI: "Zverejnenie CPI", PPI: "Zverejnenie PPI", NFP: "Správa o zamestnanosti", FOMC: "Rozhodnutie FOMC", EARNINGS: "Výsledky" },
  graduation: "Ďalší stupeň: {tier} vyžaduje {conditions}.",
  noGraduation: "Ďalší stupeň: pri aktuálnom signáli žiadny",
  tiers: { STANDARD: "Štandardný", FULL: "Plný" },
  score: "skóre {needed} z {evidenced} (teraz {total})",
  rating: "{group} {need} ({details})",
  ratingNow: "teraz {have}, {points} z {max} bodov",
  short: "chýba {n}",
  open: "otvorené: {rules}",
  ruleMissing: "{rule} +{points}",
  ruleCarried: "{rule} na čerstvých údajoch",
  narrative: "potvrdená zmena príbehu ho znižuje o stupeň",
  execution: "čerstvé potvrdené prekonanie EPS alebo zvýšenie výhľadu",
  freshData: "čerstvé údaje pre {fields}",
  carried: "{field} (prenesené z {date})",
  keyFields: "kľúčové polia",
  groups: { company: "hodnotenie firmy", catalyst: "hodnotenie katalyzátora" },
  ratings: { Weak: "Slabé", Neutral: "Neutrálne", Good: "Dobré", Strong: "Silné", "Very strong": "Veľmi silné" },
  rules: {
    "revenue-acceleration": "zrýchlenie tržieb", earnings: "prekonanie EPS alebo zvýšenie výhľadu", catalyst: "produktový katalyzátor",
    accumulation: "nákupy insiderov alebo inštitúcií",
  },
  revision: "Revízia odhadu, nebodované: výsledky {date}, {estimate}; {windows}. {source}.",
  noRevision: "Revízia odhadu: pre najbližšie výsledky nie je uložený odhad",
  estimate: "odhad EPS {value}",
  noEstimate: "bez odhadu EPS",
  window: "{days} d {change}",
  notAvailable: "nedostupné",
};

export const ownerResearchMessages = { en, sk } satisfies Record<Locale, OwnerResearchMessages>;
export type { OwnerResearchMessages };
