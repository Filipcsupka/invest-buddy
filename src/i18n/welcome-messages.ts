import type { Locale } from "./index";

/**
 * Copy for the Welcome page (`/{locale}`). Wording follows ADR-001 and docs/wording-gate.md: describe the rules, never tell a reader what
 * to do with a security, no urgency, no return claims, no customer counts. Every figure on the page is SAMPLE data from invented
 * companies (src/components/welcome/sample-data.ts). Slovak text needs the native review (W23).
 */
const en = {
  hero: {
    title: "See how every score is built.",
    lede: "One published rule set, applied the same way to every stock and shown to every visitor. Each score lists the rules it met, the rules it missed and the data behind them.",
    primary: "Create free account",
    secondary: "Read the method",
    signedIn: "Open the dashboard",
    notes: ["Free account", "Every rule published", "Misses stay in the record"],
    boardTitle: "Sample scoreboard",
    boardStamp: "Sample data, not live scores",
    boardNote: "Seven invented companies, scored by the real engine on generated data.",
    colScore: "Score",
    rowSample: "Sample",
  },
  build: {
    title: "How a score is built",
    lede: "Ten published rules in three groups. Each one reads stored data and answers yes, no or no data. Scroll to watch one sample score come together.",
    specimen: "{name} ({ticker}), invented company",
    points: "{points} pts",
    pass: "Met",
    fail: "Missed",
    none: "No data",
    bonus: "Bonus, not in the percent",
    earned: "Points with data",
    earnedValue: "{earned} of {max}",
    percent: "Score",
    bands: "Bands start at {wait}, {watch} and {setup}.",
    result: "{ticker} met {met} of {total} core rules and lands in {state}. The missed rules stay on the page.",
    method: "Read every threshold",
  },
  band: {
    label: "The published rule set",
    points: "{points} points",
    pause: "Pause the rule list",
    play: "Play the rule list",
  },
  areas: {
    title: "What you can open",
    lede: "Every area shows its status. Nothing is hidden behind a blank lock.",
    pills: { open: "Open to all", account: "Free account", plus: "Plus, opens later", prep: "In preparation" },
    items: {
      stocks: { title: "Stocks", body: "A scanner over the whole universe and a checklist page per company, with each threshold printed." },
      etfs: { title: "ETFs", body: "Fund views with holdings and costs, on the same calm layout." },
      markets: { title: "Markets", body: "Indices and macro calendars. Shown here once the data terms allow it." },
      record: { title: "Track record", body: "Every state change with its date, the ones that later broke included. Opens with live data." },
      method: { title: "Methodology", body: "All rules, weights and thresholds, written out in English and Slovak." },
    },
    preview: "Sample preview",
    previewRule: "Revenue growth faster than last year",
  },
  tiers: {
    title: "Free now. Plus once the data licence is in place.",
    lede: "The status, the score and the rules stay open in every plan. Plus adds depth and personal tools. Nothing is for sale yet.",
    freeTitle: "Free",
    freePrice: "No card needed",
    free: ["Methodology with every threshold", "The sample scoreboard and company checklists", "Saved preferences in your account", "Live views as they clear the data licence"],
    plusTitle: "Plus",
    plusPlanned: "Planned price",
    plusOr: "or",
    plusYearNote: "two months free",
    plus: ["Full score history", "Advanced scanner filters and streaks", "Daily alerts and saved screens", "CSV export"],
    plusStatus: "Opens when the data licence and billing are ready.",
    compare: "Compare the plans",
  },
  trust: {
    title: "What this is, and on what data",
    operator: "InvestBuddy is an informational screen. It holds no client money and nothing on the site places an order.",
    sourcesTitle: "Public sources shown on the site",
    classes: { public_gov: "US government public data", public_attrib: "Public, shown with attribution" },
    legalTitle: "Legal pages",
    legal: { terms: "Terms of use", privacy: "Privacy", disclaimer: "Disclaimer" },
    pending: "Legal texts are waiting for a lawyer's review.",
  },
  faq: {
    title: "Questions",
    items: [
      { q: "Is this investment advice?", a: "No. The site applies one published rule set and shows the result. It gives no position sizes, price targets or personal instructions, and every visitor sees the same output." },
      { q: "Where does the data come from?", a: "Filings come from SEC EDGAR and macro series from US government sources. Live market data appears only where its licence allows display. Until then, scores shown here are sample data." },
      { q: "Why sample data?", a: "The licence for showing live prices and scores to the public is not settled yet. The sample uses invented companies so no figure can be mistaken for a rating of a real one." },
      { q: "What does the free account include?", a: "The method, the sample views, saved preferences and every live view as it clears the licence. The status, score and rules stay free in every plan." },
      { q: "What happens to my data?", a: "We store your email address, a hash of your password, and your preferences. No tracking cookies, no data sales. Product news by email is a separate opt-in." },
      { q: "Can I delete my account?", a: "Yes. Deleting the account removes your profile and preferences. The privacy page lists what must be kept by law and for how long." },
    ],
  },
  close: {
    title: "Create your free account",
    body: "One screen for sign-up and sign-in. Use an email address and a password.",
  },
  sticky: "Create free account",
};

