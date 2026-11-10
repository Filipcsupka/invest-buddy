import type { Locale } from "./index";

/** Who is signed in, shown in the sidebar footer and the phone header. Slovak text needs the native review (W23). */
const en = {
  region: "Your account",
  loading: "Checking sign-in",
  anon: "Not signed in",
  signIn: "Sign in",
  create: "Create free account",
  ownerSignIn: "Owner sign-in",
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
  soon: "Soon",
  locked: "locked, opens soon",
  soonPage: {
    title: "This page opens soon",
    body: "It shows licensed market data. Until the data licence is settled it stays open to the site owner only. Nothing here is investment advice.",
    named: "Page: {page}",
    back: "Back to your account",
    methodology: "Read the methodology",
    signIn: "Sign in",
    owner: "Site owner? Use the owner sign-in.",
  },
  ownerLink: "Owner sign in",
};

export type IdentityMessages = typeof en;

const sk: IdentityMessages = {
  region: "Váš účet",
  loading: "Overujeme prihlásenie",
  anon: "Neprihlásený",
  signIn: "Prihlásiť sa",
  create: "Vytvoriť účet zdarma",
  ownerSignIn: "Prihlásenie vlastníka",
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
  soon: "Čoskoro",
  locked: "zamknuté, otvoríme čoskoro",
  soonPage: {
    title: "Táto stránka sa otvorí čoskoro",
    body: "Zobrazuje licencované trhové dáta. Kým nie je licencia vyriešená, vidí ju iba vlastník stránky. Nič tu nie je investičné odporúčanie.",
    named: "Stránka: {page}",
    back: "Späť na účet",
    methodology: "Prečítať metodiku",
    signIn: "Prihlásiť sa",
    owner: "Vlastník stránky? Použite prihlásenie vlastníka.",
  },
  ownerLink: "Prihlásenie vlastníka",
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
