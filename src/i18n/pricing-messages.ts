import type { Locale } from "./index";
import type { Plural } from "./messages";
import type { TierId } from "@/config/tiers";

/**
 * Copy for the Free versus Paid comparison on /pricing. Kept apart from launch-messages.ts, whose test bans every digit, because the
 * depth limits here come from TIER_LIMITS and arrive as {n} and {days}. No price appears anywhere. Wording follows ADR-001: describe
 * what each tier shows, never tell a reader to act on a security. Slovak text needs the native review (W23).
 * `rows` has one entry per paid id in src/config/tiers.ts. A row with `free` and `paid` templates is a depth limit; the others are
 * locked in the free tier.
 */
type Row = { label: string; detail: string; free?: string; paid?: string };

const en = {
  compareTitle: "Free and paid, side by side",
  compareLede: "Everything is open while the site is in beta. This is the split we plan to keep: what stays free for everyone, and what a paid plan would add.",
  tableCaption: "Planned free and paid contents",
  colFeature: "Feature",
  colFree: "Free",
  colPaid: "Paid",
  included: "Included",
  notIncluded: "Not included",
  unlimited: "No limit",
  statusLive: "In the beta today",
  statusPlanned: "Not built yet",
  alwaysFreeTitle: "Always free",
  alwaysFreeLede: "The status, the score and the rules behind them stay open to everyone, so you can judge the screen before you decide anything.",
  alwaysFree: [
    "The method, with every rule and threshold written out",
    "Dashboard, heat map and scanner with every ticker, search, state and sector filters, the liquidity floor and basic presets",
    "Company page: status, score, rules checklist with thresholds, rejection checks, inputs, flags, data status and chart",
    "Score history and insider events for the recent window shown in the table below",
    "The whole track record, including the misses",
    "The portfolio, with the disclosure that it is not advice",
    "The public Telegram channel with the daily state changes",
    "Legal pages",
  ],
  paidTitle: "What a paid plan would add",
  paidLede: "More history, finer filters and personal tools. Nothing here changes the rules or the scores.",
  rows: {
    "score-history": { label: "Score history", detail: "How the score and its parts moved over time for each ticker.", free: "Last {days}", paid: "Full history" },
    "scanner-filters-advanced": { label: "Advanced scanner filters", detail: "Score range, minimum F, T and M, source and held names, sorting by F, T or M." },
    "scanner-streak": { label: "Rules-met streak and change presets", detail: "How many days a ticker has met its rules, and which tickers gained or lost rules." },
    "insiders-history": { label: "Older insider events", detail: "Form 4 events older than the free window.", free: "Last {days}", paid: "Full history" },
    "ideas-list": { label: "Ideas list", detail: "The evidence collected for each name, in one list." },
    "idea-card": { label: "Idea card", detail: "A full card per ticker with its evidence and sources." },
    "saved-screens": { label: "Saved screens", detail: "Keep your scanner filters for next time.", free: "Saved screens: {n}", paid: "Saved screens: {n}" },
    watchlist: { label: "Watchlist", detail: "Follow a set of tickers.", free: "Up to {n} tickers", paid: "Up to {n} tickers" },
    "alerts-daily": { label: "Daily alerts for your watchlist", detail: "A message when a ticker you follow changes state or gains or loses a rule.", free: "Up to {n} tickers", paid: "Up to {n} tickers" },
    "csv-export": { label: "CSV export", detail: "Download the scanner table as a file." },
    "discovery-list": { label: "Discovery list", detail: "New names found beyond the fixed screen." },
  } as Partial<Record<TierId, Row>>,
  noPriceTitle: "No prices yet",
  noPriceBody: "No price is set and nothing is for sale. If a paid plan is added, you will see its price before you pay.",
  adrNote: "Both tiers show the same rules and the same scores. This is informational screening and not personal investment advice.",
  days: { one: "{n} day", few: "{n} days", many: "{n} days", other: "{n} days" } as Plural,
};

export type PricingMessages = typeof en;

