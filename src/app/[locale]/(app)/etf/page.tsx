import type { Metadata } from "next";
import Link from "next/link";
import { withPageLog } from "@/app/page-log";
import { ETF_ASSET_CLASSES, etfList, type EtfAssetClass, type EtfCall } from "@/db/etf";
import { AUM_RANGES, RATING_BANDS, TER_RANGES, etfCatalogList, etfRatingSummary, etfTopRated, normalizeCatalogFilters, type AumGap, type CatalogFilters } from "@/db/etf-catalog";
import { getEtfMessages, type EtfMessages } from "@/i18n/etf-messages";
import { etfOwnerView, etfPickOwnerView, etfScoreView, requireEtfScreeningAccess } from "@/components/etf/owner";
import { latestEtfScores } from "@/db/etf-score";
import { BandBadge, EtfRatingCell } from "@/components/etf/score";
import { AdrLine } from "@/components/disclaimer";
import { getMessages, formatNumber, type Locale } from "@/i18n";
import { pageMetadata } from "@/i18n/metadata";
import { RecordHead } from "@/components/record-parts";
import { AreaChip } from "@/components/kit";
import { CallBadge, Figure, Gap, VerificationBadge, amount, displayedDate, millions, percent, signedPercent } from "@/components/etf/format";
import s from "@/components/etf/etf.module.css";
import { resolveLocale } from "@/app/[locale]/locale";

export const dynamic = "force-dynamic";
type Query = CatalogFilters & { call?: string };
type Props = { params: Promise<{ locale: string }>; searchParams?: Promise<Query> };
const classes = ETF_ASSET_CLASSES;
const calls: EtfCall[] = ["BUY_ZONE", "WATCH", "AVOID"];
const TOP_PER_CLASS = 5;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  await requireEtfScreeningAccess();
  const locale = await resolveLocale(params);
  const m = getEtfMessages(locale);
  return pageMetadata(locale, "/etf", m.title, m.lede);
}
const share = (locale: Locale, part: number, whole: number) => whole ? `${formatNumber(locale, part / whole * 100, 0)} %` : "–";
const fill = (template: string, values: Record<string, string>) => Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, value), template);
const pct1 = (locale: Locale, value: number) => percent(locale, value, 1);
const signed1 = (locale: Locale, value: number) => signedPercent(locale, value, 1);
const ter2 = (locale: Locale, value: number) => percent(locale, value, 2);
const count = (locale: Locale, value: number) => formatNumber(locale, value, 0);
/** Spoken reason for a blank EUR AUM cell. */
const aumReason = (m: EtfMessages, gap: AumGap) => gap === "fx" ? m.aumFxGap : gap === "currency" ? m.aumCurrencyGap : undefined;

