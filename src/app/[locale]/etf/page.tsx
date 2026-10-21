import type { Metadata } from "next";
import Link from "next/link";
import { withPageLog } from "@/app/page-log";
import { etfList, type EtfAssetClass, type EtfCall } from "@/db/etf";
import { etfCatalogList, type CatalogFilters } from "@/db/etf-catalog";
import { getEtfMessages } from "@/i18n/etf-messages";
import { pageMetadata } from "@/i18n/metadata";
import { formatNumber } from "@/i18n";
import { RecordHead } from "@/components/record-parts";
import { CallBadge, VerificationBadge, amount, displayedDate, percent } from "@/components/etf/format";
import s from "@/components/etf/etf.module.css";
import { resolveLocale } from "../locale";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string }>; searchParams?: Promise<CatalogFilters & { call?: string }> };
const classes: EtfAssetClass[] = ["equity", "bond", "commodity", "multi_asset", "other"];
const calls: EtfCall[] = ["BUY_ZONE", "WATCH", "AVOID"];
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getEtfMessages(locale);
  return pageMetadata(locale, "/etf", m.title, m.lede);
}
async function EtfPage({ params, searchParams }: Props) {
  const locale = await resolveLocale(params);
  const m = getEtfMessages(locale);
  const query = await searchParams ?? {};
  const assetClass = classes.find((item) => item === query.assetClass);
  const call = calls.find((item) => item === query.call);
  const [{ picks, run, sample: picksSample }, catalog] = await Promise.all([etfList(), etfCatalogList(query)]);
  const filtered = picks.filter((pick) => (!assetClass || pick.assetClass === assetClass) && (!call || pick.call === call));
  const grouped = classes.map((item) => ({ assetClass: item, picks: filtered.filter((pick) => pick.assetClass === item) })).filter((group) => group.picks.length);
  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (typeof value === "string" && key !== "page") params.set(key, value);
    params.set("page", String(page));
    return `/${locale}/etf?${params}`;
  };
  return <div className="frame page">
    <RecordHead title={m.title} lede={m.lede} stamp={catalog.sample || picksSample ? <span className="stamp">{m.sample}</span> : undefined} actions={<Link className="button secondary" href={`/${locale}/etf/track-record`}>{m.trackRecord}</Link>} />
    <dl className={s.stats}>
      <div className={s.stat}><dt>{m.catalogSize}</dt><dd>{formatNumber(locale, catalog.stats.size)}</dd></div>
      <div className={s.stat}><dt>{m.enrichedShare}</dt><dd>{catalog.stats.size ? `${formatNumber(locale, catalog.stats.enriched / catalog.stats.size * 100, 0)} %` : m.noValue}</dd></div>
      <div className={s.stat}><dt>{m.shortlistSize}</dt><dd>{formatNumber(locale, catalog.stats.shortlist)}</dd></div>
      <div className={s.stat}><dt>{m.lastCatalogSync}</dt><dd>{displayedDate(locale, catalog.stats.lastSync)}</dd></div>
      <div className={s.stat}><dt>{m.lastPicksRun}</dt><dd>{displayedDate(locale, run?.asOf ?? null)}</dd></div>
    </dl>
    <section className={s.group} aria-labelledby="etf-picks"><h2 id="etf-picks">{m.picksTitle}</h2><p className={s.note}>{m.picksExplainer}</p>
      <form className={s.filters} action={`/${locale}/etf`} method="get">
        <label>{m.assetClass}<select name="assetClass" defaultValue={assetClass ?? ""}><option value="">{m.allClasses}</option>{classes.map((item) => <option key={item} value={item}>{m[item]}</option>)}</select></label>
        <label>{m.call}<select name="call" defaultValue={call ?? ""}><option value="">{m.allCalls}</option>{calls.map((item) => <option key={item} value={item}>{m[item]}</option>)}</select></label>
        <button className="button secondary" type="submit">{m.apply}</button>
      </form>
      {!picks.length ? <p className="notice">{m.empty}</p> : !grouped.length ? <p className="notice">{m.noMatch}</p> : grouped.map((group) => <div key={group.assetClass} className={s.pickGroup}>
        <h3>{m[group.assetClass]}</h3><div className={s.tableWrap}><table className={s.table}><thead><tr>
          <th scope="col">{m.symbol}</th><th scope="col">{m.name}</th><th scope="col">{m.call}</th><th scope="col">{m.conviction}</th><th scope="col">{m.ter}</th><th scope="col">{m.aum}</th><th scope="col">{m.domicile}</th><th scope="col">{m.price}</th><th scope="col">{m.priceDate}</th><th scope="col">{m.verification}</th><th scope="col">{m.lastSeen}</th>
        </tr></thead><tbody>{group.picks.map((pick) => <tr key={pick.symbol}>
          <th scope="row"><Link href={`/${locale}/etf/${encodeURIComponent(pick.symbol)}`}>{pick.symbol}</Link></th><td>{pick.name}</td><td><CallBadge call={pick.call} locale={locale} /></td><td>{pick.conviction === null ? m.noValue : `${pick.conviction}/5`}</td><td>{percent(locale, pick.terPct)}</td><td>{amount(locale, pick.aumUsdM, 1)}</td><td>{pick.domicile ?? m.noValue}</td><td>{pick.price === null ? m.noValue : `${amount(locale, pick.price, 2)} ${pick.priceCurrency ?? ""}`}</td><td>{displayedDate(locale, pick.priceAsOf)}</td><td><VerificationBadge status={pick.verificationStatus} locale={locale} /></td><td>{displayedDate(locale, pick.lastSeenAt)}</td>
        </tr>)}</tbody></table></div></div>)}
    </section>
    <section className={s.group} aria-labelledby="etf-catalog"><h2 id="etf-catalog">{m.catalogTitle}</h2><p className={s.note}>{m.catalogLede}</p>
      <form className={s.filters} action={`/${locale}/etf`} method="get">
        <label>{m.search}<input name="search" type="search" defaultValue={query.search ?? ""} placeholder={m.searchHint} /></label>
        <label>{m.assetClass}<select name="assetClass" defaultValue={query.assetClass ?? ""}><option value="">{m.all}</option>{catalog.options.assetClasses.map((item) => <option key={item} value={item}>{m[item as EtfAssetClass] ?? item}</option>)}</select></label>
        <label>{m.region}<select name="region" defaultValue={query.region ?? ""}><option value="">{m.all}</option>{catalog.options.regions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label>{m.listingRegion}<select name="listingRegion" defaultValue={query.listingRegion ?? ""}><option value="">{m.all}</option><option value="EU">{m.eu}</option><option value="US">{m.us}</option></select></label>
        <label>{m.exchange}<select name="exchange" defaultValue={query.exchange ?? ""}><option value="">{m.all}</option>{catalog.options.exchanges.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label>{m.issuer}<select name="issuer" defaultValue={query.issuer ?? ""}><option value="">{m.all}</option>{catalog.options.issuers.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label>{m.distribution}<select name="distribution" defaultValue={query.distribution ?? ""}><option value="">{m.all}</option><option value="acc">{m.acc}</option><option value="dist">{m.dist}</option></select></label>
        <label>{m.ucits}<select name="ucits" defaultValue={query.ucits ?? ""}><option value="">{m.all}</option><option value="yes">{m.yes}</option><option value="no">{m.no}</option></select></label>
        <label>{m.instrumentType}<select name="instrumentType" defaultValue={query.instrumentType ?? ""}><option value="">{m.allEtfs}</option><option value="all">{m.all}</option><option value="ETF">ETF</option><option value="ACTIVE_ETF">Active ETF</option><option value="ETC">ETC</option><option value="ETN">ETN</option></select></label>
        <label>{m.shortlist}<select name="shortlist" defaultValue={query.shortlist ?? ""}><option value="">{m.all}</option><option value="yes">{m.yes}</option></select></label>
        <label>{m.enriched}<select name="enriched" defaultValue={query.enriched ?? ""}><option value="">{m.all}</option><option value="yes">{m.yes}</option></select></label>
        <label>{m.sort}<select name="sort" defaultValue={query.sort ?? "name"}><option value="name">{m.sortName}</option><option value="ter_asc">{m.sortTerAsc}</option><option value="ter_desc">{m.sortTerDesc}</option><option value="aum_asc">{m.sortAumAsc}</option><option value="aum_desc">{m.sortAumDesc}</option></select></label>
        <button className="button secondary" type="submit">{m.apply}</button><Link href={`/${locale}/etf#etf-catalog`}>{m.reset}</Link>
      </form>
      {!catalog.stats.size ? <p className="notice">{m.catalogEmpty}</p> : !catalog.total ? <p className="notice">{m.catalogNoMatch}</p> : <>
        <p className={s.note}>{m.results}: {formatNumber(locale, catalog.total)} · {m.page} {catalog.page} {m.of} {catalog.pages}</p>
        <div className={s.tableWrap}><table className={`${s.table} ${s.catalogTable}`}><thead><tr>
          <th scope="col">{m.name}</th><th scope="col">{m.isin}</th><th scope="col">{m.ticker}</th><th scope="col">{m.listingRegion}</th><th scope="col">{m.exchange}</th><th scope="col">{m.issuer}</th><th scope="col">{m.assetClass}</th><th scope="col">{m.region}</th><th scope="col">{m.index}</th><th scope="col">{m.ter}</th><th scope="col">{m.aum}</th><th scope="col">{m.domicile}</th><th scope="col">{m.distribution}</th><th scope="col">{m.ucits}</th><th scope="col">{m.currency}</th><th scope="col">{m.instrumentType}</th><th scope="col">{m.enrichment}</th><th scope="col">{m.shortlist}</th><th scope="col">{m.call}</th>
        </tr></thead><tbody>{catalog.funds.map((fund) => <tr key={fund.listingKey}>
          <th scope="row"><Link href={`/${locale}/etf/fund/${encodeURIComponent(fund.listingKey)}`}>{fund.name}</Link></th><td>{fund.isin ?? m.noValue}</td><td>{fund.mnemonic ?? m.noValue}</td><td>{fund.listingRegion === "US" ? m.us : fund.listingRegion === "EU" ? m.eu : m.noValue}</td><td>{fund.exchange}</td><td>{fund.issuer ?? m.noValue}</td><td>{fund.assetClass ? m[fund.assetClass] : m.noValue}</td><td>{fund.region ?? m.noValue}</td><td>{fund.trackedIndex ?? m.noValue}</td><td>{percent(locale, fund.terPct)}</td><td>{amount(locale, fund.aumUsdM)}</td><td>{fund.domicile ?? m.noValue}</td><td>{fund.distribution ? m[fund.distribution] : m.noValue}</td><td>{fund.ucits === null ? m.unknown : fund.ucits ? m.yes : m.no}</td><td>{fund.tradingCurrency ?? m.noValue}</td><td>{fund.instrumentType.replace("_", " ")}</td><td>{m[fund.enrichmentStatus]}</td><td>{fund.shortlist ? m.onShortlist : "—"}</td><td>{fund.pickSymbol ? <Link href={`/${locale}/etf/${encodeURIComponent(fund.pickSymbol)}`}>{m.pickLink}</Link> : "—"}</td>
        </tr>)}</tbody></table></div>
        <nav className={s.pagination} aria-label={m.page}>{catalog.page > 1 ? <Link href={pageHref(catalog.page - 1) + "#etf-catalog"}>{m.previous}</Link> : <span />}{catalog.page < catalog.pages ? <Link href={pageHref(catalog.page + 1) + "#etf-catalog"}>{m.next}</Link> : null}</nav>
      </>}
    </section>
  </div>;
}
export default withPageLog("/etf", EtfPage);
