import type { Locale } from "./index";

/**
 * Copy for the three investor paths on the dashboard and the pricing page. No digits: prices come from
 * src/app/[locale]/pricing/plans.ts and arrive as {price}. Wording follows ADR-001 and docs/wording-gate.md: a path describes what
 * the viewer can see, never what to do with a security, and promises no result. "Active investor" and "Passive investor" describe how
 * a person invests; we never call anyone a trader. Slovak text needs the native review (W23).
 */
type PathCopy = { name: string; plan: string; body: string; action: string; items: string[] };

const en = {
  title: "Choose your path",
  lede: "Three ways to use the screen, depending on how you invest. Every path uses the same published rules, and none of them is personal advice.",
  yourPlan: "Your plan",
  included: "Included in your plan",
  lockedNote: "Not in your plan",
  seePlan: "See the plan",
  free: "Free",
  perMonth: "{price} a month",
  perYear: "or {price} a year",
  vat: "VAT included. Paid plans are not open yet and nothing is charged.",
  paths: {
    active: {
      name: "Active investor",
      plan: "Plus",
      body: "For investors who pick individual stocks. Everything in Passive, plus the stock screen.",
      action: "Open stocks",
      items: ["Stock scores with every rule", "Scanner and shortlist", "Company pages", "ETF and market views from Passive"],
    },
    passive: {
      name: "Passive investor",
      plan: "Passive",
      body: "For investors who hold funds. ETF ratings and fund pages, with the market context around them.",
      action: "Open ETFs",
      items: ["ETF ratings with every rule", "Fund pages", "Indices and the economy page", "Earnings and macro calendar"],
    },
    overview: {
      name: "Market overview",
      plan: "Free",
      body: "A free account. The method and the macro calendar are open; index and economy views join once the data licence allows, and until then they are part of Passive.",
      action: "Read the method",
      items: ["The method, with every rule and threshold", "US macro calendar: data releases and Fed decisions", "Index and economy views, once the data licence allows"],
    },
  } satisfies Record<"active" | "passive" | "overview", PathCopy>,
  overviewLicensed: {
    body: "A free account with the market context: indices, the economy page, the calendar and the method.",
    action: "Open the market overview",
    items: ["The method, with every rule and threshold", "Indices and the economy page", "Earnings and macro calendar"],
  },
};

export type PathMessages = typeof en;

const sk: PathMessages = {
  title: "Vyberte si cestu",
  lede: "Tri spôsoby, ako prehľad používať, podľa toho, ako investujete. Každá cesta používa rovnaké zverejnené pravidlá a žiadna z nich nie je osobným poradenstvom.",
  yourPlan: "Váš plán",
  included: "Súčasť vášho plánu",
  lockedNote: "Nie je vo vašom pláne",
  seePlan: "Pozrieť plán",
  free: "Zadarmo",
  perMonth: "{price} mesačne",
  perYear: "alebo {price} ročne",
  vat: "Vrátane DPH. Platené plány zatiaľ nie sú otvorené a nič sa neúčtuje.",
  paths: {
    active: {
      name: "Aktívny investor",
      plan: "Plus",
      body: "Pre investorov, ktorí si vyberajú jednotlivé akcie. Všetko z plánu Pasívny a k tomu prehľad akcií.",
      action: "Otvoriť akcie",
      items: ["Skóre akcií so všetkými pravidlami", "Skener a užší výber", "Stránky spoločností", "Prehľady ETF a trhov z plánu Pasívny"],
    },
    passive: {
      name: "Pasívny investor",
      plan: "Pasívny",
      body: "Pre investorov, ktorí držia fondy. Hodnotenie ETF a stránky fondov spolu s kontextom trhu.",
      action: "Otvoriť ETF",
      items: ["Hodnotenie ETF so všetkými pravidlami", "Stránky fondov", "Indexy a stránka ekonomiky", "Kalendár výsledkov a makroudalostí"],
    },
    overview: {
      name: "Prehľad trhu",
      plan: "Zadarmo",
      body: "Bezplatný účet. Metodika a makrokalendár sú prístupné. Indexy a ekonomika pribudnú, keď to dovolí licencia na údaje; dovtedy sú v pláne Pasívny.",
      action: "Prečítať metodiku",
      items: ["Metodika so všetkými pravidlami a prahmi", "Americký makrokalendár: zverejnenia údajov a rozhodnutia Fedu", "Indexy a ekonomika, keď to licencia na údaje dovolí"],
    },
  },
  overviewLicensed: {
    body: "Bezplatný účet s kontextom trhu: indexy, stránka ekonomiky, kalendár a metodika.",
    action: "Otvoriť prehľad trhu",
    items: ["Metodika so všetkými pravidlami a prahmi", "Indexy a stránka ekonomiky", "Kalendár výsledkov a makroudalostí"],
  },
};

const messages: Record<Locale, PathMessages> = { en, sk };
export const getPathMessages = (locale: Locale): PathMessages => messages[locale];
