import { fill, plural, type Locale } from "./index";
import type { Plural } from "./messages";
import type { TierId } from "@/config/tiers";

/**
 * Lock card, badge and depth-note copy for the tiers (docs/tier-map.md). Kept apart from messages.ts so parallel branches do not collide.
 * Wording follows ADR-001 and docs/wording-gate.md: describe what is behind the lock, give no instruction to act on a security.
 * `teaser` has one line per paid id; `limit` has the depth note for ids with a limit. Placeholders: {n} count, {days} day phrase.
 */
const en = {
  badge: "Paid",
  badgeHint: "This part is in the paid tier. You see it because you are an admin.",
  lockTitle: "In the paid tier",
  lockSuffix: "The status, score and rules stay open to everyone.",
  previewNote: "Preview of the free tier (?view=free).",
  days: { one: "{n} day", few: "{n} days", many: "{n} days", other: "{n} days" } as Plural,
  teaser: {
    "scanner-rows-full": "More result rows.",
    "scanner-filters-advanced": "Filters for score range, minimum F, T and M, source and held names, and sorting by F, T or M.",
    "scanner-streak": "How many days each ticker has met its rules, and how many gained or lost rules.",
    "insiders-history": "Insider events older than the free window.",
    "ideas-list": "The list of ideas with their evidence.",
    "idea-card": "The full idea card for this ticker, with its evidence and sources.",
    "score-history": "The score history beyond the free window.",
    "track-record-periods": "The track record split by period.",
    "track-record-worst": "The list of the weakest stored outcomes. The summary above still names the worst one.",
    "track-record-signals": "The table of dated signals and their forward returns.",
    "track-record-history": "Score snapshots for earlier scan days.",
    "discovery-list": "New names found beyond the fixed screen.",
    "saved-screens": "More saved screens.",
    watchlist: "A longer watchlist.",
    "alerts-daily": "Daily alerts when a ticker changes state, for more tickers.",
    "csv-export": "Download of the table as a CSV file.",
  } as Partial<Record<TierId, string>>,
  limit: {
    "scanner-rows-full": "The free tier shows the first {n} rows. The rest are in the paid tier.",
    "insiders-history": "The free tier shows events from the last {days}. Older events are in the paid tier.",
    "score-history": "The free tier shows the last {days}. The rest of the history is in the paid tier.",
    "track-record-history": "The free tier shows the latest scan day. Earlier days are in the paid tier.",
    "saved-screens": "The free tier keeps {n} saved screens.",
    watchlist: "The free tier keeps {n} tickers on a watchlist.",
    "alerts-daily": "The free tier allows alerts for {n} tickers.",
  } as Partial<Record<TierId, string>>,
};

export type TierMessages = typeof en;

const sk: TierMessages = {
  badge: "Platené",
  badgeHint: "Táto časť patrí do platenej úrovne. Vidíte ju, lebo ste administrátor.",
  lockTitle: "V platenej úrovni",
  lockSuffix: "Stav, skóre a pravidlá zostávajú otvorené pre všetkých.",
  previewNote: "Náhľad bezplatnej úrovne (?view=free).",
  days: { one: "{n} deň", few: "{n} dni", many: "{n} dňa", other: "{n} dní" },
  teaser: {
    "scanner-rows-full": "Ďalšie riadky výsledkov.",
    "scanner-filters-advanced": "Filtre podľa rozsahu skóre, minima F, T a M, zdroja a držaných titulov a triedenie podľa F, T alebo M.",
    "scanner-streak": "Koľko dní každý titul spĺňa svoje pravidlá a koľko pravidiel pribudlo alebo ubudlo.",
    "insiders-history": "Udalosti insiderov staršie než bezplatné okno.",
    "ideas-list": "Zoznam nápadov s dôkazmi.",
    "idea-card": "Úplná karta nápadu pre tento titul s dôkazmi a zdrojmi.",
    "score-history": "História skóre mimo bezplatného okna.",
    "track-record-periods": "Záznam výsledkov rozdelený podľa období.",
    "track-record-worst": "Zoznam najslabších uložených výsledkov. Súhrn vyššie najhorší výsledok stále uvádza.",
    "track-record-signals": "Tabuľka datovaných signálov a ich následných výnosov.",
    "track-record-history": "Snímky skóre z predchádzajúcich dní skenovania.",
    "discovery-list": "Nové tituly nájdené mimo pevného výberu.",
    "saved-screens": "Viac uložených filtrov.",
    watchlist: "Dlhší zoznam sledovaných titulov.",
    "alerts-daily": "Denné upozornenia na zmenu stavu titulu pre viac titulov.",
    "csv-export": "Stiahnutie tabuľky ako súboru CSV.",
  },
  limit: {
    "scanner-rows-full": "Počet riadkov v bezplatnej úrovni: {n}. Ostatné sú v platenej úrovni.",
    "insiders-history": "Bezplatná úroveň ukazuje udalosti za posledných {days}. Staršie sú v platenej úrovni.",
    "score-history": "Bezplatná úroveň ukazuje posledných {days}. Zvyšok histórie je v platenej úrovni.",
    "track-record-history": "Bezplatná úroveň ukazuje posledný deň skenovania. Skoršie dni sú v platenej úrovni.",
    "saved-screens": "Počet uložených filtrov v bezplatnej úrovni: {n}.",
    watchlist: "Počet sledovaných titulov v bezplatnej úrovni: {n}.",
    "alerts-daily": "Počet titulov s upozornením v bezplatnej úrovni: {n}.",
  },
};

const catalog: Record<Locale, TierMessages> = { en, sk };
export const getTierMessages = (locale: Locale): TierMessages => catalog[locale];

/** Lock card line for a paid id: what is behind the lock, an optional page detail such as a count, and the open-status note. */
export function lockBody(locale: Locale, id: TierId, detail?: string): string {
  const m = catalog[locale];
  return [m.teaser[id], detail, m.lockSuffix].filter(Boolean).join(" ");
}

/** Depth note for a limited id. `n` is the free limit from TIER_LIMITS; day-based notes get the plural day phrase. */
export function limitNote(locale: Locale, id: TierId, n: number | null): string {
  const template = catalog[locale].limit[id] ?? "";
  if (n === null) return "";
  return fill(template, { n, days: plural(locale, catalog[locale].days, n) });
}
