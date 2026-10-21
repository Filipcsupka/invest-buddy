import type { Locale } from "./index";

const en = {
  title: "ETF research", lede: "Weekly fund research, grouped by asset class. Calls are screening labels, not personal advice.",
  recordTitle: "ETF track record", recordLede: "Forward returns of ETF picks against their recorded benchmark.",
  detailLede: "Research card and measurement history", sample: "SAMPLE DATA", empty: "No ETF research has been recorded yet.",
  noMatch: "No funds match these filters.", noOutcomes: "No ETF outcomes have been measured yet.",
  smallSample: "Fewer than 20 measured picks: these results are not conclusive.",
  lastRun: "Last research run", verifiedPicks: "Verified picks", allClasses: "All asset classes", allCalls: "All calls",
  assetClass: "Asset class", call: "Call", apply: "Apply filters", symbol: "Symbol", name: "Fund", conviction: "Conviction",
  ter: "TER", aum: "AUM (USD m)", domicile: "Domicile", price: "Last price", priceDate: "Price date", verification: "Verification", lastSeen: "Last seen",
  equity: "Equity", bond: "Bonds", commodity: "Commodities", multi_asset: "Multi asset", other: "Other",
  BUY_ZONE: "Buy zone", WATCH: "Watch", AVOID: "Avoid", verified: "Verified", partial: "Partly verified", unverified: "Unverified",
  thesis: "Thesis", whatHappened: "What happened", whyItMatters: "Why it matters", plan: "Plan", entryZone: "Entry zone", addWhen: "Add when", stopAddingWhen: "Stop adding when", risks: "Risks",
  costs: "Costs and structure", index: "Tracked index", replication: "Replication", evidence: "Evidence", quote: "Quoted source", claim: "Claim",
  history: "Call history", outcomes: "Measured outcomes", horizon: "Horizon", fundReturn: "Fund return", benchmark: "Benchmark", benchmarkReturn: "Benchmark return", excess: "Excess return",
  count: "Measured picks", mean: "Mean excess", median: "Median excess", hitRate: "Beat benchmark", noValue: "Not recorded", days: "days", back: "All ETFs", trackRecord: "ETF track record",
  noEvidence: "No evidence recorded.", noHistory: "No call history recorded.", noDetailOutcomes: "No measured outcomes yet.",
};
const sk: typeof en = {
  title: "Výskum ETF", lede: "Týždenný výskum fondov podľa triedy aktív. Signály sú len informačným triedením.",
  recordTitle: "Výsledky ETF", recordLede: "Následné výnosy vybraných ETF oproti zaznamenanému benchmarku.",
  detailLede: "Výskumná karta a história merania", sample: "UKÁŽKOVÉ ÚDAJE", empty: "Zatiaľ nebol zaznamenaný žiadny výskum ETF.",
  noMatch: "Týmto filtrom nezodpovedá žiadny fond.", noOutcomes: "Zatiaľ neboli vyhodnotené žiadne výsledky ETF.",
  smallSample: "Pri menej ako 20 vyhodnotených tipoch nie sú výsledky presvedčivé.",
  lastRun: "Posledný výskum", verifiedPicks: "Overené tipy", allClasses: "Všetky triedy aktív", allCalls: "Všetky signály",
  assetClass: "Trieda aktív", call: "Signál", apply: "Použiť filtre", symbol: "Symbol", name: "Fond", conviction: "Presvedčenie",
  ter: "TER", aum: "AUM (mil. USD)", domicile: "Domovská krajina", price: "Posledná cena", priceDate: "Dátum ceny", verification: "Overenie", lastSeen: "Naposledy videné",
  equity: "Akcie", bond: "Dlhopisy", commodity: "Komodity", multi_asset: "Zmiešané aktíva", other: "Ostatné",
  BUY_ZONE: "Nákupná zóna", WATCH: "Sledovať", AVOID: "Vyhnúť sa", verified: "Overené", partial: "Čiastočne overené", unverified: "Neoverené",
  thesis: "Téza", whatHappened: "Čo sa stalo", whyItMatters: "Prečo na tom záleží", plan: "Plán", entryZone: "Vstupná zóna", addWhen: "Pridať keď", stopAddingWhen: "Prestať pridávať keď", risks: "Riziká",
  costs: "Náklady a štruktúra", index: "Sledovaný index", replication: "Replikácia", evidence: "Zdroje", quote: "Citovaný zdroj", claim: "Tvrdenie",
  history: "História signálov", outcomes: "Vyhodnotené výsledky", horizon: "Horizont", fundReturn: "Výnos fondu", benchmark: "Benchmark", benchmarkReturn: "Výnos benchmarku", excess: "Nadvýnos",
  count: "Vyhodnotené tipy", mean: "Priemerný nadvýnos", median: "Medián nadvýnosu", hitRate: "Prekonalo benchmark", noValue: "Nezaznamenané", days: "dní", back: "Všetky ETF", trackRecord: "Výsledky ETF",
  noEvidence: "Nie sú zaznamenané zdroje.", noHistory: "Nie je zaznamenaná história signálov.", noDetailOutcomes: "Zatiaľ nie sú vyhodnotené výsledky.",
};
export type EtfMessages = typeof en;
export const getEtfMessages = (locale: Locale): EtfMessages => locale === "sk" ? sk : en;