async function EtfPage({ params, searchParams }: Props) {
  await requireEtfScreeningAccess();
  const locale = await resolveLocale(params);
  const m = getEtfMessages(locale);
  const query = await searchParams ?? {};
  const [owner, vendor, scoreAccess] = await Promise.all([etfPickOwnerView(), etfOwnerView(), etfScoreView()]);
  // The model research table (call, conviction) is the owner's private workflow (etfPickOwnerView, no free preview).
  // The call parameter is an owner filter on model output. For anyone else it is dropped before any read.
  const catalogQuery: CatalogFilters = { ...query };
  delete (catalogQuery as Query).call;
  const call = owner ? calls.find((item) => item === query.call) : undefined;
  // Form defaults show what the read applied, so a dropped vendor-only sort reads as Rating.
  const applied = normalizeCatalogFilters(catalogQuery, { vendor });
  const assetClass = classes.find((item) => item === query.assetClass);
  const [catalog, summary, top, research] = await Promise.all([
    etfCatalogList(catalogQuery, undefined, { vendor }),
    scoreAccess ? etfRatingSummary() : null,
    scoreAccess ? etfTopRated(TOP_PER_CLASS, undefined, { vendor }) : null,
    owner ? etfList() : null,
  ]);
  const scores = scoreAccess ? await latestEtfScores(catalog.funds.map((fund) => fund.listingKey)) : null;
  const pageHref = (page: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(owner ? query : catalogQuery)) if (typeof value === "string" && key !== "page") next.set(key, value);
    next.set("page", String(page));
    return `/${locale}/etf?${next}`;
  };
  const bandHref = (band: string) => `/${locale}/etf?band=${band}#etf-catalog`;
  const sample = catalog.sample || Boolean(summary?.sample) || Boolean(top?.sample) || Boolean(research?.sample);
  const disclaimer = getMessages(locale).common.disclaimer;
  return <div className="frame page">
    <RecordHead area={<AreaChip locale={locale} area="etf" />} title={m.title} lede={m.lede} stamp={sample ? <span className="stamp">{m.sample}</span> : undefined}
      actions={owner ? <Link className="button secondary" href={`/${locale}/etf/track-record`}>{m.trackRecord}</Link> : undefined} />
    {summary ? <RatingStrip locale={locale} m={m} summary={summary} bandHref={bandHref} /> : null}
    {top ? <section className={s.group} aria-labelledby="etf-top"><h2 id="etf-top">{m.topTitle}</h2><p className={s.note}>{m.topLede}</p>
      {!top.groups.length ? <p className="notice">{m.topEmpty}</p> : <div className={s.topGrid}>{top.groups.map((group) => <section key={group.assetClass} className={s.topCard} aria-labelledby={`etf-top-${group.assetClass}`}>
        <h3 id={`etf-top-${group.assetClass}`}>{m[group.assetClass]}</h3>
        <ol className={s.topList}>{group.funds.map((fund, index) => <li key={fund.listingKey} className={s.topItem}>
          <span className={s.topRank}>{index + 1}</span>
          <Link className={s.topName} href={`/${locale}/etf/fund/${encodeURIComponent(fund.listingKey)}`}>{fund.name}</Link>
          <span className={s.ratingLine}><strong className={s.ratingPercent}>{fund.percent}%</strong><BandBadge band={fund.band} m={m} /></span>
          <span className={s.topFacts}>
            <span>{fill(m.scoreGroupsShort, { count: String(fund.groupsWithData), total: String(fund.applicableGroups) })}{fund.incompleteData ? ` · ${m.scoreIncomplete}` : ""}</span>
            <span>{m.ter} <Figure locale={locale} value={fund.terPct} format={ter2} /></span>
            <span>{m.aumEur} <Figure locale={locale} value={fund.aumEurM} format={millions} reason={aumReason(m, fund.aumGap)} /></span>
          </span>
        </li>)}</ol>
      </section>)}</div>}
      <AdrLine text={disclaimer} />
    </section> : null}
    <dl className={s.stats}>
      <div className={s.stat}><dt>{m.catalogSize}</dt><dd>{formatNumber(locale, catalog.stats.size)}</dd></div>
      <div className={s.stat}><dt>{m.enrichedShare}</dt><dd>{catalog.stats.size ? `${formatNumber(locale, catalog.stats.enriched / catalog.stats.size * 100, 0)} %` : m.noValue}</dd></div>
      <div className={s.stat}><dt>{m.lastCatalogSync}</dt><dd>{displayedDate(locale, catalog.stats.lastSync)}</dd></div>
      {owner ? <>
        <div className={s.stat}><dt>{m.shortlistSize}</dt><dd>{formatNumber(locale, catalog.stats.shortlist)}</dd></div>
        <div className={s.stat}><dt>{m.lastPicksRun}</dt><dd>{displayedDate(locale, research?.run?.asOf ?? null)}</dd></div>
      </> : null}
    </dl>
    <section className={s.group} aria-labelledby="etf-catalog"><h2 id="etf-catalog">{m.catalogTitle}</h2><p className={s.note}>{m.catalogLede}</p>
      <form className={s.filters} action={`/${locale}/etf`} method="get">
        <label>{m.search}<input name="search" type="search" defaultValue={query.search ?? ""} placeholder={m.searchHint} /></label>
        {scoreAccess ? <>
          <label>{m.band}<select name="band" defaultValue={applied.band ?? ""}><option value="">{m.allBands}</option>{RATING_BANDS.map((band) => <option key={band} value={band}>{m.scoreStates[band]}</option>)}<option value="notRated">{m.scoreNotRated}</option></select></label>
          <label>{m.evidenceLevel}<select name="evidence" defaultValue={applied.evidence ?? ""}><option value="">{m.all}</option><option value="full">{m.evidenceFull}</option><option value="incomplete">{m.evidenceIncomplete}</option></select></label>
        </> : null}
        <label>{m.assetClass}<select name="assetClass" defaultValue={query.assetClass ?? ""}><option value="">{m.all}</option>{catalog.options.assetClasses.map((item) => <option key={item} value={item}>{m[item as EtfAssetClass] ?? item}</option>)}</select></label>
        {vendor && catalog.options.categories.length ? <label>{m.category}<select name="category" defaultValue={applied.category ?? ""}><option value="">{m.allCategories}</option>{catalog.options.categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label> : null}
        <label>{m.terRange}<select name="ter" defaultValue={applied.ter ?? ""}><option value="">{m.anyValue}</option>{Object.keys(TER_RANGES).map((key) => <option key={key} value={key}>{m[key as keyof typeof TER_RANGES]}</option>)}</select></label>
        <label>{m.aumRange}<select name="aum" defaultValue={applied.aum ?? ""}><option value="">{m.anyValue}</option>{Object.keys(AUM_RANGES).map((key) => <option key={key} value={key}>{m[key as keyof typeof AUM_RANGES]}</option>)}</select></label>
        <label>{m.distribution}<select name="distribution" defaultValue={query.distribution ?? ""}><option value="">{m.all}</option><option value="acc">{m.acc}</option><option value="dist">{m.dist}</option></select></label>
        <label>{m.region}<select name="region" defaultValue={query.region ?? ""}><option value="">{m.all}</option>{catalog.options.regions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label>{m.listingRegion}<select name="listingRegion" defaultValue={query.listingRegion ?? ""}><option value="">{m.all}</option><option value="EU">{m.eu}</option><option value="US">{m.us}</option></select></label>
        <label>{m.exchange}<select name="exchange" defaultValue={query.exchange ?? ""}><option value="">{m.all}</option>{catalog.options.exchanges.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label>{m.issuer}<select name="issuer" defaultValue={query.issuer ?? ""}><option value="">{m.all}</option>{catalog.options.issuers.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label>{m.ucits}<select name="ucits" defaultValue={query.ucits ?? ""}><option value="">{m.all}</option><option value="yes">{m.yes}</option><option value="no">{m.no}</option></select></label>
        <label>{m.instrumentType}<select name="instrumentType" defaultValue={query.instrumentType ?? ""}><option value="">{m.allEtfs}</option><option value="all">{m.all}</option><option value="ETF">ETF</option><option value="ACTIVE_ETF">Active ETF</option><option value="ETC">ETC</option><option value="ETN">ETN</option></select></label>
        <label>{m.shortlist}<select name="shortlist" defaultValue={query.shortlist ?? ""}><option value="">{m.all}</option><option value="yes">{m.yes}</option></select></label>
        <label>{m.enriched}<select name="enriched" defaultValue={query.enriched ?? ""}><option value="">{m.all}</option><option value="yes">{m.yes}</option></select></label>
        <label>{m.sort}<select name="sort" defaultValue={applied.sort}><option value="rating">{m.sortRating}</option><option value="name">{m.sortName}</option><option value="ter_asc">{m.sortTerAsc}</option><option value="ter_desc">{m.sortTerDesc}</option><option value="aum_asc">{m.sortAumAsc}</option><option value="aum_desc">{m.sortAumDesc}</option>{vendor ? <><option value="ret1y_desc">{m.sortRet1y}</option><option value="ret3y_desc">{m.sortRet3y}</option></> : null}</select></label>
        <button className="button secondary" type="submit">{m.apply}</button><Link href={`/${locale}/etf#etf-catalog`}>{m.reset}</Link>
      </form>
      {!catalog.stats.size ? <p className="notice">{m.catalogEmpty}</p> : !catalog.total ? <p className="notice">{m.catalogNoMatch}</p> : <>
        <p className={s.note}>{fill(m.catalogSummary, { rated: formatNumber(locale, catalog.rated), withData: formatNumber(locale, catalog.withData), total: formatNumber(locale, catalog.total) })}</p>
        <p className={s.note}>{m.results}: {formatNumber(locale, catalog.total)} · {m.page} {catalog.page} {m.of} {catalog.pages}</p>
        <div className={s.catalogWrap} role="region" aria-labelledby="etf-catalog" tabIndex={0}><table className={`${s.table} ${s.catalogTable}`}><thead><tr>
          <th scope="col">{m.name}</th>
          {scores ? <th scope="col" className={s.ratingCol}>{m.scoreColumn}</th> : null}
          <th scope="col" className={s.num}>{m.ter}</th><th scope="col" className={s.num}>{m.aumEur}</th>
          {vendor ? <><th scope="col" className={s.num}>{m.ret1y}</th><th scope="col" className={s.num}>{m.ret3y}</th><th scope="col" className={s.num}>{m.volatility}</th><th scope="col" className={s.num}>{m.yieldShort}</th><th scope="col" className={s.num}>{m.holdings}</th><th scope="col" className={s.num}>{m.topTen}</th><th scope="col">{m.category}</th></> : null}
          <th scope="col">{m.assetClass}</th><th scope="col">{m.domicile}</th><th scope="col">{m.distribution}</th><th scope="col">{m.index}</th><th scope="col">{m.issuer}</th><th scope="col">{m.region}</th><th scope="col">{m.ucits}</th><th scope="col">{m.currency}</th><th scope="col">{m.instrumentType}</th>
          {owner ? <><th scope="col">{m.enrichment}</th><th scope="col">{m.shortlist}</th><th scope="col">{m.call}</th></> : null}
        </tr></thead><tbody>{catalog.funds.map((fund) => { const f = fund.facts; return <tr key={fund.listingKey}>
          <th scope="row"><Link href={`/${locale}/etf/fund/${encodeURIComponent(fund.listingKey)}`}>{fund.name}</Link><span className={s.fundMeta} title={m.fundMeta}>{[fund.mnemonic, fund.exchange, fund.isin].filter(Boolean).join(" · ")}</span></th>
          {scores ? <td><EtfRatingCell score={scores.get(fund.listingKey)} m={m} /></td> : null}
          <td className={s.num}><Figure locale={locale} value={f?.terPct ?? fund.terPct} format={ter2} /></td>
          <td className={s.num}><Figure locale={locale} value={f?.aumEurM} format={millions} reason={aumReason(m, f?.aumGap ?? null)} /></td>
          {vendor ? <>
            <td className={s.num}><Figure locale={locale} value={f?.ret1yPct} format={signed1} /></td>
            <td className={s.num}><Figure locale={locale} value={f?.ret3yPct} format={signed1} /></td>
            <td className={s.num}><Figure locale={locale} value={f?.vol1yPct} format={pct1} /></td>
            <td className={s.num}><Figure locale={locale} value={f?.yieldPct} format={ter2} /></td>
            <td className={s.num}><Figure locale={locale} value={f?.holdingsCount} format={count} /></td>
            <td className={s.num}><Figure locale={locale} value={f?.topTenWeightPct} format={pct1} /></td>
            <td className={s.wide}>{f?.category ?? <Gap locale={locale} />}</td>
          </> : null}
          <td>{fund.assetClass ? m[fund.assetClass] : <Gap locale={locale} />}</td>
          <td>{fund.domicile ?? <Gap locale={locale} />}</td>
          <td>{fund.distribution ? m[fund.distribution] : <Gap locale={locale} />}</td>
          <td className={s.wide}>{fund.trackedIndex ?? <Gap locale={locale} />}</td>
          <td className={s.wide}>{fund.issuer ?? <Gap locale={locale} />}</td>
          <td>{fund.region ?? <Gap locale={locale} />}</td>
          <td>{fund.ucits === null ? m.unknown : fund.ucits ? m.yes : m.no}</td>
          <td>{fund.tradingCurrency ?? <Gap locale={locale} />}</td>
          <td>{fund.instrumentType.replace("_", " ")}</td>
          {owner ? <><td>{m[fund.enrichmentStatus]}</td><td>{fund.shortlist ? m.onShortlist : "–"}</td><td>{fund.pickSymbol ? <Link href={`/${locale}/etf/${encodeURIComponent(fund.pickSymbol)}`}>{m.pickLink}</Link> : "–"}</td></> : null}
        </tr>; })}</tbody></table></div>
        {scores ? <AdrLine text={disclaimer} /> : null}
        <nav className={s.pagination} aria-label={m.page}>{catalog.page > 1 ? <Link href={pageHref(catalog.page - 1) + "#etf-catalog"}>{m.previous}</Link> : <span />}{catalog.page < catalog.pages ? <Link href={pageHref(catalog.page + 1) + "#etf-catalog"}>{m.next}</Link> : null}</nav>
      </>}
    </section>
    {owner && research ? <OwnerResearch locale={locale} m={m} research={research} assetClass={assetClass} call={call} disclaimer={disclaimer} /> : null}
  </div>;
}

function RatingStrip({ locale, m, summary, bandHref }: { locale: Locale; m: EtfMessages; summary: Awaited<ReturnType<typeof etfRatingSummary>>; bandHref: (band: string) => string }) {
  const tone = { rulesMet: s.tileRulesMet, mostlyMet: s.tileMostlyMet, partlyMet: s.tilePartlyMet, fewMet: s.tileFewMet } as const;
  return <section className={s.ratingStrip} aria-labelledby="etf-rating">
    <div className={s.ratingHead}><h2 id="etf-rating">{m.ratingTitle}</h2>
      <p>{summary.asOf ? fill(m.ratingAsOf, { date: displayedDate(locale, summary.asOf) }) : m.ratingNone}</p></div>
    <p className={s.note}>{fill(m.ratingCoverage, { rated: formatNumber(locale, summary.rated), total: formatNumber(locale, summary.inScope), share: share(locale, summary.rated, summary.inScope) })}. {m.ratingMethod}</p>
    <ul className={s.bandTiles}>
      {RATING_BANDS.map((band) => <li key={band}><a className={`${s.bandTile} ${tone[band]}`} href={bandHref(band)} title={m.ratingFilterHint}>
        <strong>{formatNumber(locale, summary.bands[band])}</strong><span>{m.scoreStates[band]}</span><span>{fill(m.ratingShare, { share: share(locale, summary.bands[band], summary.rated) })}</span></a></li>)}
      <li><div className={`${s.bandTile} ${s.tileOther}`}><strong>{formatNumber(locale, summary.incomplete)}</strong><span>{m.ratingIncomplete}</span></div></li>
      <li><a className={`${s.bandTile} ${s.tileOther}`} href={bandHref("notRated")} title={m.ratingFilterHint}><strong>{formatNumber(locale, summary.notRated)}</strong><span>{m.scoreNotRated}</span></a></li>
    </ul>
  </section>;
}

function OwnerResearch({ locale, m, research, assetClass, call, disclaimer }: { locale: Locale; m: EtfMessages; research: Awaited<ReturnType<typeof etfList>>; assetClass: EtfAssetClass | undefined; call: EtfCall | undefined; disclaimer: string }) {
  const filtered = research.picks.filter((pick) => (!assetClass || pick.assetClass === assetClass) && (!call || pick.call === call));
  const grouped = classes.map((item) => ({ assetClass: item, picks: filtered.filter((pick) => pick.assetClass === item) })).filter((group) => group.picks.length);
  return <section className={`${s.group} ${s.ownerSection}`} aria-labelledby="etf-picks"><h2 id="etf-picks">{m.ownerPicksTitle}<span className={s.ownerTag}>{m.ownerOnly}</span></h2><p className={s.note}>{m.ownerPicksExplainer}</p>
    <form className={s.filters} action={`/${locale}/etf`} method="get">
      <label>{m.assetClass}<select name="assetClass" defaultValue={assetClass ?? ""}><option value="">{m.allClasses}</option>{classes.map((item) => <option key={item} value={item}>{m[item]}</option>)}</select></label>
      <label>{m.call}<select name="call" defaultValue={call ?? ""}><option value="">{m.allCalls}</option>{calls.map((item) => <option key={item} value={item}>{m[item]}</option>)}</select></label>
      <button className="button secondary" type="submit">{m.apply}</button>
    </form>
    {!research.picks.length ? <p className="notice">{m.empty}</p> : !grouped.length ? <p className="notice">{m.noMatch}</p> : grouped.map((group) => <div key={group.assetClass} className={s.pickGroup}>
      <h3>{m[group.assetClass]}</h3><div className={s.tableWrap}><table className={s.table}><thead><tr>
        <th scope="col">{m.symbol}</th><th scope="col">{m.name}</th><th scope="col">{m.call}</th><th scope="col">{m.conviction}</th><th scope="col">{m.ter}</th><th scope="col">{m.aum}</th><th scope="col">{m.domicile}</th><th scope="col">{m.price}</th><th scope="col">{m.priceDate}</th><th scope="col">{m.verification}</th><th scope="col">{m.lastSeen}</th>
      </tr></thead><tbody>{group.picks.map((pick) => <tr key={pick.symbol}>
        <th scope="row"><Link href={`/${locale}/etf/${encodeURIComponent(pick.symbol)}`}>{pick.symbol}</Link></th><td>{pick.name}</td><td><CallBadge call={pick.call} locale={locale} /></td><td>{pick.conviction === null ? m.noValue : `${pick.conviction}/5`}</td><td>{percent(locale, pick.terPct)}</td><td>{amount(locale, pick.aumUsdM, 1)}</td><td>{pick.domicile ?? m.noValue}</td><td>{pick.price === null ? m.noValue : `${amount(locale, pick.price, 2)} ${pick.priceCurrency ?? ""}`}</td><td>{displayedDate(locale, pick.priceAsOf)}</td><td><VerificationBadge status={pick.verificationStatus} locale={locale} /></td><td>{displayedDate(locale, pick.lastSeenAt)}</td>
      </tr>)}</tbody></table></div><AdrLine text={disclaimer} /></div>)}
  </section>;
}
export default withPageLog("/etf", EtfPage);
