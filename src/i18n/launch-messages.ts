import type { Locale } from "./index";

/**
 * Copy for the waitlist launch pages: landing section and pricing page. The signup form uses `waitlist` in messages.ts. Kept apart from messages.ts so the two do not collide while
 * several branches edit copy. Slovak text needs the native review in W23.
 */
const en = {
  landing: {
    ctaWaitlist: "Join the waitlist",
    waitlistTitle: "Get one email when it opens",
    waitlistBody: "The screen is free to read today. Join the list and we tell you when it opens, with no other mail.",
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
    tiersTitle: "Free in beta",
    tiersBody: "The site is in beta and free to use while we test. Paid plans may come later. There are no prices yet.",
    tiersLink: "How the beta works",
  },
  pricing: {
    title: "Pricing",
    lede: "Beta: free while we test. Paid plans later. No prices yet.",
    freeTitle: "Free while we test",
    freeBody: "The site is in beta. Reading the scores, the rules and the public record costs nothing.",
    laterTitle: "Paid plans later",
    laterBody: "We may add paid plans after the beta. No plan, price or date is set, and nothing is for sale now. If a plan is added, its price will be shown before you pay.",
    waitlistTitle: "Get one email when things change",
  },
};

export type LaunchMessages = typeof en;

const sk: LaunchMessages = {
  landing: {
    ctaWaitlist: "Pridať sa do poradovníka",
    waitlistTitle: "Jeden e-mail, keď sa otvorí",
    waitlistBody: "Prehľad je dnes zadarmo na čítanie. Pridajte sa do zoznamu a dáme vám vedieť, keď sa otvorí, bez inej pošty.",
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
    tiersTitle: "Zadarmo v bete",
    tiersBody: "Web je v beta prevádzke a počas testovania je zadarmo. Platené plány môžu prísť neskôr. Zatiaľ nie sú žiadne ceny.",
    tiersLink: "Ako funguje beta",
  },
  pricing: {
    title: "Cenník",
    lede: "Beta: zadarmo, kým testujeme. Platené plány neskôr. Zatiaľ bez cien.",
    freeTitle: "Zadarmo počas testovania",
    freeBody: "Web je v beta prevádzke. Čítanie skóre, pravidiel a verejného záznamu nestojí nič.",
    laterTitle: "Platené plány neskôr",
    laterBody: "Po bete môžeme pridať platené plány. Žiadny plán, cena ani termín nie je určený a teraz nie je nič v predaji. Ak plán pribudne, cenu uvidíte skôr, než zaplatíte.",
    waitlistTitle: "Jeden e-mail, keď sa niečo zmení",
  },
};

const catalog: Record<Locale, LaunchMessages> = { en, sk };

export function getLaunchMessages(locale: Locale): LaunchMessages {
  return catalog[locale];
}
