import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AiCardView } from "@/components/ai-screen/card";
import styles from "@/components/ai-screen/screen.module.css";
import { aiCardsData } from "@/data/ai-cards";
import { getMessages, formatDate } from "@/i18n";
import { pageMetadata } from "@/i18n/metadata";
import { resolveLocale } from "../../locale";

type Props = { params: Promise<{ locale: string; symbol: string }> };
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const value = await params;
  const locale = await resolveLocale(Promise.resolve(value));
  return { ...pageMetadata(locale, `/ai-screen/${value.symbol}`, `${value.symbol} · ${getMessages(locale).aiScreen.title}`, getMessages(locale).aiScreen.intro), robots: { index: false, follow: false } };
}
export default async function AiCardDetailPage({ params }: Props) {
  const value = await params;
  const locale = await resolveLocale(Promise.resolve(value));
  const symbol = value.symbol.toUpperCase();
  const m = getMessages(locale).aiScreen;
  const cards = (await aiCardsData()).cards.filter((c) => c.symbol === symbol);
  if (!cards.length) notFound();
  return <main className={`frame page ${styles.page}`}><header className={styles.lead}><Link href={`/${locale}/ai-screen`}>{m.all}</Link><h1 className="title">{symbol}</h1><p className={styles.intro}>{m.intro}</p></header>
    <section className={styles.section}><h2>{m.latest}</h2><AiCardView card={cards[0]} locale={locale} expanded /></section>
    {cards.length > 1 && <section className={styles.section}><h2>{m.past}</h2>{cards.slice(1).map((card) => <AiCardView key={card.id} card={card} locale={locale} expanded />)}</section>}
    <section className={styles.panel} id="history"><h2>{m.history}</h2><ol className={styles.timeline}>{cards.map((card) => <li key={card.id}><time dateTime={card.cardDate ?? undefined}>{card.cardDate ? formatDate(locale, card.cardDate) : ""}</time>{card.callText}</li>)}</ol></section>
  </main>;
}
