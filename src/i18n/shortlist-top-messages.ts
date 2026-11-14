import type { Locale } from "@/i18n";
import type { Theme } from "@/universe/themes";
import type { LensStatus } from "@/engine/model-lens";

/** Copy for the top picks block and the model portfolio lens (S1, docs/shortlist.md). Informational wording only: no actions, no amounts. */
const copy = {
  en: {
    title: "Highest ranked by the rules",
    summary: "The first {n} of {kept} shortlist names. {candidates} names have the state {state} today.",
    lede: "Ordered by the published shortlist rules. A name in a theme that the model portfolio already has above {cap}% is placed after the others. The rule state of each name stays the same.",
    orderBy: "Order decided by",
    first: "Highest ranked by the rules",
    placedByLens: "Placed after the names above: its theme is above the {cap}% cap in the model portfolio",
    theme: "Theme",
    lensTitle: "Model portfolio lens",
    lensLine: "Model portfolio: {themes}.",
    lensWiden: "The names here widen it with {themes}.",
    lensNoOver: "No named theme in the model portfolio is above {cap}%.",
    lensMissing: "No model portfolio snapshot is stored, so the shortlist order is shown unchanged.",
    lensSourcePublic: "From the public model portfolio of {date}. Weights are rounded to whole percent; no position sizes. Not personal investment advice.",
    lensSourceOwner: "From the stored IBKR snapshot of {date}, exact weights.",
    sectorOver: "Sector group {sector}: {weight} of the model portfolio, above {cap}%",
    status: {
      new: "{theme}: not in the model portfolio",
      below: "{theme}: {weight} of the model portfolio, cap {cap}%",
      over: "{theme}: {weight} of the model portfolio, above the {cap}% cap",
      uncapped: "{theme}: {weight} of the model portfolio, a mixed group with no cap",
      unknown: "Theme unknown, lens not assessed",
    } satisfies Record<LensStatus, string>,
    fullShortlist: "Full shortlist ({count})",
    allSetup: "All {state} names ({count})",
    more: "Open the full shortlist",
    empty: "No {state} name is left on the shortlist today.",
    themes: {
      "ai-semis": "AI and semiconductors", "cloud-software": "Cloud and software", cybersecurity: "Cybersecurity", robotics: "Robotics and automation",
      healthcare: "Healthcare and biotech", fintech: "Fintech", "energy-ev": "Energy and EV", industrials: "Industrials", consumer: "Consumer", other: "Other",
      unknown: "Unknown theme",
    } satisfies Record<Theme, string>,
  },
  sk: {
    title: "Najvyššie podľa pravidiel",
    summary: "Prvých {n} z {kept} firiem užšieho výberu. Stav {state} má dnes {candidates} firiem.",
    lede: "Poradie podľa zverejnených pravidiel užšieho výberu. Firma z témy, ktorú modelové portfólio už má nad {cap} %, je zaradená za ostatné. Stav pravidiel každej firmy sa nemení.",
    orderBy: "Poradie určilo",
    first: "Najvyššie podľa pravidiel",
    placedByLens: "Zaradená za firmy uvedené vyššie: jej téma je v modelovom portfóliu nad limitom {cap} %",
    theme: "Téma",
    lensTitle: "Pohľad modelového portfólia",
    lensLine: "Modelové portfólio: {themes}.",
    lensWiden: "Firmy v tomto výbere ho rozširujú o {themes}.",
    lensNoOver: "Žiadna pomenovaná téma v modelovom portfóliu nie je nad {cap} %.",
    lensMissing: "Snímka modelového portfólia nie je uložená, preto je poradie užšieho výberu zobrazené bez zmeny.",
    lensSourcePublic: "Podľa verejného modelového portfólia k {date}. Váhy sú zaokrúhlené na celé percentá, bez veľkosti pozícií. Nejde o osobné investičné poradenstvo.",
    lensSourceOwner: "Podľa uloženej snímky IBKR k {date}, presné váhy.",
    sectorOver: "Skupina sektorov {sector}: {weight} modelového portfólia, nad {cap} %",
    status: {
      new: "{theme}: nie je v modelovom portfóliu",
      below: "{theme}: {weight} modelového portfólia, limit {cap} %",
      over: "{theme}: {weight} modelového portfólia, nad limitom {cap} %",
      uncapped: "{theme}: {weight} modelového portfólia, zmiešaná skupina bez limitu",
      unknown: "Téma nie je známa, pohľad sa nevyhodnotil",
    } satisfies Record<LensStatus, string>,
    fullShortlist: "Celý užší výber ({count})",
    allSetup: "Všetky firmy v stave {state} ({count})",
    more: "Otvoriť celý užší výber",
    empty: "Dnes v užšom výbere nezostala žiadna firma v stave {state}.",
    themes: {
      "ai-semis": "AI a polovodiče", "cloud-software": "Cloud a softvér", cybersecurity: "Kybernetická bezpečnosť", robotics: "Robotika a automatizácia",
      healthcare: "Zdravotníctvo a biotech", fintech: "Fintech", "energy-ev": "Energetika a elektromobily", industrials: "Priemysel", consumer: "Spotreba", other: "Ostatné",
      unknown: "Neznáma téma",
    } satisfies Record<Theme, string>,
  },
} as const;

export type ShortlistTopMessages = (typeof copy)["en"];
export const getShortlistTopMessages = (locale: Locale): ShortlistTopMessages => copy[locale] as unknown as ShortlistTopMessages;
export const themeLabel = (locale: Locale, theme: Theme): string => copy[locale].themes[theme];
