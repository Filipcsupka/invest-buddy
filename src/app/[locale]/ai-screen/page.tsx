import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AiCardView } from "@/components/ai-screen/card";
import { AiCardImportForm } from "@/components/ai-screen/import-form";
import styles from "@/components/ai-screen/screen.module.css";
import { flags } from "@/config/flags";
import { aiCardsData } from "@/data/ai-cards";
import { latestBySymbol } from "@/db/ai-cards";
import { getMessages, formatDate } from "@/i18n";
import { pageMetadata } from "@/i18n/metadata";
import { ownerResearchAuthorized } from "../owner/research/auth";
import { resolveLocale, type LocaleParams } from "../locale";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMessages(locale).aiScreen;
  return { ...pageMetadata(locale, "/ai-screen", m.title, m.intro), robots: { index: false, follow: false } };
}

export default async function AiScreenPage({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  if (!flags().OWNER_VIEW || !ownerResearchAuthorized((await headers()).get("authorization"), process.env.OWNER_RESEARCH_PASSWORD)) notFound();
  const m = getMessages(locale).aiScreen;
  const { cards, comparison, sample } = await aiCardsData();
  const latest = latestBySymbol(cards);
  const groups = [
    { heading: m.active, items: latest.filter((c) => c.call === "START" || c.call === "ADD") },
    { heading: m.watch, items: latest.filter((c) => c.call === "WATCH" || c.call === "HOLD" || c.call === "OTHER") },
    { heading: m.reduce, items: latest.filter((c) => c.call === "REDUCE" || c.call === "STOP_ADD") },
  ];
  return <main className={`frame page ${styles.page}`}>
    <header className={styles.lead}><h1 className="title">{m.title}</h1><p className={styles.intro}>{m.intro}</p>{sample && <p>{m.sample}</p>}</header>
    <section className={styles.panel}><h2>{m.glossary}</h2><p>{m.glossaryText}</p></section>
    {groups.map(({ heading, items }) => <section className={styles.section} key={heading} aria-label={heading}><h2>{heading} <small>({items.length})</small></h2><div className={styles.grid}>{items.map((card) => <AiCardView key={card.id} card={card} locale={locale} />)}</div></section>)}
    {cards.length === 0 && <p>{m.noCards}</p>}
    <section className={styles.panel}><h2>{m.compare}</h2><ul className={styles.timeline}>{latest.map((card) => <li key={card.symbol}><strong>{card.symbol}</strong>: {comparison[card.symbol] ? comparison[card.symbol]?.score === null ? m.noScore : `${comparison[card.symbol]?.state} · ${comparison[card.symbol]?.score}` : m.uncovered}</li>)}</ul></section>
    <section className={styles.panel}><h2>{m.history}</h2><ol className={styles.timeline}>{cards.map((card) => <li key={card.id}><time dateTime={card.cardDate ?? undefined}>{card.cardDate ? formatDate(locale, card.cardDate) : ""}</time><Link href={`/${locale}/ai-screen/${encodeURIComponent(card.symbol)}`}>{card.symbol}</Link> · {card.callText} · {card.summary || card.rawText.slice(0, 100)}</li>)}</ol>
      <h3>{m.bySymbol}</h3>{latest.map((item) => <details key={item.symbol}><summary>{item.symbol} · {item.callText}</summary><ol className={styles.timeline}>{cards.filter((card) => card.symbol === item.symbol).map((card) => <li key={card.id}><time dateTime={card.cardDate ?? undefined}>{card.cardDate ? formatDate(locale, card.cardDate) : ""}</time>{card.callText}</li>)}</ol></details>)}
    </section>
    <AiCardImportForm labels={m} />
  </main>;
}
