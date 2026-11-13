import { withPageLog } from "@/app/page-log";
import type { Metadata } from "next";
import Link from "next/link";
import { AppPageHead, HeadDisclosure, appPageClass } from "@/components/app-page-head";
import { IconBandWatch } from "@/components/icons";
import { getHeatmapMessages } from "@/i18n/heatmap-messages";
import { getScreenMessages } from "@/i18n/screen-messages";
import { ScannerTable } from "@/components/scanner-table";
import { ScoreStrip } from "@/components/score-strip";
import { byScore, toRow } from "@/components/view-model";
import { latestPortfolio, latestScoreSummaries } from "@/data/store";
import { publicHorizons } from "@/data/public-horizons";
import { ProfileLists } from "./profile-lists";
import { StateFilterProvider } from "@/components/state-filter";
import { profileCopy } from "@/i18n/profile-messages";
import { latestStateChanges } from "@/data/state-changes";
import { StateStrip, type StateChange } from "@/components/kit/state-strip";
import { kitState } from "@/components/kit/types";
import { getKitMessages } from "@/i18n/kit-messages";
import { statusLabel } from "@/components/status-slider";
import { flags } from "@/config/flags";
import { stateOrder, type StateKey } from "@/i18n/rules";
import { MacroEvents } from "@/components/macro-events";
import { storedMacroEvents } from "@/data/macro-calendar-store";
import { DataStatus } from "@/components/data-status";
import { getViewer } from "@/viewer/get-viewer";
import { latestShortlist, shortlistAccess, shortlistViewEnabled } from "@/data/shortlist";
import { canOpenFunds, canUseVendorData, investorPath, vendorLicensed, type Viewer } from "@/viewer/viewer";
import { marketsViewable } from "@/markets/gate";
import { InvestorPaths } from "@/components/dashboard/investor-paths";
import { PATH_HREF, pathCards } from "@/config/investor-paths";
import { ShortlistLock, ShortlistView } from "@/components/shortlist-view";
import { PortfolioStructure } from "@/components/dashboard/portfolio-structure";
import { PeriodHighlights } from "@/components/dashboard/period-highlights";
import { assembleCrossMarket, assemblePeriodRows, latestCrossMarketData, latestPeriodPrices, parseDashboardPeriod } from "@/data/cross-market-dashboard";
import { dashboardCopy } from "@/i18n/dashboard-messages";
import { fill, formatDate, getMessages, plural, type Locale } from "@/i18n";
import { pageMetadata } from "@/i18n/metadata";
import { resolveLocale, type LocaleParams } from "@/app/[locale]/locale";
import styles from "./dashboard.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  return pageMetadata(locale, "/dashboard", m.meta.dashboardTitle, m.meta.dashboardDescription);
}

/**
 * Stock data on the dashboard. While EODHD_PRIVATE_USE is on, the proxy no longer refuses the page; this check withholds every
 * vendor-derived block (scores, state changes, shortlist, portfolio, market sleeves) from viewers without stock access, and the page
 * then reads none of that data.
 */
export function dashboardStockAccess(viewer: Viewer, env: Record<string, string | undefined> = process.env): boolean {
  if (env.EODHD_PRIVATE_USE !== "on") return true;
  return !viewer.preview && canUseVendorData(viewer, env);
}

/** The path cards for this viewer, or null for the owner (who sees every path). */
function pathBlock(locale: Locale, viewer: Viewer, stockAccess: boolean) {
  const path = investorPath(viewer);
  if (!path) return null;
  const indices = marketsViewable(viewer, process.env, "indices");
  const cards = pathCards({ path, signedIn: Boolean(viewer.userId) && !viewer.preview, access: { active: stockAccess, passive: canOpenFunds(viewer), overview: true }, overviewHref: indices ? PATH_HREF.overview : PATH_HREF.overviewFallback });
  return <InvestorPaths locale={locale} cards={cards} signedIn={Boolean(viewer.userId) && !viewer.preview} licensed={vendorLicensed()} />;
}

