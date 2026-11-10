import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ownerAuthorized } from "@/app/[locale]/owner/auth";
import { pageMetadata } from "@/i18n/metadata";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (locale !== "en" && locale !== "sk") notFound();
  return { ...pageMetadata(locale, "/owner-sign-in", locale === "sk" ? "Prihlásenie vlastníka" : "Owner sign in", locale === "sk" ? "Súkromné prihlásenie vlastníka." : "Private owner sign in."), robots: { index: false, follow: false } };
}

export default async function OwnerSignIn({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ error?: string }> }) {
  const { locale } = await params;
  if (locale !== "en" && locale !== "sk") notFound();
  const signedIn = ownerAuthorized(await headers(), process.env.OWNER_RESEARCH_PASSWORD);
  const failed = (await searchParams).error === "1";
  const sk = locale === "sk";
  return <article className="frame page">
    <header className="page-head"><h1 className="title">{sk ? "Prihlásenie vlastníka" : "Owner sign in"}</h1></header>
    {signedIn ? <>
      <p>{sk ? "Ste prihlásený." : "You are signed in."}</p>
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
