import { withPageLog } from "@/app/page-log";
import type { Metadata } from "next";
import { SampleStamp } from "@/components/operator-disclosure";
import { latestPortfolio, portfolioIndexedSeries, stale } from "@/data/store";
import type { IndexedSeries } from "@/portfolio/history";
import { DataStatus } from "@/components/data-status";
import { PerformanceChart, PerformanceKpis, summarize } from "@/components/portfolio-chart";
import { DataTable } from "@/components/kit";
import { KpiCard, KpiRow, RecordCard, RecordHead } from "@/components/record-parts";
import { getRecordPagesMessages } from "@/i18n/record-pages-messages";
import "@/components/record-pages.css";
import { PaywallSegment } from "@/components/paywall-segment";
import { fill, formatDate, formatNumber, getMessages } from "@/i18n";
import { pageMetadata } from "@/i18n/metadata";
import { resolveLocale, type LocaleParams } from "../locale";

export const dynamic = "force-dynamic";

/** Below this many history points a line would only join a few dots, so the page says so instead. */
const MIN_POINTS = 5;

function fixtureSeries(series: { date: string; nav: number; benchmark: number }[]): IndexedSeries {
  const end = series.at(-1);
  return { points: series.map((p) => ({ date: p.date, portfolio: p.nav, benchmark: p.benchmark })), twrPercent: end ? Number((end.nav - 100).toFixed(2)) : null, benchmarkPercent: end ? Number((end.benchmark - 100).toFixed(2)) : null };
}

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  return pageMetadata(locale, "/portfolio", m.meta.portfolioTitle, m.meta.portfolioDescription);
}

async function PortfolioPage({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  const rp = getRecordPagesMessages(locale).portfolio;
  const snapshot = await latestPortfolio();
  if (!snapshot) return <div className="frame page"><RecordHead title={m.portfolio.title} meta={<DataStatus locale={locale} lastUpdated={null} stale={false} />} /></div>;
  const indexed = snapshot.sample ? fixtureSeries(snapshot.series) : await portfolioIndexedSeries();
  const points = indexed?.points ?? [];
  const enough = points.length >= MIN_POINTS;
  const first = points[0]?.date ?? snapshot.asOf;
  const last = points.at(-1);
  const summary = enough ? summarize(points) : null;
  const ranked = [...snapshot.weights].sort((x, y) => y.weightPercent - x.weightPercent);
  const pct = (value: number) => `${formatNumber(locale, value, 1)} %`;
  const topThree = ranked.slice(0, 3).reduce((sum, position) => sum + position.weightPercent, 0);
  return <div className="frame page">
    <RecordHead
      title={m.portfolio.title}
      lede={snapshot.sample ? m.portfolio.lede : m.portfolio.liveLede}
      stamp={snapshot.sample && <SampleStamp text={m.common.sample} />}
      meta={<>
        <span className="rp-pill">{fill(m.portfolio.asOf, { date: formatDate(locale, snapshot.asOf) })}</span>
        <span className="rp-pill">{m.portfolio.delay}</span>
        <DataStatus locale={locale} lastUpdated={snapshot.asOf} stale={stale(snapshot.asOf)} />
      </>}
    />
    <p className="notice">{snapshot.sample ? m.portfolio.sampleDisclosure : m.portfolio.disclosure}</p>
    {ranked.length > 0 && <KpiRow count={3}>
      <KpiCard featured label={rp.positions}>{formatNumber(locale, ranked.length)}</KpiCard>
      <KpiCard label={rp.largest} note={ranked[0].symbol}>{pct(ranked[0].weightPercent)}</KpiCard>
      <KpiCard label={rp.topThree}>{pct(topThree)}</KpiCard>
    </KpiRow>}
    <div className="rp-stack">
    <PaywallSegment id="portfolio-performance"><RecordCard id="portfolio-chart" className="rp-perf" title={fill(m.portfolio.chartTitle, { date: formatDate(locale, first) })} lede={enough ? (snapshot.sample ? m.portfolio.chartNote : m.portfolio.liveChartNote) : undefined}>
      {enough && last ? <>
        {summary && <PerformanceKpis locale={locale} summary={summary} text={{ current: m.portfolio.kpiCurrent, since: m.portfolio.kpiSince, benchmark: m.portfolio.kpiBenchmark, difference: m.portfolio.kpiDifference, ahead: m.portfolio.kpiAhead, behind: m.portfolio.kpiBehind, drawdown: m.portfolio.kpiDrawdown }} />}
        <figure className="rp-figure">
          <PerformanceChart locale={locale} points={points} label={m.portfolio.chartAria} />
          <div className="portfolio-legend"><span>{m.portfolio.portfolioLine}</span><span>{m.portfolio.benchmarkLine}</span></div>
        </figure>
      </> : <p className="notice">{fill(m.portfolio.historyBuilding, { date: formatDate(locale, first), n: points.length })}</p>}
      {indexed?.twrPercent != null && <p className="rp-line">{formatDate(locale, first)} – {formatDate(locale, last!.date)} · {m.portfolio.twrSince}: {formatNumber(locale, indexed.twrPercent, 2)} %{indexed.benchmarkPercent != null && <> · {m.portfolio.benchmarkSince}: {formatNumber(locale, indexed.benchmarkPercent, 2)} %</>}</p>}
    </RecordCard></PaywallSegment>
    <PaywallSegment id="portfolio-weights"><RecordCard id="portfolio-weights" title={m.portfolio.weightsTitle} lede={rp.holdingsNote} flush>
      <DataTable label={m.portfolio.weightsTitle} density="compact" bounded={false}>
        <thead><tr><th scope="col" className="rp-rank">#</th><th scope="col">{m.portfolio.symbol}</th><th scope="col" className="num">{m.portfolio.weight}</th><th scope="col" className="rp-bar-col"><span className="visually-hidden">{m.portfolio.weight}</span></th></tr></thead>
        <tbody>{ranked.map((position, index) => <tr key={position.symbol}><td className="rp-rank num">{index + 1}</td><th scope="row">{position.symbol}</th><td className="num">{pct(position.weightPercent)}</td><td className="rp-bar-col" aria-hidden="true"><span className="rp-bar"><span style={{ width: `${Math.max(0, Math.min(100, position.weightPercent))}%` }} /></span></td></tr>)}</tbody>
      </DataTable>
    </RecordCard></PaywallSegment>
    </div>
  </div>;
}

export default withPageLog("/portfolio", PortfolioPage);
