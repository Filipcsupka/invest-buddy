import { withPageLog } from "@/app/page-log";
import type { Metadata } from "next";
import { SampleStamp } from "@/components/operator-disclosure";
import { latestPortfolio, portfolioIndexedSeries, stale } from "@/data/store";
import type { IndexedSeries } from "@/portfolio/history";
import { DataStatus } from "@/components/data-status";
import { PerformanceChart, PerformanceKpis, summarize } from "@/components/portfolio-chart";
import { DataTable, SectionHead } from "@/components/kit";
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
  const snapshot = await latestPortfolio();
  if (!snapshot) return <div className="frame page"><h1 className="title">{m.portfolio.title}</h1><DataStatus locale={locale} lastUpdated={null} stale={false} /></div>;
  const indexed = snapshot.sample ? fixtureSeries(snapshot.series) : await portfolioIndexedSeries();
  const points = indexed?.points ?? [];
  const enough = points.length >= MIN_POINTS;
  const first = points[0]?.date ?? snapshot.asOf;
  const last = points.at(-1);
  const summary = enough ? summarize(points) : null;
  return <div className="frame page">
    <header className="page-head">
      <div className="page-title-row"><h1 className="title">{m.portfolio.title}</h1>{snapshot.sample && <SampleStamp text={m.common.sample} />}</div>
      <p className="lede">{snapshot.sample ? m.portfolio.lede : m.portfolio.liveLede}</p>
      <p className="notice">{snapshot.sample ? m.portfolio.sampleDisclosure : m.portfolio.disclosure}</p>
      <p className="muted">{fill(m.portfolio.asOf, { date: formatDate(locale, snapshot.asOf) })} · {m.portfolio.delay}</p>
      <DataStatus locale={locale} lastUpdated={snapshot.asOf} stale={stale(snapshot.asOf)} />
    </header>
    <PaywallSegment id="portfolio-performance"><section className="rp-section" aria-labelledby="portfolio-chart">
      <SectionHead id="portfolio-chart" title={fill(m.portfolio.chartTitle, { date: formatDate(locale, first) })} lede={enough ? (snapshot.sample ? m.portfolio.chartNote : m.portfolio.liveChartNote) : undefined} />
      {enough && last ? <>
        {summary && <PerformanceKpis locale={locale} summary={summary} text={{ current: m.portfolio.kpiCurrent, since: m.portfolio.kpiSince, benchmark: m.portfolio.kpiBenchmark, difference: m.portfolio.kpiDifference, ahead: m.portfolio.kpiAhead, behind: m.portfolio.kpiBehind, drawdown: m.portfolio.kpiDrawdown }} />}
        <figure className="rp-figure">
          <PerformanceChart locale={locale} points={points} label={m.portfolio.chartAria} />
          <div className="portfolio-legend"><span>{m.portfolio.portfolioLine}</span><span>{m.portfolio.benchmarkLine}</span></div>
        </figure>
      </> : <p className="notice">{fill(m.portfolio.historyBuilding, { date: formatDate(locale, first), n: points.length })}</p>}
      {indexed?.twrPercent != null && <p className="rp-line">{formatDate(locale, first)} – {formatDate(locale, last!.date)} · {m.portfolio.twrSince}: {formatNumber(locale, indexed.twrPercent, 2)} %{indexed.benchmarkPercent != null && <> · {m.portfolio.benchmarkSince}: {formatNumber(locale, indexed.benchmarkPercent, 2)} %</>}</p>}
    </section></PaywallSegment>
    <PaywallSegment id="portfolio-weights"><section className="rp-section" aria-labelledby="portfolio-weights">
      <SectionHead id="portfolio-weights" title={m.portfolio.weightsTitle} />
      <DataTable label={m.portfolio.weightsTitle} density="compact">
        <thead><tr><th scope="col">{m.portfolio.symbol}</th><th scope="col" className="num">{m.portfolio.weight}</th><th scope="col" className="rp-bar-col"><span className="visually-hidden">{m.portfolio.weight}</span></th></tr></thead>
        <tbody>{snapshot.weights.map((position) => <tr key={position.symbol}><th scope="row">{position.symbol}</th><td className="num">{formatNumber(locale, position.weightPercent, 1)} %</td><td className="rp-bar-col" aria-hidden="true"><span className="rp-bar"><span style={{ width: `${Math.max(0, Math.min(100, position.weightPercent))}%` }} /></span></td></tr>)}</tbody>
      </DataTable>
    </section></PaywallSegment>
  </div>;
}

export default withPageLog("/portfolio", PortfolioPage);