const sk: PricingMessages = {
  compareTitle: "Zadarmo a platené vedľa seba",
  compareLede: "Kým je web v bete, všetko je otvorené. Toto je rozdelenie, ktoré plánujeme zachovať: čo zostane zadarmo pre všetkých a čo by pridal platený plán.",
  tableCaption: "Plánovaný obsah bezplatnej a platenej úrovne",
  colFeature: "Funkcia",
  colFree: "Zadarmo",
  colPaid: "Platené",
  included: "Zahrnuté",
  notIncluded: "Nezahrnuté",
  unlimited: "Bez limitu",
  statusLive: "V bete už dnes",
  statusPlanned: "Zatiaľ nie je hotové",
  alwaysFreeTitle: "Vždy zadarmo",
  alwaysFreeLede: "Stav, skóre a pravidlá, z ktorých vychádzajú, zostávajú otvorené pre všetkých, takže prehľad posúdite skôr, než sa o čomkoľvek rozhodnete.",
  alwaysFree: [
    "Metodika s každým pravidlom a prahom",
    "Dashboard, heat mapa a skener so všetkými tickermi, vyhľadávaním, filtrami podľa stavu a sektora, limitom likvidity a základnými predvoľbami",
    "Stránka spoločnosti: stav, skóre, zoznam pravidiel s prahmi, kontroly vylúčenia, vstupy, príznaky, stav údajov a graf",
    "História skóre a udalosti insiderov za nedávne obdobie uvedené v tabuľke nižšie",
    "Celý záznam signálov vrátane tých nepodarených",
    "Portfólio s upozornením, že nejde o poradenstvo",
    "Verejný kanál na Telegrame s dennými zmenami stavu",
    "Právne stránky",
  ],
  paidTitle: "Čo by pridal platený plán",
  paidLede: "Dlhšiu históriu, jemnejšie filtre a osobné nástroje. Nič z toho nemení pravidlá ani skóre.",
  rows: {
    "score-history": { label: "História skóre", detail: "Ako sa skóre a jeho časti menili v čase pri každom tickeri.", free: "Posledných {days}", paid: "Celá história" },
    "scanner-filters-advanced": { label: "Rozšírené filtre skenera", detail: "Rozsah skóre, minimum F, T a M, zdroj a držané tituly, triedenie podľa F, T alebo M." },
    "scanner-streak": { label: "Séria splnených pravidiel a predvoľby zmien", detail: "Koľko dní ticker spĺňa pravidlá a ktoré tickery pravidlá získali alebo stratili." },
    "insiders-history": { label: "Staršie udalosti insiderov", detail: "Udalosti Form 4 staršie než bezplatné okno.", free: "Posledných {days}", paid: "Celá história" },
    "ideas-list": { label: "Zoznam nápadov", detail: "Zhromaždené dôkazy k jednotlivým titulom v jednom zozname." },
    "idea-card": { label: "Karta nápadu", detail: "Úplná karta tickera s dôkazmi a zdrojmi." },
    "saved-screens": { label: "Uložené filtre", detail: "Uložte si filtre skenera na nabudúce.", free: "Uložené filtre: {n}", paid: "Uložené filtre: {n}" },
    watchlist: { label: "Zoznam sledovaných", detail: "Sledujte vybranú skupinu tickerov.", free: "Až {n} tickerov", paid: "Až {n} tickerov" },
    "alerts-daily": { label: "Denné upozornenia pre váš zoznam", detail: "Správa, keď ticker, ktorý sledujete, zmení stav alebo získa či stratí pravidlo.", free: "Až {n} tickerov", paid: "Až {n} tickerov" },
    "csv-export": { label: "Export do CSV", detail: "Stiahnutie tabuľky skenera ako súboru." },
    "discovery-list": { label: "Zoznam nových titulov", detail: "Nové tituly nájdené mimo pevného výberu." },
  },
  noPriceTitle: "Zatiaľ bez cien",
  noPriceBody: "Žiadna cena nie je určená a nič nie je v predaji. Ak plán pribudne, cenu uvidíte skôr, než zaplatíte.",
  adrNote: "Obe úrovne ukazujú rovnaké pravidlá a rovnaké skóre. Ide o informačný prehľad, nie o osobné investičné poradenstvo.",
  days: { one: "{n} deň", few: "{n} dni", many: "{n} dňa", other: "{n} dní" },
};

const catalog: Record<Locale, PricingMessages> = { en, sk };
export const getPricingMessages = (locale: Locale): PricingMessages => catalog[locale];
