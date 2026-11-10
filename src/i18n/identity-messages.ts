import type { Locale } from "./index";

/** Who is signed in, shown in the sidebar footer and the phone header. Slovak text needs the native review (W23). */
const en = {
  region: "Your account",
  loading: "Checking sign-in",
  anon: "Not signed in",
  signIn: "Sign in",
  create: "Create free account",
  owner: "Owner",
  ownerState: "Signed in as owner",
  signedIn: "Signed in",
  account: "Account",
  signOut: "Sign out",
  signingOut: "Signing out",
  plan: { free: "Free", plus: "Plus", trial: "Trial" },
  trialLeft: { one: "1 day left", other: "{n} days left", zero: "ends today" },
  openApp: "Open app",
  siteNav: "Site",
  freeAccount: "Free account",
  plus: "Plus",
  locked: "Plus, locked",
  plusPage: {
    title: "Part of Plus",
    body: "Preview this area before Plus billing opens.",
    sample: "SAMPLE preview",
    price: "9.90 EUR per month. Billing opens at launch. 14-day trial.",
    create: "Create free account",
    signIn: "Sign in",
    areas: {
      dashboard: "Browse stock scores and open company pages.",
      company: "Read a company's score, rules and dated history.",
      scanner: "Filter the stock screen by state and sector.",
      heatmap: "See the stock screen grouped by sector and state.",
      ideas: "Read evidence collected for screened companies.",
      "track-record": "Review past signals, including the misses.",
      insiders: "Browse reported insider transactions.",
      portfolio: "See the published portfolio and its history.",
      etf: "Browse ETF research and its track record.",
      "etf/track-record": "Review the recorded ETF research results.",
      indices: "Browse market index data.",
      forex: "Browse currency market data.",
      crypto: "Browse crypto market data.",
      economy: "Browse economic data.",
      congress: "Browse reported congressional trades.",
      news: "Browse market news.",
      screener: "Browse the market screener.",
    },
  },
};

export type IdentityMessages = typeof en;

const sk: IdentityMessages = {
  region: "Váš účet",
  loading: "Overujeme prihlásenie",
  anon: "Neprihlásený",
  signIn: "Prihlásiť sa",
  create: "Vytvoriť účet zdarma",
  owner: "Vlastník",
  ownerState: "Prihlásený ako vlastník",
  signedIn: "Prihlásený",
  account: "Účet",
  signOut: "Odhlásiť sa",
  signingOut: "Odhlasujeme",
  plan: { free: "Free", plus: "Plus", trial: "Skúška" },
  trialLeft: { one: "zostáva 1 deň", other: "zostáva {n} dní", zero: "končí dnes" },
  openApp: "Otvoriť aplikáciu",
  siteNav: "Stránka",
  freeAccount: "Bezplatný účet",
  plus: "Plus",
  locked: "Plus, zamknuté",
  plusPage: {
    title: "Súčasť Plus",
    body: "Pozrite si ukážku tejto časti pred spustením platieb za Plus.",
    sample: "UKÁŽKA",
    price: "9,90 EUR mesačne. Platby spustíme pri uvedení. Skúšobná doba 14 dní.",
    create: "Vytvoriť bezplatný účet",
    signIn: "Prihlásiť sa",
    areas: {
      dashboard: "Prezerajte skóre akcií a otvárajte stránky spoločností.",
      company: "Čítajte skóre spoločnosti, pravidlá a datovanú históriu.",
      scanner: "Filtrujte akcie podľa stavu a sektora.",
      heatmap: "Pozrite si akcie podľa sektora a stavu.",
      ideas: "Čítajte zhromaždené dôkazy o sledovaných spoločnostiach.",
      "track-record": "Pozrite si minulé signály vrátane neúspešných.",
      insiders: "Prezerajte nahlásené obchody insiderov.",
      portfolio: "Pozrite si zverejnené portfólio a jeho históriu.",
      etf: "Prezerajte výskum ETF a jeho výsledky.",
      "etf/track-record": "Pozrite si zaznamenané výsledky výskumu ETF.",
      indices: "Prezerajte údaje o trhových indexoch.",
      forex: "Prezerajte údaje o menových trhoch.",
      crypto: "Prezerajte údaje o kryptomenách.",
      economy: "Prezerajte ekonomické údaje.",
      congress: "Prezerajte nahlásené obchody členov Kongresu.",
      news: "Prezerajte trhové správy.",
      screener: "Prezerajte trhový skener.",
    },
  },
};

export function getIdentityMessages(locale: Locale): IdentityMessages {
  return locale === "sk" ? sk : en;
}

/** "12 days left". Slovak uses "dni" for 2 to 4 and "dní" from 5. */
export function trialLeftText(t: IdentityMessages, days: number, locale: Locale): string {
  if (days <= 0) return t.trialLeft.zero;
  if (days === 1) return t.trialLeft.one;
  const text = t.trialLeft.other.replace("{n}", String(days));
  return locale === "sk" && days >= 2 && days <= 4 ? text.replace("dní", "dni") : text;
}