export type WelcomeMessages = typeof en;

const sk: WelcomeMessages = {
  hero: {
    title: "Pozrite sa, ako vzniká každé skóre.",
    lede: "Jedna zverejnená sada pravidiel, ktorá platí rovnako pre každú akciu a ktorú vidí každý návštevník. Pri každom skóre vidíte, ktoré pravidlá splnilo, ktoré nie a z akých údajov vychádzajú.",
    primary: "Vytvoriť bezplatný účet",
    secondary: "Prečítať metodiku",
    signedIn: "Otvoriť prehľad",
    notes: ["Bezplatný účet", "Každé pravidlo zverejnené", "Neúspechy zostávajú v zázname"],
    boardTitle: "Ukážkový prehľad",
    boardStamp: "Ukážkové údaje, nie živé skóre",
    boardNote: "Sedem vymyslených spoločností, ktoré hodnotí skutočný výpočet nad generovanými údajmi.",
    colScore: "Skóre",
    rowSample: "Ukážka",
  },
  build: {
    title: "Ako vzniká skóre",
    lede: "Desať zverejnených pravidiel v troch skupinách. Každé číta uložené údaje a odpovedá áno, nie alebo bez údajov. Posúvajte stránku a sledujte, ako sa skladá jedno ukážkové skóre.",
    specimen: "{name} ({ticker}), vymyslená spoločnosť",
    points: "{points} b.",
    pass: "Splnené",
    fail: "Nesplnené",
    none: "Bez údajov",
    bonus: "Bonus, mimo percenta",
    earned: "Body s údajmi",
    earnedValue: "{earned} z {max}",
    percent: "Skóre",
    bands: "Pásma začínajú na {wait}, {watch} a {setup}.",
    result: "{ticker} splnil {met} z {total} hlavných pravidiel a patrí do stavu {state}. Nesplnené pravidlá ostávajú na stránke.",
    method: "Prečítať všetky prahy",
  },
  band: {
    label: "Zverejnená sada pravidiel",
    points: "{points} bodov",
    pause: "Pozastaviť zoznam pravidiel",
    play: "Spustiť zoznam pravidiel",
  },
  areas: {
    title: "Čo môžete otvoriť",
    lede: "Každá oblasť ukazuje svoj stav. Nič sa neskrýva za prázdnym zámkom.",
    pills: { open: "Otvorené pre všetkých", account: "Bezplatný účet", plus: "Plus, otvoríme neskôr", prep: "Pripravujeme" },
    items: {
      stocks: { title: "Akcie", body: "Skener celého zoznamu akcií a pre každú spoločnosť kontrolný zoznam, v ktorom je vypísaný každý prah." },
      etfs: { title: "ETF", body: "Prehľady fondov s pozíciami a nákladmi v rovnako pokojnom rozložení." },
      markets: { title: "Trhy", body: "Indexy a makro kalendáre. Zobrazíme ich tu, keď to dovolia licenčné podmienky údajov." },
      record: { title: "Záznam výsledkov", body: "Každá zmena stavu s dátumom, aj tie, ktoré sa neskôr pokazili. Otvorí sa so živými údajmi." },
      method: { title: "Metodika", body: "Všetky pravidlá, váhy a prahy, vypísané po slovensky aj po anglicky." },
    },
    preview: "Ukážkový náhľad",
    previewRule: "Tržby rastú rýchlejšie ako minulý rok",
  },
  tiers: {
    title: "Teraz zadarmo. Plus, keď budeme mať licenciu na údaje.",
    lede: "Stav, skóre a pravidlá ostávajú otvorené v každom pláne. Plus pridáva hĺbku a osobné nástroje. Zatiaľ sa nič nepredáva.",
    freeTitle: "Zadarmo",
    freePrice: "Bez platobnej karty",
    free: ["Metodika so všetkými prahmi", "Ukážkový prehľad a kontrolné zoznamy spoločností", "Uložené nastavenia vo vašom účte", "Živé prehľady, keď ich licencia povolí"],
    plusTitle: "Plus",
    plusPlanned: "Plánovaná cena",
    plusOr: "alebo",
    plusYearNote: "dva mesiace zadarmo",
    plus: ["Celá história skóre", "Rozšírené filtre skenera a série", "Denné upozornenia a uložené filtre", "Export do CSV"],
    plusStatus: "Otvoríme, keď bude pripravená licencia na údaje a platby.",
    compare: "Porovnať plány",
  },
  trust: {
    title: "Čo to je a z akých údajov vychádza",
    operator: "InvestBuddy je informačný prehľad. Nespravuje peniaze klientov a nič na stránke nezadáva pokyn na obchod.",
    sourcesTitle: "Verejné zdroje zobrazené na stránke",
    classes: { public_gov: "Verejné údaje vlády USA", public_attrib: "Verejné, zobrazené s uvedením zdroja" },
    legalTitle: "Právne stránky",
    legal: { terms: "Podmienky používania", privacy: "Ochrana súkromia", disclaimer: "Upozornenie" },
    pending: "Právne texty čakajú na kontrolu advokátom.",
  },
  faq: {
    title: "Otázky",
    items: [
      { q: "Ide o investičné poradenstvo?", a: "Nie. Stránka používa jednu zverejnenú sadu pravidiel a ukazuje výsledok. Neuvádza veľkosti pozícií, cieľové ceny ani osobné pokyny a každý návštevník vidí to isté." },
      { q: "Odkiaľ sú údaje?", a: "Podania pochádzajú zo SEC EDGAR a makroekonomické časové rady z verejných zdrojov vlády USA. Živé trhové údaje sa zobrazia len tam, kde to licencia dovolí. Dovtedy sú skóre na tejto stránke ukážkové." },
      { q: "Prečo ukážkové údaje?", a: "Licencia na verejné zobrazenie živých cien a skóre ešte nie je vyriešená. Ukážka používa vymyslené spoločnosti, aby sa žiadne číslo nedalo zameniť s hodnotením skutočnej firmy." },
      { q: "Čo obsahuje bezplatný účet?", a: "Metodiku, ukážkové prehľady, uložené nastavenia a každý živý prehľad, keď ho licencia povolí. Stav, skóre a pravidlá ostávajú zadarmo v každom pláne." },
      { q: "Čo sa stane s mojimi údajmi?", a: "Ukladáme e-mailovú adresu, odtlačok (hash) hesla a vaše nastavenia. Nepoužívame sledovacie cookies a vaše údaje nepredávame. Na novinky e-mailom dávate samostatný súhlas." },
      { q: "Môžem si účet zmazať?", a: "Áno. Zmazaním účtu odstránite profil aj nastavenia. Stránka o ochrane súkromia uvádza, čo musíme podľa zákona ponechať a ako dlho." },
    ],
  },
  close: {
    title: "Vytvorte si bezplatný účet",
    body: "Jedna obrazovka na registráciu aj prihlásenie. Použite e-mail a heslo.",
  },
  sticky: "Vytvoriť bezplatný účet",
};

const dictionaries: Record<Locale, WelcomeMessages> = { en, sk };

export function getWelcomeMessages(locale: Locale): WelcomeMessages {
  return dictionaries[locale];
}
