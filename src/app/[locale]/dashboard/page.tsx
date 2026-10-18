import { withPageLog } from "@/app/page-log";
import type { Metadata } from "next";
import Link from "next/link";
import { AppPageHead, HeadDisclosure, appPageClass } from "@/components/app-page-head";
import { IconBandWatch } from "@/components/icons";
import { getHeatmapMessages } from "@/i18n/heatmap-messages";
import { getScreenMessages } from "@/i18n/screen-messages";
import { ScannerTable } from "@/components/scanner-table";
import { byScore, toRow } from "@/components/view-model";
import { latestPortfolio, latestScores } from "@/data/store";
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
import { DataStatus } from "@/components/data-status";
import { fill, formatDate, getMessages, plural } from "@/i18n";
import { pageMetadata } from "@/i18n/metadata";
import { resolveLocale, type LocaleParams } from "../locale";
import styles from "./dashboard.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  return pageMetadata(locale, "/dashboard", m.meta.dashboardTitle, m.meta.dashboardDescription);
}

async function Dashboard({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  const [data, portfolio, moved, horizons] = await Promise.all([latestScores(), latestPortfolio(), latestStateChanges(), publicHorizons()]);
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
    <div className={styles.strip}>
      {changes.length ? <StateStrip label={stripLabel} changes={changes} empty={k.strip.empty} pauseLabel={k.strip.pause} playLabel={k.strip.play} /> : <section className={styles.stripEmpty} aria-label={stripLabel}>
        <div className={styles.stripEmptyHead}><span className={styles.stripEmptyIcon} aria-hidden="true"><IconBandWatch /></span><div><p className={styles.stripEmptyLabel}>{stripLabel}</p><p className={styles.stripEmptyText}>{k.strip.empty}</p></div></div>
        <div className={styles.ghosts} aria-hidden="true">{[0, 1, 2].map((i) => <span key={i} className={styles.ghost}><b /><i /><i /></span>)}</div>
      </section>}
    </div>
    <HeadDisclosure text={m.common.operatorDisclosure} />
    <StateFilterProvider>
    <ScannerTable locale={locale} rows={rows} profiles={Object.fromEntries(Object.entries(horizons).map(([ticker, h]) => [ticker, h.profile]))} aside={<MacroEvents locale={locale} />} heldTickers={portfolio?.weights.filter((p) => p.weightPercent > 0).map((p) => p.symbol.toUpperCase()) ?? []} text={{
      profileTags: profileCopy[locale].tags,
      searchLabel: m.scanner.searchLabel, searchPlaceholder: m.scanner.searchPlaceholder,
      filterLabel: m.scanner.filterLabel, allStates: m.scanner.allStates, clear: m.scanner.clear,
      empty: m.scanner.empty, showing: m.scanner.showing, sortBy: m.table.sortBy,
      disclaimer: m.common.disclaimer, extension: m.common.extension, noScore: m.common.noScore, noRejection: m.table.noRejection,
      held: m.portfolio.held, heldNoSignal: m.portfolio.heldNoSignal,
      rulesMet: m.scanner.rulesMet, rulesMetOf: m.scanner.rulesMetOf, hint: sc.kpiHint, rank: { short: sc.rankShort, long: sc.rank },
      columns: { ticker: m.table.ticker, sector: m.table.sector, score: m.table.score, rules: m.table.rules, state: m.status.columns.status, data: m.status.columns.data, criteria: m.table.criteria,
        f: m.groups.fundamentalsShort, t: m.groups.technicalShort, m: m.groups.macroShort,
        fName: m.groups.fundamentals, tName: m.groups.technical, mName: m.groups.macro },
      states: Object.fromEntries(stateOrder.map((key) => [key, statusLabel(m, key, flags().ADVICE_OUTPUT)])) as Record<StateKey, string>,
      board: { summaryLabel: m.dashboard.summaryLabel, lowerTitle: m.dashboard.lowerTitle, lowerBody: m.dashboard.lowerBody,
        showLower: m.dashboard.showLower, empty: m.dashboard.empty, stateNotes: m.dashboard.stateNotes },
    }} />
    <ProfileLists locale={locale} rows={data.rows} horizons={horizons} />
    </StateFilterProvider>
  </div>;
}

export default withPageLog("/dashboard", Dashboard);
