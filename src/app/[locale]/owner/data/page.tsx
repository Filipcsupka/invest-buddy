import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getPool } from "@/db/pool";
import { pageMetadata } from "@/i18n/metadata";
import { ownerDataMessages } from "@/i18n/owner-data-messages";
import { ownerAuthorized } from "../auth";
import { ownerDataOverview } from "./store";
import { DataTable } from "./table";
import s from "./data.module.css";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string }>; searchParams?: Promise<{ etfPage?: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (locale !== "en" && locale !== "sk") notFound();
  return { ...pageMetadata(locale, "/owner/data", ownerDataMessages(locale).title, ownerDataMessages(locale).lede), robots: { index: false, follow: false } };
}
export default async function OwnerDataPage({ params, searchParams }: Props) {
  if (!ownerAuthorized((await headers()).get("authorization"), process.env.OWNER_RESEARCH_PASSWORD)) notFound();
  const { locale } = await params;
  if (locale !== "en" && locale !== "sk") notFound();
  const db = getPool();
  if (!db) notFound();
  const m = ownerDataMessages(locale);
  const etfPage = Number((await searchParams)?.etfPage ?? 1);
  const data = await ownerDataOverview(db, etfPage);
  const section = (id: string, title: string, rows: Record<string, unknown>[], columns: { key: string; label: string }[]) =>
    <section className={s.section} aria-labelledby={id} key={id}><h2 id={id}>{title}</h2><DataTable rows={rows} columns={columns} empty={m.empty} /></section>;
  return <article className="frame page" data-owner-data="">
    <div className={s.stack}>
      <header className={s.head}><h1 className="title">{m.title}</h1><p>{m.lede}</p></header>
      <section className={s.section} aria-labelledby="ticker"><h2 id="ticker">{m.tickerTitle}</h2><p>{m.tickerHint}</p>
        <form className={s.form} action={`/${locale}/owner/data/ticker`} method="get"><label>{m.tickerLabel}<input name="ticker" maxLength={20} autoCapitalize="characters" required /></label><button className="button" type="submit">{m.open}</button></form>
      </section>
      {section("source-freshness", m.source, data.sources, [{ key: "family", label: m.source }, { key: "records", label: m.records }, { key: "latest", label: m.latest }])}
      {section("usage", m.usage, data.usage, [{ key: "day", label: m.day }, { key: "job", label: m.job }, { key: "requests", label: m.requests }, { key: "credits", label: m.credits }])}
      {section("symbols", m.exchanges, data.exchanges, [{ key: "exchange", label: m.exchanges }, { key: "active", label: m.active }, { key: "symbols", label: m.total }, { key: "last_seen", label: m.latest }])}
      {section("universe", m.universe, data.universe, [{ key: "exchange", label: m.exchanges }, { key: "list", label: m.list }, { key: "tickers", label: m.tickers }, { key: "symbols", label: m.tickerLabel }, { key: "latest_change", label: m.latest }])}
      {section("etf", m.etfs, data.etfs, [{ key: "listing_key", label: m.tickerLabel }, { key: "name", label: "ETF" }, { key: "exchange", label: m.exchanges }, { key: "ter_pct", label: m.ter }, { key: "aum_usd_m", label: m.aum }, { key: "holdings_count", label: m.holdings }, { key: "region", label: m.region }, { key: "enrichment_status", label: m.status }, { key: "enriched_at", label: m.enriched }, { key: "enrichment_source", label: m.source }])}
      {data.etfPages > 1 && <nav className={s.actions} aria-label={m.etfs}>{data.etfPage > 1 && <Link href={`/${locale}/owner/data?etfPage=${data.etfPage - 1}#etf`}>{locale === "sk" ? "Predchádzajúca" : "Previous"}</Link>}<span>{data.etfPage} / {data.etfPages}</span>{data.etfPage < data.etfPages && <Link href={`/${locale}/owner/data?etfPage=${data.etfPage + 1}#etf`}>{locale === "sk" ? "Ďalšia" : "Next"}</Link>}</nav>}
      {section("macro", m.macro, data.macro, [{ key: "series_id", label: m.source }, { key: "obs_date", label: m.latest }, { key: "value", label: m.records }, { key: "source_id", label: m.source }, { key: "observed_at", label: m.enriched }])}
      {section("jobs", m.jobs, data.jobs, [{ key: "job", label: m.job }, { key: "status", label: m.status }, { key: "started_at", label: m.started }, { key: "ended_at", label: m.ended }, { key: "counts", label: m.details }])}
      <p><Link href={`/${locale}/owner/horizons`}>{locale === "sk" ? "Horizontové profily" : "Horizon profiles"}</Link></p>
    </div>
  </article>;
}
