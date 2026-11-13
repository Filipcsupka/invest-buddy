import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withPageLog } from "@/app/page-log";
import { etfDetail } from "@/db/etf";
import { etfCatalogKeyForPick } from "@/db/etf-catalog";
import { latestEtfScores } from "@/db/etf-score";
import { etfScoreView } from "@/components/etf/owner";
import { EtfStoredScore } from "@/components/etf/score";
import { AdrLine } from "@/components/disclaimer";
import { getMessages } from "@/i18n";
import { getEtfMessages } from "@/i18n/etf-messages";
import { pageMetadata } from "@/i18n/metadata";
import { RecordCard, RecordHead } from "@/components/record-parts";
import { AreaChip } from "@/components/kit";
import { CallBadge, VerificationBadge, amount, displayedDate, percent, signedPercent } from "@/components/etf/format";
import s from "@/components/etf/etf.module.css";
import { resolveLocale } from "@/app/[locale]/locale";
import { requireEtfDataAccess } from "../../owner/data/access";
import { getViewer, isOwner } from "@/viewer/get-viewer";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string; symbol: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await requireEtfDataAccess();
  const locale = await resolveLocale(params);
  const { symbol } = await params;
  const detail = await etfDetail(symbol.toUpperCase());
  if (!detail) notFound();
  return pageMetadata(locale, `/etf/${encodeURIComponent(detail.pick.symbol)}`, `${detail.pick.symbol}, ${detail.pick.name}`, detail.pick.thesis);
}
async function EtfDetailPage({ params }: Props) {
  await requireEtfDataAccess();
  const locale = await resolveLocale(params);
  const { symbol } = await params;
  if (!/^[A-Za-z0-9.-]{1,12}$/.test(symbol)) notFound();
  const detail = await etfDetail(symbol.toUpperCase());
  if (!detail) notFound();
  const { pick, history, outcomes, sample } = detail;
  const m = getEtfMessages(locale);
  const canScore = await etfScoreView();
  const listingKey = canScore ? await etfCatalogKeyForPick(pick) : null;
  const score = listingKey ? (await latestEtfScores([listingKey])).get(listingKey) : null;
  const field = (value: string | null) => value || m.noValue;
  // ADR-001: the call badge (buy zone, watch, avoid) and the plan (entry zone, add and stop-adding rules) are the owner's research
  // notes. Customers, Passive included, get the rule observations only: thesis, events, risks, costs, evidence and outcomes.
  const viewer = await getViewer();
  const ownerNotes = isOwner(viewer) && !viewer.preview;
  return <div className="frame page">
    <RecordHead area={<AreaChip locale={locale} area="etf" />} title={`${pick.symbol} · ${pick.name}`} lede={m.detailLede} stamp={sample ? <span className="stamp">{m.sample}</span> : undefined} meta={<>{ownerNotes ? <><CallBadge call={pick.call} locale={locale} /> </> : null}<VerificationBadge status={pick.verificationStatus} locale={locale} /></>} actions={<Link className="button secondary" href={`/${locale}/etf`}>{m.back}</Link>} />
    <div className={s.stack}>
      {canScore ? <RecordCard id="etf-score" title={m.scoreTitle} lede={m.scoreNote}><EtfStoredScore score={score} m={m} /><p>{m.scoreMethod}</p><AdrLine text={getMessages(locale).common.disclaimer} /></RecordCard> : null}
      <RecordCard id="etf-thesis" title={m.thesis}><p className={s.lead}>{pick.thesis || m.noValue}</p></RecordCard>
      <RecordCard id="etf-happened" title={m.whatHappened}>{pick.whatHappened.length ? <ul className={s.list}>{pick.whatHappened.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>{m.noValue}</p>}</RecordCard>
      <RecordCard id="etf-matters" title={m.whyItMatters}><p className={s.lead}>{pick.whyItMatters || m.noValue}</p></RecordCard>
      {ownerNotes ? <RecordCard id="etf-plan" title={m.plan}><dl className={s.facts}><div><dt>{m.entryZone}</dt><dd>{field(pick.plan.entryZone)}</dd></div><div><dt>{m.addWhen}</dt><dd>{field(pick.plan.addWhen)}</dd></div><div><dt>{m.stopAddingWhen}</dt><dd>{field(pick.plan.stopAddingWhen)}</dd></div></dl></RecordCard> : null}
      <RecordCard id="etf-risks" title={m.risks}>{pick.risks.length ? <ul className={s.list}>{pick.risks.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>{m.noValue}</p>}</RecordCard>
      <RecordCard id="etf-costs" title={m.costs}><dl className={s.facts}><div><dt>{m.ter}</dt><dd>{percent(locale, pick.terPct)}</dd></div><div><dt>{m.aum}</dt><dd>{amount(locale, pick.aumUsdM)}</dd></div><div><dt>{m.index}</dt><dd>{field(pick.trackedIndex)}</dd></div><div><dt>{m.domicile}</dt><dd>{field(pick.domicile)}</dd></div><div><dt>{m.replication}</dt><dd>{field(pick.replication)}</dd></div><div><dt>{m.price}</dt><dd>{pick.price === null ? m.noValue : `${amount(locale, pick.price, 2)} ${pick.priceCurrency ?? ""} · ${displayedDate(locale, pick.priceAsOf)}`}</dd></div></dl></RecordCard>
      <RecordCard id="etf-evidence" title={m.evidence}>{pick.evidence.length ? <ul className={s.evidence}>{pick.evidence.map((item, index) => <li key={`${item.url}-${index}`}><VerificationBadge status={item.verified ? "verified" : "unverified"} locale={locale} /> <span>{m.claim}: {item.claim}</span><blockquote>“{item.quote}”</blockquote><a href={item.url} target="_blank" rel="noopener noreferrer">{item.url}</a></li>)}</ul> : <p>{m.noEvidence}</p>}</RecordCard>
      <RecordCard id="etf-history" title={m.history}>{history.length ? <div className={s.tableWrap}><table className={s.table}><thead><tr><th scope="col">{m.lastSeen}</th>{ownerNotes ? <th scope="col">{m.call}</th> : null}<th scope="col">{m.conviction}</th><th scope="col">{m.price}</th></tr></thead><tbody>{history.map((item) => <tr key={item.asOf}><td>{displayedDate(locale, item.asOf)}</td>{ownerNotes ? <td><CallBadge call={item.call} locale={locale} /></td> : null}<td>{item.conviction === null ? m.noValue : `${item.conviction}/5`}</td><td>{item.price === null ? m.noValue : `${amount(locale, item.price, 2)} ${item.priceCurrency ?? ""}`}</td></tr>)}</tbody></table></div> : <p>{m.noHistory}</p>}</RecordCard>
      <RecordCard id="etf-outcomes" title={m.outcomes}>{outcomes.length ? <div className={s.tableWrap}><table className={s.table}><thead><tr><th scope="col">{m.horizon}</th><th scope="col">{m.fundReturn}</th><th scope="col">{m.benchmark}</th><th scope="col">{m.benchmarkReturn}</th><th scope="col">{m.excess}</th></tr></thead><tbody>{outcomes.map((item) => <tr key={item.horizonDays}><td>{item.horizonDays} {m.days}</td><td>{signedPercent(locale, item.returnPct)}</td><td>{item.benchmarkSymbol}</td><td>{signedPercent(locale, item.benchmarkReturnPct)}</td><td>{signedPercent(locale, item.excessPct)}</td></tr>)}</tbody></table></div> : <p>{m.noDetailOutcomes}</p>}</RecordCard>
    </div>
  </div>;
}
export default withPageLog("/etf/[symbol]", EtfDetailPage);
