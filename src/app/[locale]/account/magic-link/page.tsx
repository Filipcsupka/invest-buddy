import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageMetadata } from "@/i18n/metadata";
import { flags } from "@/config/flags";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (locale !== "en" && locale !== "sk") notFound();
  return { ...pageMetadata(locale, "/account/magic-link", locale === "sk" ? "Potvrďte prihlásenie" : "Confirm sign in", locale === "sk" ? "Potvrdenie prihlásenia." : "Confirm sign in."), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function MagicLinkPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ token?: string }> }) {
  const { locale } = await params;
  if ((locale !== "en" && locale !== "sk") || !flags().AUTH || !flags().MAGIC_LINK) notFound();
  const { token } = await searchParams;
  if (!token || !/^[A-Za-z0-9_-]{20,128}$/.test(token)) notFound();
  return <main className="frame page"><h1>{locale === "sk" ? "Potvrďte prihlásenie" : "Confirm sign in"}</h1><form method="post" action="/api/auth/magic-link/consume"><input type="hidden" name="token" value={token} /><button type="submit">{locale === "sk" ? "Pokračovať" : "Continue"}</button></form></main>;
}
