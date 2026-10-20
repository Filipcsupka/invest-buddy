import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getPool } from "@/db/pool";
import { flags } from "@/config/flags";
import { pageMetadata } from "@/i18n/metadata";
import { ownerResearchAuthorized } from "./auth";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (locale !== "en" && locale !== "sk") notFound();
  return { ...pageMetadata(locale, "/owner/research", "Research candidates", "Private list of researched names."), robots: { index: false, follow: false } };
}

interface Row { symbol: string; company_name: string; exchange: string | null; state: string; state_since: string; scorable: boolean; in_universe: boolean; promotion_status: string; thesis: string; verified: string; confirmed: string }
interface Pending { symbol: string; name: string; rule_score: number; rule_state: string; week_start: string; status: string }

export default async function OwnerResearchList({ params }: Props) {
  if (!flags().OWNER_VIEW || !ownerResearchAuthorized((await headers()).get("authorization"), process.env.OWNER_RESEARCH_PASSWORD)) notFound();
  const { locale } = await params;
  if (locale !== "en" && locale !== "sk") notFound();
  const db = getPool();
  if (!db) notFound();
  const rows = (await db.query<Row>(
    `SELECT c.symbol,c.company_name,c.exchange,c.state,c.state_since::text,c.scorable,c.in_universe,c.promotion_status,left(c.thesis,200) AS thesis,
       (SELECT count(DISTINCT dedupe_key) FROM research_findings f WHERE f.symbol=c.symbol AND f.verification_status='verified')::text AS verified,
       (SELECT count(DISTINCT dedupe_key) FROM research_findings f WHERE f.symbol=c.symbol AND f.verification_status='verified' AND f.confirmed)::text AS confirmed
     FROM research_candidates c ORDER BY c.in_universe, c.state_since DESC, c.symbol`)).rows;
  const pending = (await db.query<Pending>(
    `SELECT symbol,name,rule_score,rule_state,week_start::text,status FROM discovery_candidates
     WHERE week_start >= current_date - 28 ORDER BY week_start DESC, rule_score DESC, symbol`)).rows;
  const sk = locale === "sk";
  return <article className="frame page">
    <header className="page-head"><h1 className="title">{sk ? "Výskumní kandidáti" : "Research candidates"}</h1>
      <p className="lede">{sk ? "Súkromný prehľad. Len informácie, nie rada." : "Private overview. Information only, not advice."}</p></header>
    <section className="sheet-section"><h2>{sk ? "Mimo skórovaného zoznamu" : "Outside the scored list"}</h2>
      <ul>{rows.filter(r => !r.in_universe).map(r => <li key={r.symbol}>
        <Link href={`/${locale}/owner/research/${encodeURIComponent(r.symbol)}`}>{r.symbol}</Link> · {r.company_name}{r.exchange ? ` (${r.exchange})` : ""} · {r.state} {r.state_since.slice(0, 10)}
        {" · "}{r.verified} {sk ? "overených" : "verified"}, {r.confirmed} {sk ? "potvrdených" : "confirmed"}
        {!r.scorable && ` · ${sk ? "mimo pokrytia skórovania" : "outside scoring coverage"}`}
        {r.thesis && <p>{r.thesis}</p>}</li>)}</ul></section>
    <section className="sheet-section"><h2>{sk ? "Skórované názvy so zistením" : "Scored names with research"}</h2>
      <ul>{rows.filter(r => r.in_universe).map(r => <li key={r.symbol}>
        <Link href={`/${locale}/owner/research/${encodeURIComponent(r.symbol)}`}>{r.symbol}</Link> · {r.company_name} · {r.state} · {r.verified} {sk ? "overených" : "verified"}</li>)}</ul></section>
    <section className="sheet-section"><h2>{sk ? "Kandidáti objavovania (4 týždne)" : "Discovery candidates (4 weeks)"}</h2>
      <ul>{pending.map(p => <li key={`${p.week_start}-${p.symbol}`}>{p.symbol} · {p.name} · {p.rule_state} {p.rule_score} · {p.status} · {p.week_start}</li>)}</ul></section>
  </article>;
}
