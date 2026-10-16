import type { Locale } from "./index";

/**
 * Copy for the landing page sections added by the redesign. The headline, the build and status explanations and the record text stay in
 * messages.ts (`home`), and the waitlist copy in launch-messages.ts. No price, no return claim, no urgency (ADR-001, docs/wording-gate.md).
 * Slovak text needs the native review (W23).
 */
const en = {
  specimen: {
    title: "Rule by rule, {ticker}",
    sampleNote: "Sample ticker. Every figure on this sheet is sample data.",
    liveNote: "Today's first ticker, read from the same rules as every other.",
    session: "Session",
    sector: "Sector",
    scoreNote: "{known} of {total} core rules had data",
  },
  weights: {
    groupPoints: "{points} points",
    coreTag: "Core",
    bonusTag: "Bonus",
    methodLink: "Read every threshold",
    rulesCount: "{n} rules",
  },
  states: {
    count: "{n} today",
    countLabel: "Tickers in this state today",
    link: "How the status works",
  },
  hero: {
    boardTitle: "Highest scores today",
    boardSample: "Highest scores in the sample",
    colScore: "Score",
    all: "See all {n} tickers",
    noteFree: "Free to read in the beta",
    noteRules: "Every rule shown",
    noteMisses: "Misses stay in the record",
  },
  steps: {
    label: "Step {n}",
    one: { title: "Collect the data", body: "Prices, fundamentals, insider filings and macro flags are stored for each ticker with the date they were read." },
    two: { title: "Check {n} published rules", body: "Each rule is a yes, a no or no data. No data stays out of the percentage and is not counted as a miss." },
    three: { title: "Read one status", body: "The points with data become a percentage, and the percentage maps to one of six states." },
    more: "{n} more rules",
    noData: "No data",
  },
  working: {
    title: "Every score shows its working",
    body: "Open a ticker and see each rule, the value it read and the points it earned. Where data is missing, the page says so.",
  },
  tiers: {
    title: "What is free and what would be paid",
    lede: "Nothing is for sale in the beta. This is the split we plan to keep.",
    freeHeading: "Free",
    paidHeading: "Paid, planned",
    free: [
      "Every ticker, with its status, score and rules",
      "The method, with each threshold written out",
      "The whole track record, misses included",
      "The daily state changes on Telegram",
    ],
    paidNote: "More history, finer filters and personal tools. The rules and the scores do not change.",
    lockTitle: "Example of a paid section",
    link: "See the full comparison",
  },
  proof: {
    title: "Built for Slovak and Czech investors",
    lede: "The whole site reads in Slovak and in English, with the same rules and the same numbers. Decimals and dates follow the language.",
    languageEn: "English",
    languageSk: "Slovak",
    ruleCaption: "The same rule, in both languages",
  },
  close: {
    title: "Read a score with its working",
    body: "Open any ticker and see which rules it met, which it missed and the data each one read.",
  },
};

export type LandingMessages = typeof en;

const sk: LandingMessages = {
  specimen: {
    title: "Pravidlo po pravidle, {ticker}",
    sampleNote: "Ukážkový ticker. Každé číslo na tomto liste je ukážkový údaj.",
    liveNote: "Prvý ticker dnešného dňa, čítaný podľa rovnakých pravidiel ako všetky ostatné.",
    session: "Zasadnutie",
    sector: "Sektor",
    scoreNote: "{known} z {total} hlavných pravidiel malo údaje",
  },
  weights: {
    groupPoints: "{points} bodov",
    coreTag: "Hlavné",
    bonusTag: "Bonus",
    methodLink: "Prečítať každý prah",
    rulesCount: "Pravidlá: {n}",
  },
  states: {
    count: "Dnes: {n}",
    countLabel: "Tickery v tomto stave dnes",
    link: "Ako funguje stav",
  },
  hero: {
    boardTitle: "Najvyššie skóre dnes",
    boardSample: "Najvyššie skóre v ukážke",
    colScore: "Skóre",
    all: "Zobraziť všetky tickery: {n}",
    noteFree: "V bete zadarmo na čítanie",
    noteRules: "Každé pravidlo viditeľné",
    noteMisses: "Chyby zostávajú v zázname",
  },
  steps: {
    label: "Krok {n}",
    one: { title: "Zozbierať údaje", body: "Ceny, fundamenty, podania insiderov a makro príznaky sa ukladajú ku každému tickeru s dátumom, kedy boli načítané." },
    two: { title: "Skontrolovať {n} zverejnených pravidiel", body: "Každé pravidlo je áno, nie alebo bez údajov. Chýbajúce údaje zostávajú mimo percenta a nepočítajú sa ako chyba." },
    three: { title: "Prečítať jeden stav", body: "Body s údajmi sa premenia na percento a percento určí jeden zo šiestich stavov." },
    more: "Ďalších pravidiel: {n}",
    noData: "Bez údajov",
  },
  working: {
    title: "Každé skóre ukazuje svoj postup",
    body: "Otvorte ticker a uvidíte každé pravidlo, hodnotu, ktorú načítalo, a body, ktoré získalo. Kde údaje chýbajú, stránka to povie.",
  },
  tiers: {
    title: "Čo je zadarmo a čo by bolo platené",
    lede: "V bete nie je nič v predaji. Toto je rozdelenie, ktoré plánujeme zachovať.",
    freeHeading: "Zadarmo",
    paidHeading: "Platené, plánované",
    free: [
      "Každý ticker so stavom, skóre a pravidlami",
      "Metodika s každým prahom",
      "Celý záznam signálov vrátane tých nepodarených",
      "Denné zmeny stavu na Telegrame",
    ],
    paidNote: "Dlhšia história, jemnejšie filtre a osobné nástroje. Pravidlá a skóre sa nemenia.",
    lockTitle: "Príklad platenej sekcie",
    link: "Pozrieť celé porovnanie",
  },
  proof: {
    title: "Vytvorené pre slovenských a českých investorov",
    lede: "Celý web je po slovensky aj po anglicky, s rovnakými pravidlami a číslami. Desatinné čísla a dátumy sa riadia jazykom.",
    languageEn: "Anglicky",
    languageSk: "Slovensky",
    ruleCaption: "To isté pravidlo v oboch jazykoch",
  },
  close: {
    title: "Čítajte skóre aj s postupom",
    body: "Otvorte ľubovoľný ticker a pozrite sa, ktoré pravidlá splnil, ktoré nie a z akých údajov každé vychádzalo.",
  },
};

const catalog: Record<Locale, LandingMessages> = { en, sk };
export const getLandingMessages = (locale: Locale): LandingMessages => catalog[locale];
