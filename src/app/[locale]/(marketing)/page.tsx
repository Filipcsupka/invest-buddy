import type { Metadata } from "next";
import { preload } from "react-dom";
import { StateBoard } from "@/components/landing/sections";
import { StickyCta } from "@/components/welcome/sticky-cta";
import { AreaGrid, CloseBlock, Faq, RuleBand, ScoreStory, Tiers, Trust, WelcomeHero } from "@/components/welcome/sections";
import { WelcomeMotion } from "@/components/welcome/welcome-motion";
import styles from "@/components/welcome/welcome.module.css";
import { flags } from "@/config/flags";
import { pageMetadata } from "@/i18n/metadata";
import { getWelcomeMessages } from "@/i18n/welcome-messages";
import { resolveLocale, type LocaleParams } from "@/app/[locale]/locale";

/*
 * The Welcome page. One HTML per locale for every visitor: no headers(), no cookies, no database and no vendor read here. Every score on
 * the page is SAMPLE data from invented companies, scored by the real engine (src/components/welcome/sample-data.ts). Signed-in state
 * arrives through small client islands (SignedInSwap, AccountEntry) and the motion layer loads after the page is idle.
 */
export const revalidate = 3600;

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = getWelcomeMessages(locale).hero;
  return pageMetadata(locale, "", null, `${t.title} ${t.lede}`);
}

export default async function Welcome({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  const f = flags();
  const t = getWelcomeMessages(locale);
  // The hero is set in Manrope and Inter; fetching both early keeps the swap from moving the board on slow phones.
  for (const font of ["manrope-latin-wght-normal", "inter-latin-wght-normal"]) preload(`/fonts/${font}.woff2`, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  return (
    <div className={styles.page} data-welcome="">
      <WelcomeHero locale={locale} />
      <RuleBand locale={locale} />
      <ScoreStory locale={locale} />
      <AreaGrid locale={locale} />
      <StateBoard locale={locale} counts={null} adviceOutput={f.ADVICE_OUTPUT} />
      <Tiers locale={locale} pricingOpen={f.WAITLIST} />
      <Trust locale={locale} />
      <Faq locale={locale} />
      <CloseBlock locale={locale} />
      <StickyCta locale={locale} label={t.sticky} />
      <WelcomeMotion />
    </div>
  );
}
