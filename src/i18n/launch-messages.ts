import type { Locale } from "./index";

/**
 * Copy for the waitlist launch pages: landing section and pricing page. The signup form uses `waitlist` in messages.ts. Kept apart from messages.ts so the two do not collide while
 * several branches edit copy. Slovak text needs the native review in W23.
 */
const en = {
  landing: {
    ctaWaitlist: "Join the waitlist",
    waitlistTitle: "Get one email when it opens",
    waitlistBody: "The screen is free to read today. A paid tier is planned. Join the list and we tell you when it opens, with no other mail.",
    proofTitle: "What you can check today",
    proofMethodTitle: "The method is published",
    proofMethodBody: "Nine core rules, written out, with the data each one reads.",
    proofMethodLink: "Read the methodology",
    proofRecordTitle: "The record is dated and keeps the misses",
    proofRecordBody: "Each signal is stored with its date. Measured outcomes appear once a signal window has closed, losers included.",
    proofRecordLink: "View the track record",
    proofSlovakTitle: "Slovak pages",
    proofSlovakBody: "The whole site reads in Slovak and English, with the same rules and numbers.",
    factTickers: "{n} tickers scored",
    factLastScore: "Last score {date}",
    factRecordStart: "Record starts {date}",
    tiersTitle: "Free and paid",
    tiersBody: "Reading the score and its rules stays free. Score history, alerts and CSV export are planned for a paid tier.",
    tiersLink: "See planned pricing",
  },
  pricing: {
    title: "Pricing",
    lede: "Reading the score, its rules and the public record is free. A paid tier is planned. Nothing can be bought yet.",
    plannedNote: "Prices and limits are planned and can change before launch. They are not an offer.",
    freeName: "Free",
    paidName: "Paid",
    freePrice: "0 EUR",
    paidPrice: "{price} EUR per month",
    paidBilling: "Billed yearly, {total} EUR. VAT included.",
    paidTag: "Planned price",
    featureCol: "What you get",
    tableCaption: "Free and paid plans compared",
    included: "Included",
    notIncluded: "Not included",
    rows: {
      score: "Company score and rule breakdown with inputs and sources",
      method: "Methodology and public track record",
      portfolio: "Portfolio view",
      weekly: "Weekly summary email",
      history: "Score history",
      scanner: "Scanner rows",
      alerts: "Daily state-change alerts",
      csv: "CSV export",
      discovery: "Discovery candidates",
    },
    historyFree: "Last {n} days",
    historyPaid: "Full history",
    scannerFree: "Top {n} rows",
    scannerPaid: "All rows",
    costNote: "Check the cost against the size of your portfolio before you pay for any screen. A score is not a recommendation.",
    renewalNote: "A paid plan, when it opens, renews until cancelled. The renewal, cancellation and refund terms are still being drafted.",
    waitlistTitle: "Join the waitlist for the paid tier",
  },
};

export type LaunchMessages = typeof en;

const sk: LaunchMessages = {
  landing: {
    ctaWaitlist: "Pridať sa do poradovníka",
    waitlistTitle: "Jeden e-mail, keď sa otvorí",
    waitlistBody: "Prehľad je dnes zadarmo na čítanie. Plánuje sa platená úroveň. Pridajte sa do zoznamu a dáme vám vedieť, keď sa otvorí, bez inej pošty.",
    proofTitle: "Čo si môžete overiť už dnes",
    proofMethodTitle: "Metodika je zverejnená",
    proofMethodBody: "Deväť hlavných pravidiel, každé s údajmi, z ktorých vychádza.",
    proofMethodLink: "Prečítať metodiku",
    proofRecordTitle: "Záznam je datovaný a zachováva aj chyby",
    proofRecordBody: "Každý signál sa ukladá s dátumom. Namerané výsledky pribudnú po uzavretí okna signálu, aj tie zlé.",
    proofRecordLink: "Pozrieť záznam",
    proofSlovakTitle: "Slovenské stránky",
    proofSlovakBody: "Celý web je po slovensky aj po anglicky, s rovnakými pravidlami a číslami.",
    factTickers: "Ohodnotených tikerov: {n}",
    factLastScore: "Posledné skóre {date}",
    factRecordStart: "Záznam začína {date}",
    tiersTitle: "Zadarmo a platené",
    tiersBody: "Čítanie skóre a jeho pravidiel zostáva zadarmo. História skóre, upozornenia a export do CSV sú plánované pre platenú úroveň.",
    tiersLink: "Pozrieť plánované ceny",
  },
  pricing: {
    title: "Cenník",
    lede: "Čítanie skóre, jeho pravidiel a verejného záznamu je zadarmo. Plánuje sa platená úroveň. Zatiaľ nie je nič v predaji.",
    plannedNote: "Ceny a limity sú plánované a môžu sa pred spustením zmeniť. Nie sú ponukou.",
    freeName: "Zadarmo",
    paidName: "Platené",
    freePrice: "0 EUR",
    paidPrice: "{price} EUR mesačne",
    paidBilling: "Platba ročne, {total} EUR. Vrátane DPH.",
    paidTag: "Plánovaná cena",
    featureCol: "Čo dostanete",
    tableCaption: "Porovnanie bezplatnej a platenej úrovne",
    included: "Áno",
    notIncluded: "Nie",
    rows: {
      score: "Skóre firmy a rozpis pravidiel so vstupmi a zdrojmi",
      method: "Metodika a verejný záznam",
      portfolio: "Pohľad na portfólio",
      weekly: "Týždenný súhrn e-mailom",
      history: "História skóre",
      scanner: "Riadky v prehľade",
      alerts: "Denné upozornenia na zmenu stavu",
      csv: "Export do CSV",
      discovery: "Kandidáti z objavovania",
    },
    historyFree: "Posledných {n} dní",
    historyPaid: "Celá história",
    scannerFree: "Prvých {n} riadkov",
    scannerPaid: "Všetky riadky",
    costNote: "Skôr než zaplatíte za akýkoľvek prehľad, porovnajte cenu s veľkosťou svojho portfólia. Skóre nie je odporúčanie.",
    renewalNote: "Platený plán sa po otvorení obnovuje, kým ho nezrušíte. Podmienky obnovenia, zrušenia a vrátenia peňazí sa ešte pripravujú.",
    waitlistTitle: "Pridajte sa do poradovníka na platenú úroveň",
  },
};

const catalog: Record<Locale, LaunchMessages> = { en, sk };

export function getLaunchMessages(locale: Locale): LaunchMessages {
  return catalog[locale];
}
