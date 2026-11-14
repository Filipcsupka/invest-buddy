import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withPageLog } from "@/app/page-log";
import { etfCatalogDetail } from "@/db/etf-catalog";
import { etfDetail } from "@/db/etf";
import { getEtfMessages } from "@/i18n/etf-messages";
import { pageMetadata } from "@/i18n/metadata";
import { RecordCard, RecordHead } from "@/components/record-parts";
import { AreaChip } from "@/components/kit";
import { CallBadge, displayedDate, percent, amount, signedPercent } from "@/components/etf/format";
import { etfOwnerView, etfPickOwnerView, etfScoreView, requireEtfScreeningAccess } from "@/components/etf/owner";
import { latestEtfScores } from "@/db/etf-score";
import { EtfStoredScore } from "@/components/etf/score";
import { isVendorSourceUrl } from "@/components/etf/source-url";
import { AdrLine } from "@/components/disclaimer";
import { getMessages } from "@/i18n";
import { ETF_TABS, etfTabHref } from "@/components/etf/tabs";
import { getEtfDetailMessages } from "@/i18n/etf-messages";
import { getEtfFundMessages } from "@/i18n/etf-fund-messages";
import { EtfRuleBreakdown } from "@/components/etf/breakdown";
import s from "@/components/etf/etf.module.css";
import { resolveLocale } from "@/app/[locale]/locale";


