import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getPool } from "@/db/pool";
import { pageMetadata } from "@/i18n/metadata";
import { ownerDataMessages } from "@/i18n/owner-data-messages";
import { ownerAuthorized } from "../../auth";
import { ownerTickerData } from "../store";
import { DataTable } from "../table";
import s from "../data.module.css";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ ticker?: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (locale !== "en" && locale !== "sk") notFound();
  return { ...pageMetadata(locale, "/owner/data/ticker", ownerDataMessages(locale).tickerTitle, ownerDataMessages(locale).lede), robots: { index: false, follow: false } };
}
export default async function OwnerTickerPage({ params, searchParams }: Props) {
  if (!ownerAuthorized((await headers()).get("authorization"), process.env.OWNER_RESEARCH_PASSWORD)) notFound();
  const { locale } = await params;
  if (locale !== "en" && locale !== "sk") notFound();
  const ticker = (await searchParams).ticker?.trim().toUpperCase();
  if (!ticker || !/^[A-Z0-9.-]{1,20}$/.test(ticker)) notFound();
  const db = getPool();
  if (!db) notFound();
  const m = ownerDataMessages(locale);
  const data = await ownerTickerData(db, ticker);
  if (!data.identity) notFound();
  const section = (id: string, title: string, rows: Record<string, unknown>[]) => <section className={s.section} aria-labelledby={id} key={id}>
    <h2 id={id}>{title}</h2><DataTable rows={rows} columns={rows[0] ? Object.keys(rows[0]).map((key) => ({ key, label: key.replaceAll("_", " ") })) : []} empty={m.empty} />
  </section>;
  return <article className="frame page" data-owner-data=""><div className={s.stack}>
    <header className={s.head}><p><Link href={`/${locale}/owner/data`}>{m.back}</Link></p><h1 className="title">{ticker} · {m.tickerTitle}</h1><p>{m.lede}</p></header>
    {section("identity", m.identity, [data.identity])}
    {section("bars", m.bars, data.bars)}
    {section("fundamentals", m.fundamentals, data.fundamentals)}
    {section("eps", m.eps, data.eps)}
    {section("calendar", m.calendar, data.calendar)}
    {section("catalysts", m.catalysts, data.catalysts)}
    {section("insiders", m.insiders, data.insiders)}
    {section("documents", m.documents, data.documents)}
    {section("actions", m.actions, data.actions)}
    {section("refresh", m.refresh, data.refresh)}
  </div></article>;
}
