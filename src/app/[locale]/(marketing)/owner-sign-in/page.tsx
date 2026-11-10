import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ownerAuthorized } from "@/app/[locale]/owner/auth";
import { pageMetadata } from "@/i18n/metadata";
import { ownerSessionFromCookieHeader, verifyOwnerSession } from "@/security/owner-session";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (locale !== "en" && locale !== "sk") notFound();
  return { ...pageMetadata(locale, "/owner-sign-in", locale === "sk" ? "Prihlásenie vlastníka" : "Owner sign in", locale === "sk" ? "Súkromné prihlásenie vlastníka." : "Private owner sign in."), robots: { index: false, follow: false } };
}

export default async function OwnerSignIn({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string }> }) {
  const { locale } = await params;
  if (locale !== "en" && locale !== "sk") notFound();
  const requestHeaders = await headers();
  const signedIn = ownerAuthorized(requestHeaders, process.env.OWNER_RESEARCH_PASSWORD);
  const cookieSignedIn = verifyOwnerSession(ownerSessionFromCookieHeader(requestHeaders.get("cookie")), process.env.OWNER_RESEARCH_PASSWORD);
  const failed = (await searchParams).error === "1";
  const sk = locale === "sk";
  return <article className="frame page">
    <header className="page-head"><h1 className="title">{sk ? "Prihlásenie vlastníka" : "Owner sign in"}</h1></header>
    {signedIn ? <>
      <p>{sk ? "Ste prihlásený." : "You are signed in."}</p>
      <div className="actions">
        <Link className="button cta" href={`/${locale}/dashboard`}>{sk ? "Otvoriť prehľad" : "Open dashboard"}</Link>
        <Link className="button secondary" href={`/${locale}/scanner`}>{sk ? "Otvoriť aplikáciu" : "Open app"}</Link>
      </div>
      {!cookieSignedIn && <p>{sk ? "Ste prihlásený heslom uloženým v prehliadači. Ak sa chcete odhlásiť, prihláste sa cez tento formulár." : "Signed in with the browser password; use the cookie sign-in to be able to sign out."}</p>}
      <form method="post" action="/api/owner/logout"><input type="hidden" name="locale" value={locale} /><button type="submit">{sk ? "Odhlásiť sa" : "Sign out"}</button></form>
    </> : <>
      {failed && <p role="alert">{sk ? "Nesprávne heslo alebo chýba nastavenie relácie." : "Incorrect password or session setup is missing."}</p>}
      <form method="post" action="/api/owner/login">
        <input type="hidden" name="locale" value={locale} />
        <label htmlFor="owner-password">{sk ? "Heslo vlastníka" : "Owner password"}</label>
        <input id="owner-password" name="password" type="password" autoComplete="current-password" required />
        <button type="submit">{sk ? "Prihlásiť sa" : "Sign in"}</button>
      </form>
    </>}
  </article>;
}
