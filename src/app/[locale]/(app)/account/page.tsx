import type { Metadata } from "next";
import { pageMetadata } from "@/i18n/metadata";
import { notFound, redirect } from "next/navigation";
import { getPool } from "@/db/pool";
import { hasUnrevealedRecoveryCodes, remainingRecoveryCodes } from "@/auth/recovery";
import { flags } from "@/config/flags";
import { getViewer, limitFor } from "@/viewer/get-viewer";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (locale !== "en" && locale !== "sk") notFound();
  return { ...pageMetadata(locale, "/account", locale === "sk" ? "Účet" : "Account", locale === "sk" ? "Váš účet InvestBuddy." : "Your InvestBuddy account."), robots: { index: false, follow: false } };
}

const date = (value: Date) => value.toISOString().slice(0, 10);

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== "en" && locale !== "sk") notFound();
  if (!flags().AUTH) notFound();
  const sk = locale === "sk";
  const viewer = await getViewer();
  if (!viewer.userId) redirect(`/${locale}/sign-in`);
  const userId = viewer.userId;
  const db = getPool();
  if (!db) notFound();
  const [profile, linked, recoveryCount, unrevealed] = await Promise.all([
    db.query<{ email: string; locale: string; marketing_consent_at: Date | null; terms_version: string | null }>("SELECT email, locale, marketing_consent_at, terms_version FROM users WHERE id = $1 AND deleted_at IS NULL", [userId]),
    db.query<{ provider_id: string }>("SELECT provider_id FROM auth_accounts WHERE user_id = $1 ORDER BY created_at", [userId]),
    remainingRecoveryCodes(db, userId),
    hasUnrevealedRecoveryCodes(db, userId),
  ]);
  const user = profile.rows[0];
  if (!user) redirect(`/${locale}/sign-in`);
  const hasPassword = linked.rows.some((row) => row.provider_id === "credential");
  const plan = viewer.plan ?? "free";
  const planName = plan === "free" ? "Free" : plan === "passive" ? (sk ? "Pasívny investor" : "Passive investor") : plan === "trial" ? (sk ? "Plus (aktívny investor), skúšobná verzia" : "Plus (Active investor) trial") : (sk ? "Plus (aktívny investor)" : "Plus (Active investor)");
  // The watchlist, screen and alert limits are stock features: only the Active plan (Plus or trial) lifts them.
  const limits = { tier: plan === "plus" || plan === "trial" ? "paid" as const : "free" as const, preview: false };
  const unlimited = sk ? "bez limitu" : "no limit";
  const limit = (key: Parameters<typeof limitFor>[1]) => limitFor(limits, key) ?? unlimited;

  return <article className="frame page">
    <header className="page-head"><h1 className="title">{sk ? "Účet" : "Account"}</h1></header>

    <section>
      <h2>{sk ? "Profil" : "Profile"}</h2>
      <p>{user.email}</p>
      <p>{sk ? "Prihlásenie" : "Sign-in methods"}: {linked.rows.map((row) => row.provider_id === "credential" ? (sk ? "heslo" : "password") : row.provider_id === "google" ? "Google" : row.provider_id).join(", ")}</p>
    </section>

    <section>
      <h2>{sk ? "Plán" : "Plan"}</h2>
      <p>{planName}</p>
      {plan === "trial" && viewer.planEndsAt && <p>{sk ? "Skúšobná verzia končí" : "Trial ends"} {date(viewer.planEndsAt)}. {sk ? "Potom účet prejde na Free. Karta sa nevyžaduje." : "The account then moves to Free. No card is needed."}</p>}
      {(plan === "plus" || plan === "passive") && viewer.planEndsAt && <p>{sk ? "Prístup končí" : "Access ends"} {date(viewer.planEndsAt)}</p>}
      <p>{sk ? "Zoznam sledovaných" : "Watchlist"}: {limit("watchlistTickers")}. {sk ? "Uložené filtre" : "Saved screens"}: {limit("savedScreens")}. {sk ? "Upozornenia" : "Alerts"}: {limit("alerts")}.</p>
      <p>{sk ? "Platby zatiaľ nie sú dostupné." : "Payments are not available yet."}</p>
    </section>

    <section>
      <h2>{sk ? "Súhlasy" : "Consent"}</h2>
      <p>{sk ? "Verzia podmienok" : "Terms version"}: {user.terms_version ?? "-"}</p>
      <form method="post" action="/api/auth/account/consent">
        <input type="hidden" name="locale" value={locale} />
        <label><input type="checkbox" name="marketing" defaultChecked={Boolean(user.marketing_consent_at)} /> {sk ? "Chcem dostávať produktové e-maily" : "Send me product emails"}</label>
        <button type="submit">{sk ? "Uložiť" : "Save"}</button>
      </form>
    </section>

    {hasPassword && <section>
      <h2>{sk ? "Kódy na obnovenie" : "Recovery codes"}</h2>
      <p>{sk ? "Zostávajúce kódy" : "Codes left"}: {recoveryCount}.{recoveryCount < 3 && <strong> {sk ? "Vytvorte nové kódy." : "Generate a new set."}</strong>}</p>
      {unrevealed && <form method="post" action="/api/auth/recovery/reveal">
        <input type="hidden" name="locale" value={locale} />
        <button type="submit">{sk ? "Zobraziť kódy (iba raz)" : "Show codes (once)"}</button>
      </form>}
      <form method="post" action="/api/auth/recovery/regenerate">
        <input type="hidden" name="locale" value={locale} />
        <label>{sk ? "Aktuálne heslo" : "Current password"} <input type="password" name="currentPassword" autoComplete="current-password" required minLength={10} maxLength={128} /></label>
        <button type="submit">{sk ? "Vytvoriť nové kódy" : "Generate new codes"}</button>
      </form>
      <p>{sk ? "Nové kódy zneplatnia všetky staré." : "A new set replaces every old code."}</p>
    </section>}

    <section>
      <h2>{sk ? "Údaje a vymazanie" : "Data and deletion"}</h2>
      <form method="get" action="/api/auth/account/export"><button type="submit">{sk ? "Stiahnuť moje údaje (JSON)" : "Download my data (JSON)"}</button></form>
      <form method="post" action="/api/auth/account/delete">
        <input type="hidden" name="locale" value={locale} />
        <label>{sk ? "Na vymazanie účtu napíšte DELETE" : "Type DELETE to delete your account"} <input name="confirm" required autoComplete="off" /></label>
        <button type="submit">{sk ? "Vymazať účet" : "Delete account"}</button>
      </form>
    </section>

    <form method="post" action="/api/auth/account/sign-out">
      <input type="hidden" name="locale" value={locale} />
      <button type="submit">{sk ? "Odhlásiť sa" : "Sign out"}</button>
    </form>
  </article>;
}