export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string; key: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await requireEtfScreeningAccess();
  const locale = await resolveLocale(params);
  const { key } = await params;
  if (!/^[A-Za-z0-9:._-]{1,80}$/.test(key)) notFound();
  const result = await etfCatalogDetail(key.toUpperCase());
  if (!result) notFound();
  return pageMetadata(locale, `/etf/fund/${encodeURIComponent(result.fund.listingKey)}`, result.fund.name, getEtfMessages(locale).fundLede);
}
async function EtfFundPage({ params }: Props) {
  await requireEtfScreeningAccess();
  const locale = await resolveLocale(params);
  const { key } = await params;
  if (!/^[A-Za-z0-9:._-]{1,80}$/.test(key)) notFound();
  const result = await etfCatalogDetail(key.toUpperCase());
  if (!result) notFound();
  const { fund, sample } = result;
  const owner = await etfOwnerView();
  const pickOwner = await etfPickOwnerView();
  const detail = pickOwner && fund.pickSymbol ? await etfDetail(fund.pickSymbol) : null;
  const m = getEtfMessages(locale);
  const canScore = await etfScoreView();
  const score = canScore ? (await latestEtfScores([fund.listingKey])).get(fund.listingKey) : null;
  const d = getEtfDetailMessages(locale);
  const fm = getEtfFundMessages(locale);
  const field = (value: string | null) => value || m.noValue;
  const freshness = (date: string | null) => <small>{date ? fm.latest.replace("{date}", displayedDate(locale, date)) : fm.noDate}</small>;
  const scoreDate = score?.rules.map((rule) => rule.date).filter((value): value is string => !!value).sort().at(-1) ?? null;
  return <div className="frame page">
    <RecordHead area={<AreaChip locale={locale} area="etf" />} title={fund.name} lede={m.fundLede} stamp={sample ? <span className="stamp">{m.sample}</span> : undefined} actions={<Link className="button secondary" href={`/${locale}/etf#etf-catalog`}>{m.back}</Link>} />
    <div className={s.stack}>
      {canScore ? <><RecordCard id="fund-score" title={m.scoreTitle} lede={m.scoreNote} meta={freshness(scoreDate)}><EtfStoredScore score={score} m={m} /><p>{m.scoreMethod}</p><p><Link href={`/${locale}/methodology`}>{fm.methodology}</Link></p><AdrLine text={getMessages(locale).common.disclaimer} /></RecordCard><EtfRuleBreakdown locale={locale} score={score} /></> : null}
      <RecordCard id="fund-details" title={m.fundDetails} meta={freshness(fund.lastSeen)}><dl className={s.facts}>
        <div><dt>{m.listingKey}</dt><dd>{fund.listingKey}</dd></div><div><dt>{m.isin}</dt><dd>{field(fund.isin)}</dd></div><div><dt>{m.listingRegion}</dt><dd>{fund.listingRegion === "US" ? m.us : fund.listingRegion === "EU" ? m.eu : m.noValue}</dd></div><div><dt>WKN</dt><dd>{field(fund.wkn)}</dd></div><div><dt>{m.ticker}</dt><dd>{field(fund.mnemonic)}</dd></div><div><dt>{m.instrumentType}</dt><dd>{fund.instrumentType.replace("_", " ")}</dd></div>
        <div><dt>{m.exchange}</dt><dd>{fund.exchange}</dd></div><div><dt>{m.theme}</dt><dd>{field(fund.theme)}</dd></div><div><dt>{m.issuer}</dt><dd>{field(fund.issuer)}</dd></div><div><dt>{m.assetClass}</dt><dd>{fund.assetClass ? m[fund.assetClass] : m.noValue}</dd></div><div><dt>{m.region}</dt><dd>{field(fund.region)}</dd></div><div><dt>{m.index}</dt><dd>{field(fund.trackedIndex)}</dd></div>
        <div><dt>{m.ter}</dt><dd>{percent(locale, fund.terPct)}</dd></div><div><dt>{m.aum}</dt><dd>{amount(locale, fund.aumUsdM)}</dd></div><div><dt>{m.domicile}</dt><dd>{field(fund.domicile)}</dd></div><div><dt>{m.replication}</dt><dd>{field(fund.replication)}</dd></div>
        <div><dt>{m.distribution}</dt><dd>{fund.distribution ? m[fund.distribution] : m.noValue}</dd></div><div><dt>{fm.ucitsHint}</dt><dd>{fund.ucits === null ? m.unknown : fund.ucits ? m.yes : m.no}</dd></div><div><dt>{m.currency}</dt><dd>{field(fund.tradingCurrency)}</dd></div>
        <div><dt>{m.enrichment}</dt><dd>{m[fund.enrichmentStatus]}</dd></div><div><dt>{m.shortlist}</dt><dd>{fund.shortlist ? m.yes : m.no}</dd></div><div><dt>{m.firstSeen}</dt><dd>{displayedDate(locale, fund.firstSeen)}</dd></div><div><dt>{m.enrichedAt}</dt><dd>{displayedDate(locale, fund.enrichedAt)}</dd></div><div><dt>{m.lastCatalogSync}</dt><dd>{displayedDate(locale, fund.lastSeen)}</dd></div>
        <div><dt>{m.source}</dt><dd>{isVendorSourceUrl(fund.sourceUrl) ? m.sourceProvider : fund.sourceUrl?.startsWith("https://") ? <a href={fund.sourceUrl} target="_blank" rel="noopener noreferrer">{m.sourceIssuer}</a> : m.noValue}</dd></div>
      </dl></RecordCard>
      {owner ? <RecordCard id="fund-vendor" title={d.vendorData} lede={d.ownerOnly}>
        <nav className="kit-tabs" aria-label={d.tabsLabel}>{ETF_TABS.map((tab) => <Link key={tab} href={etfTabHref(locale, fund.listingKey, tab)}>{d[tab]}</Link>)}</nav>
      </RecordCard> : null}
      {pickOwner ? <RecordCard id="fund-pick" title={m.picksTitle} meta={freshness(detail?.pick.lastSeenAt ?? null)}>{detail ? <p><Link href={`/${locale}/etf/${encodeURIComponent(detail.pick.symbol)}`}>{m.pickLink}: {detail.pick.symbol}</Link> {!canScore ? <CallBadge call={detail.pick.call} locale={locale} /> : null} · {m.conviction}: {detail.pick.conviction === null ? m.noValue : `${detail.pick.conviction}/5`}</p> : <p>{m.noPick}</p>}</RecordCard> : null}
      {pickOwner && detail ? <>
        <RecordCard id="fund-history" title={m.history} meta={freshness(detail.history.map((item) => item.asOf).sort().at(-1) ?? null)}>{detail.history.length ? <div className={s.tableWrap}><table className={s.table}><thead><tr><th scope="col">{m.lastSeen}</th>{!canScore ? <th scope="col">{m.call}</th> : null}<th scope="col">{m.conviction}</th></tr></thead><tbody>{detail.history.map((item) => <tr key={item.asOf}><td>{displayedDate(locale, item.asOf)}</td>{!canScore ? <td><CallBadge call={item.call} locale={locale} /></td> : null}<td>{item.conviction === null ? m.noValue : `${item.conviction}/5`}</td></tr>)}</tbody></table></div> : <p>{m.noHistory}</p>}</RecordCard>
        <RecordCard id="fund-outcomes" title={m.outcomes} meta={freshness(detail.outcomes.map((item) => item.exitDate).sort().at(-1) ?? null)}>{detail.outcomes.length ? <div className={s.tableWrap}><table className={s.table}><thead><tr><th scope="col">{m.horizon}</th><th scope="col">{m.fundReturn}</th><th scope="col">{m.benchmark}</th><th scope="col">{m.benchmarkReturn}</th><th scope="col">{m.excess}</th></tr></thead><tbody>{detail.outcomes.map((item) => <tr key={item.horizonDays}><td>{item.horizonDays} {m.days}</td><td>{signedPercent(locale, item.returnPct)}</td><td>{item.benchmarkSymbol}</td><td>{signedPercent(locale, item.benchmarkReturnPct)}</td><td>{signedPercent(locale, item.excessPct)}</td></tr>)}</tbody></table></div> : <p>{m.noDetailOutcomes}</p>}</RecordCard>
      </> : null}
    </div>
  </div>;
}
export default withPageLog("/etf/fund/[key]", EtfFundPage);
