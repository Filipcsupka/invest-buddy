import type { Metadata } from "next";
import { headers } from "next/headers";
import { AiCardView } from "@/components/ai-screen/card";
import { AiCardImportForm } from "@/components/ai-screen/import-form";
import styles from "@/components/ai-screen/screen.module.css";
import { flags } from "@/config/flags";
import { aiCardsData } from "@/data/ai-cards";
import { latestBySymbol } from "@/db/ai-cards";
import { getMessages } from "@/i18n";
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
  const m = getMessages(locale).aiScreen;
  const canImport = flags().OWNER_VIEW && ownerResearchAuthorized((await headers()).get("authorization"), process.env.OWNER_RESEARCH_PASSWORD);
  const { cards, comparison, sample } = await aiCardsData();
  const latest = latestBySymbol(cards);
  const cardCounts = new Map<string, number>();
  for (const card of cards) cardCounts.set(card.symbol, (cardCounts.get(card.symbol) ?? 0) + 1);
  const groups = [
    { heading: m.active, items: latest.filter((c) => c.call === "START" || c.call === "ADD") },
    { heading: m.watch, items: latest.filter((c) => c.call === "WATCH" || c.call === "HOLD" || c.call === "OTHER") },
    { heading: m.reduce, items: latest.filter((c) => c.call === "REDUCE" || c.call === "STOP_ADD") },
  ];
  return <main className={`frame page ${styles.page}`}>
    <header className={styles.lead}><h1 className="title">{m.title}</h1><p className={styles.intro}>{m.intro}</p><p className={styles.intro}>{m.green}</p><p className={styles.intro}>{m.figures}</p>{sample && <p>{m.sample}</p>}</header>
    <section className={styles.panel}><h2>{m.glossary}</h2><p>{m.glossaryText}</p></section>
    {groups.map(({ heading, items }) => <section className={styles.section} key={heading} aria-label={heading}><h2>{heading} <small>({items.length})</small></h2><div className={styles.grid}>{items.map((card) => <AiCardView key={card.id} card={card} locale={locale} earlierCount={(cardCounts.get(card.symbol) ?? 1) - 1} />)}</div></section>)}
    {cards.length === 0 && <p>{m.noCards}</p>}
    <section className={styles.panel}><h2>{m.compare}</h2><ul className={styles.timeline}>{latest.map((card) => <li key={card.symbol}><strong>{card.symbol}</strong>: {comparison[card.symbol] ? comparison[card.symbol]?.score === null ? m.noScore : `${comparison[card.symbol]?.state} · ${comparison[card.symbol]?.score}` : m.uncovered}</li>)}</ul></section>
    {canImport && <AiCardImportForm labels={m} />}
  </main>;
}