async function Dashboard({ params, searchParams }: LocaleParams & { searchParams?: Promise<{ period?: string }> }) {
  const locale = await resolveLocale(params);
  const period = parseDashboardPeriod((await searchParams)?.period);
  const m = getMessages(locale);
  const viewer = await getViewer();
  const stockAccess = dashboardStockAccess(viewer);
  if (!stockAccess) {
    // No stock access: the paths, the public US macro calendar and the disclosure. No score, price or portfolio read happens.
    const macroSchedule = await storedMacroEvents(new Date().toISOString().slice(0, 10));
    return <div className={appPageClass}>
      <AppPageHead title={m.dashboard.title} actions={<Link className="button secondary" href={`/${locale}/methodology`}>{m.nav.methodology}</Link>} />
      {pathBlock(locale, viewer, false)}
      <MacroEvents locale={locale} schedule={macroSchedule} />
      <HeadDisclosure text={m.common.operatorDisclosure} />
    </div>;
  }
  const access = viewer.preview ? (shortlistViewEnabled() ? "locked" : "hidden") : shortlistAccess(viewer);
  const marketAccess = !viewer.preview && canUseVendorData(viewer);
  const marketBundle = marketAccess ? Promise.all([access === "full" ? latestShortlist() : null, latestCrossMarketData()]).then(async ([shortlist, crossMarket]) => {
    const structure = assembleCrossMarket(shortlist, crossMarket.funds, crossMarket.indices, crossMarket.sample);
    const seenIndices = new Set<string>();
    const symbols = [...crossMarket.funds].sort((a, b) => b.scorePercent - a.scorePercent || a.key.localeCompare(b.key))
      .filter((fund) => {
        const index = fund.trackedIndex?.trim().toLowerCase();
        if (!index) return true;
        if (seenIndices.has(index)) return false;
        seenIndices.add(index);
        return true;
      }).slice(0, 5).flatMap((fund) => fund.vendorSymbol ? [fund.vendorSymbol] : []);
    const periodPrices = await latestPeriodPrices(structure.stocks.map((stock) => stock.ticker), symbols);
    return { shortlist, crossMarket, structure, periodPrices };
  }) : Promise.resolve(null);
  const [data, portfolio, moved, horizons, macroSchedule, market] = await Promise.all([latestScoreSummaries(), latestPortfolio(), latestStateChanges(), publicHorizons(), storedMacroEvents(new Date().toISOString().slice(0, 10)), marketBundle]);
  const k = getKitMessages(locale);
  const changes: StateChange[] = moved.map(({ ticker, from, to }) => {
    const [fromLabel, toLabel] = [m.status.labels[from], m.status.labels[to]];
    return { ticker, from: kitState(from), to: kitState(to), fromLabel, toLabel, href: `/${locale}/company/${ticker}`, sentence: fill(k.strip.changed, { ticker, from: fromLabel, to: toLabel }) };
  });
  const rows = data.rows.map((row) => toRow(locale, row)).sort(byScore);
  const session = rows.find((row) => row.date)?.date ?? "";
  const sc = getScreenMessages(locale);
  const stripLabel = session ? fill(k.strip.label, { date: formatDate(locale, session) }) : fill(k.strip.label, { date: "" }).replace(/[,\s]+$/, "");
  const h = getHeatmapMessages(locale);
  return <div className={appPageClass}>
    <AppPageHead title={m.dashboard.title} sample={data.sample} sampleText={m.common.sample}
      lede={data.lastUpdated ? fill(m.dashboard.lede, { date: formatDate(locale, session), count: plural(locale, data.sample ? m.plurals.sampleTickers : m.plurals.tickers, rows.length) }) : undefined}
      meta={<DataStatus locale={locale} lastUpdated={data.lastUpdated} stale={data.stale} />}
      actions={<><Link className="button secondary" href={`/${locale}/heatmap`}>{h.navLabel}</Link><Link className="button secondary" href={`/${locale}/methodology`}>{m.nav.methodology}</Link></>} />
    {pathBlock(locale, viewer, true)}
    {access === "locked" && !marketAccess && <ShortlistLock locale={locale} />}
    {market && <><PeriodHighlights locale={locale} period={period} rows={assemblePeriodRows(market.structure, market.crossMarket.funds, period, market.periodPrices)} sample={market.crossMarket.sample} /><PortfolioStructure locale={locale} data={market.structure} /></>}
    {market && <nav className={styles.marketLinks} aria-label={dashboardCopy(locale).marketLinks}>
      <Link className="button secondary" href={`/${locale}/stocks`}>{dashboardCopy(locale).openStocks}</Link>
      <Link className="button secondary" href={`/${locale}/etf`}>{dashboardCopy(locale).openEtfs}</Link>
      <Link className="button secondary" href={`/${locale}/indices`}>{dashboardCopy(locale).openIndices}</Link>
    </nav>}
    <div className={styles.strip}>
      {changes.length ? <StateStrip label={stripLabel} changes={changes} empty={k.strip.empty} pauseLabel={k.strip.pause} playLabel={k.strip.play} /> : <section className={styles.stripEmpty} aria-label={stripLabel}>
        <div className={styles.stripEmptyHead}><span className={styles.stripEmptyIcon} aria-hidden="true"><IconBandWatch /></span><div><p className={styles.stripEmptyLabel}>{stripLabel}</p><p className={styles.stripEmptyText}>{k.strip.empty}</p></div></div>
        <div className={styles.ghosts} aria-hidden="true">{[0, 1, 2].map((i) => <span key={i} className={styles.ghost}><b /><i /><i /></span>)}</div>
      </section>}
    </div>
    <ScoreStrip locale={locale} rows={rows} />
    {access === "full" && market?.shortlist ? <ShortlistView locale={locale} data={market.shortlist} compact /> : null}
    <HeadDisclosure text={m.common.operatorDisclosure} />
    <StateFilterProvider>
    <ScannerTable locale={locale} rows={rows} profiles={Object.fromEntries(Object.entries(horizons).map(([ticker, h]) => [ticker, h.profile]))} aside={<MacroEvents locale={locale} schedule={macroSchedule} />} heldTickers={portfolio?.weights.filter((p) => p.weightPercent > 0).map((p) => p.symbol.toUpperCase()) ?? []} text={{
      profileTags: profileCopy[locale].tags,
      searchLabel: m.scanner.searchLabel, searchPlaceholder: m.scanner.searchPlaceholder,
      filterLabel: m.scanner.filterLabel, allStates: m.scanner.allStates, clear: m.scanner.clear,
      empty: m.scanner.empty, showing: m.scanner.showing, sortBy: m.table.sortBy,
      disclaimer: m.common.disclaimer, extension: m.common.extension, extended: m.common.extended, noScore: m.common.noScore, noRejection: m.table.noRejection,
      held: m.portfolio.held, heldNoSignal: m.portfolio.heldNoSignal,
      rulesMet: m.scanner.rulesMet, rulesMetOf: m.scanner.rulesMetOf, hint: sc.kpiHint, rank: { short: sc.rankShort, long: sc.rank },
      columns: { ticker: m.table.ticker, sector: m.table.sector, score: m.table.score, rules: m.table.rules, state: m.status.columns.status, data: m.status.columns.data, criteria: m.table.criteria,
        f: m.groups.fundamentalsShort, t: m.groups.technicalShort, m: m.groups.macroShort,
        fName: m.groups.fundamentals, tName: m.groups.technical, mName: m.groups.macro },
      states: Object.fromEntries(stateOrder.map((key) => [key, statusLabel(m, key, flags().ADVICE_OUTPUT)])) as Record<StateKey, string>,
      board: { summaryLabel: m.dashboard.summaryLabel, lowerTitle: m.dashboard.lowerTitle, lowerBody: m.dashboard.lowerBody,
        showLower: m.dashboard.showLower, empty: m.dashboard.empty, stateNotes: m.dashboard.stateNotes },
    }} />
    <ProfileLists locale={locale} rows={rows} horizons={horizons} />
    </StateFilterProvider>
  </div>;
}

export default withPageLog("/dashboard", Dashboard);
