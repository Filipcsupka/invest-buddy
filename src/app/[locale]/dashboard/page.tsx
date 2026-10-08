import { withPageLog } from "@/app/page-log";
import type { Metadata } from "next";
import { OperatorDisclosure, SampleStamp } from "@/components/operator-disclosure";
import { ScannerTable } from "@/components/scanner-table";
import { byScore, toRow } from "@/components/view-model";
import { latestPortfolio, latestScores } from "@/data/store";
import { DataStatus } from "@/components/data-status";
import { fill, formatDate, getMessages, plural } from "@/i18n";
import { pageMetadata } from "@/i18n/metadata";
import { resolveLocale, type LocaleParams } from "../locale";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  return pageMetadata(locale, "/dashboard", m.meta.dashboardTitle, m.meta.dashboardDescription);
}

async function Dashboard({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  const [data, portfolio] = await Promise.all([latestScores(), latestPortfolio()]);
  const rows = data.rows.map((row) => toRow(locale, row)).sort(byScore);
  const session = rows.find((row) => row.date)?.date ?? "";
  return <div className="frame page">
    <header className="page-head">
      <div className="page-title-row"><h1 className="title">{m.dashboard.title}</h1>{data.sample && <SampleStamp text={m.common.sample} />}</div>
      {data.lastUpdated && <p className="lede">{fill(m.dashboard.lede, { date: formatDate(locale, session), count: plural(locale, data.sample ? m.plurals.sampleTickers : m.plurals.tickers, rows.length) })}</p>}
      <DataStatus locale={locale} lastUpdated={data.lastUpdated} stale={data.stale} />
      <OperatorDisclosure text={m.common.operatorDisclosure} />
    </header>
    <ScannerTable locale={locale} rows={rows} heldTickers={portfolio?.weights.filter((p) => p.weightPercent > 0).map((p) => p.symbol.toUpperCase()) ?? []} text={{
      searchLabel: m.scanner.searchLabel, searchPlaceholder: m.scanner.searchPlaceholder,
      filterLabel: m.scanner.filterLabel, allStates: m.scanner.allStates, clear: m.scanner.clear,
      empty: m.scanner.empty, showing: m.scanner.showing, sortBy: m.table.sortBy,
      disclaimer: m.common.disclaimer, extension: m.common.extension, noScore: m.common.noScore, noRejection: m.table.noRejection,
      held: m.portfolio.held, heldNoSignal: m.portfolio.heldNoSignal,
      columns: { ticker: m.table.ticker, sector: m.table.sector, score: m.table.score, rules: m.table.rules, state: m.table.state, criteria: m.table.criteria,
        f: m.groups.fundamentalsShort, t: m.groups.technicalShort, m: m.groups.macroShort,
        fName: m.groups.fundamentals, tName: m.groups.technical, mName: m.groups.macro },
      states: m.states,
      board: { summaryLabel: m.dashboard.summaryLabel, lowerTitle: m.dashboard.lowerTitle, lowerBody: m.dashboard.lowerBody,
        showLower: m.dashboard.showLower, empty: m.dashboard.empty, stateNotes: m.dashboard.stateNotes },
    }} />
  </div>;
}

export default withPageLog("/dashboard", Dashboard);
