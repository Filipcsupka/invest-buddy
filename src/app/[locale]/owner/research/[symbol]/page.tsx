import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPool } from "@/db/pool";
import { flags } from "@/config/flags";
import { getMessages } from "@/i18n";
import { pageMetadata } from "@/i18n/metadata";
import { headers } from "next/headers";
import { ownerResearchAuthorized } from "../auth";
import { loadOwnerContext } from "@/db/owner-context";
import { catalystLine, graduationLine, macroLine, revisionLine } from "@/notify/research-card";
import { ownerResearchMessages } from "@/i18n/owner-research-messages";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string; symbol: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, symbol } = await params;
  if (locale !== "en" && locale !== "sk") notFound();
  return { ...pageMetadata(locale, `/owner/research/${encodeURIComponent(symbol)}`, `Research: ${symbol}`, "Private research facts and history."), robots: { index: false, follow: false } };
}

export default async function OwnerResearchPage({ params }: Props) {
  if (!flags().OWNER_VIEW || !ownerResearchAuthorized((await headers()).get("authorization"), process.env.OWNER_RESEARCH_PASSWORD)) notFound();
  const { locale, symbol } = await params;
  if (locale !== "en" && locale !== "sk" || !/^[A-Z0-9.]{1,10}$/.test(symbol)) notFound();
  const db = getPool();
  if (!db) notFound();
  const candidate = (await db.query<{ company_name: string; state: string; state_since: string; promotion_status: string; scorable: boolean }>(
    "SELECT company_name,state,state_since::text,promotion_status,scorable FROM research_candidates WHERE symbol=$1", [symbol])).rows[0];
  if (!candidate) notFound();
  const events = (await db.query<{ id: number; at: string; kind: string; reason: string | null }>(
    "SELECT id,at::text,kind,reason FROM research_events WHERE symbol=$1 ORDER BY at DESC,id DESC LIMIT 50", [symbol])).rows;
  const facts = (await db.query<{ id: number; claim: string; verification_status: string; confirmed: boolean; evidence: { url: string; sourceName: string; verify?: { status: string } }[] }>(
    `SELECT DISTINCT ON (dedupe_key) id,claim,verification_status,confirmed,evidence FROM research_findings
     WHERE symbol=$1 ORDER BY dedupe_key,(verification_status='verified') DESC,verified_at DESC NULLS LAST,id DESC`, [symbol])).rows;
  const verified = facts.filter(f => f.verification_status === "verified");
  const leads = facts.filter(f => f.verification_status === "lead_only" || f.verification_status === "fetch_failed");
  const sk = locale === "sk";
  const context = (await loadOwnerContext(db, [symbol], new Date().toISOString().slice(0, 10))).get(symbol);
  const m = ownerResearchMessages[locale];
  const contextLines = [
    catalystLine(context?.nextCatalyst ?? null, locale) ?? m.noCatalyst, macroLine(context?.macro ?? [], locale) ?? m.noMacro,
    graduationLine(context?.graduation ?? null, locale) ?? m.noGraduation, revisionLine(context?.revision ?? null, locale, "owner") ?? m.noRevision,
  ];
  return <article className="frame page">
    <header className="page-head"><h1 className="title">{symbol} · {candidate.company_name}</h1>
      <p className="lede">{sk ? "Stav výskumu" : "Research state"}: {candidate.state}</p>
      <p className="notice">{getMessages(locale).ownerAllocation.disclaimer}</p></header>
    <section className="sheet-section"><h2>{sk ? "Pokrytie" : "Coverage"}</h2>
      <p>{candidate.scorable ? (sk ? "V pokrytí skórovania" : "In scoring coverage") : (sk ? "Mimo pokrytia skórovania" : "Outside scoring coverage")}</p>
      <p>{sk ? "Zaradenie" : "Promotion"}: {candidate.promotion_status}</p></section>
    <section className="sheet-section"><h2>{m.title}</h2>
      <ul>{contextLines.map(line => <li key={line}>{line}</li>)}</ul></section>
    <section className="sheet-section"><h2>{sk ? "Overené zistenia" : "Verified facts"}</h2>
      {verified.length ? <ul>{verified.map(f => <li key={f.id}>{f.claim} {!f.confirmed && (sk ? "(NEPOTVRDENÉ)" : "(UNCONFIRMED)")}
        {f.evidence.filter(e => e.verify?.status === "verified" && /^https:\/\//.test(e.url)).slice(0, 2).map(e => <span key={e.url}> · <a href={e.url} rel="noopener noreferrer">{e.sourceName}</a></span>)}</li>)}</ul> : <p>{sk ? "Zatiaľ bez overených zistení." : "No verified facts yet."}</p>}</section>
    <section className="sheet-section"><h2>{sk ? "Nepotvrdené podnety" : "Unconfirmed leads"}</h2>
      {leads.length ? <ul>{leads.map(f => <li key={f.id}>{f.claim}{f.verification_status === "fetch_failed" ? ` (${sk ? "načítanie zlyhalo" : "fetch failed"})` : ""}</li>)}</ul> : <p>{sk ? "Žiadne." : "None."}</p>}</section>
    <section className="sheet-section"><h2>{sk ? "História" : "History"}</h2>
      <ol>{events.map(e => <li key={e.id}><time dateTime={e.at}>{e.at.slice(0, 10)}</time> · {e.kind}{e.reason ? ` · ${e.reason}` : ""}</li>)}</ol></section>
  </article>;
}
