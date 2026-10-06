import type { Metadata } from "next";
import { SampleStamp } from "@/components/operator-disclosure";
import { latestPortfolio, portfolioIndexedSeries, stale } from "@/data/store";
import type { IndexedPoint, IndexedSeries } from "@/portfolio/history";
import { DataStatus } from "@/components/data-status";
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

/** X follows the calendar, so gaps in the history show as gaps. */
function linePath(points: IndexedPoint[], key: "portfolio" | "benchmark"): string {
  const usable = points.filter((point) => point[key] != null);
  const values = points.flatMap((point) => [point.portfolio, point.benchmark ?? point.portfolio]);
  const min = Math.floor(Math.min(...values) - 1);
  const max = Math.ceil(Math.max(...values) + 1);
  const t0 = Date.parse(points[0].date);
  const span = Math.max(1, Date.parse(points.at(-1)!.date) - t0);
  return usable.map((point, i) => `${i === 0 ? "M" : "L"}${((Date.parse(point.date) - t0) / span) * 800},${160 - ((point[key]! - min) / (max - min)) * 140}`).join(" ");
}

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  return pageMetadata(locale, "/portfolio", m.meta.portfolioTitle, m.meta.portfolioDescription);
}

export default async function PortfolioPage({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  const snapshot = await latestPortfolio();
  if (!snapshot) return <div className="frame page"><h1 className="title">{m.portfolio.title}</h1><DataStatus locale={locale} lastUpdated={null} stale={false} /></div>;
  const indexed = snapshot.sample ? fixtureSeries(snapshot.series) : await portfolioIndexedSeries();
  const points = indexed?.points ?? [];
  const enough = points.length >= MIN_POINTS;
  const first = points[0]?.date ?? snapshot.asOf;
  const last = points.at(-1);
  return <div className="frame page">
    <header className="page-head">
      <div className="page-title-row"><h1 className="title">{m.portfolio.title}</h1>{snapshot.sample && <SampleStamp text={m.common.sample} />}</div>
      <p className="lede">{snapshot.sample ? m.portfolio.lede : m.portfolio.liveLede}</p>
      <p className="notice">{snapshot.sample ? m.portfolio.sampleDisclosure : m.portfolio.disclosure}</p>
      <p className="muted">{fill(m.portfolio.asOf, { date: formatDate(locale, snapshot.asOf) })} · {m.portfolio.delay}</p>
      <DataStatus locale={locale} lastUpdated={snapshot.asOf} stale={stale(snapshot.asOf)} />
    </header>
    <section className="sheet-section" aria-labelledby="portfolio-chart">
      <div className="section-head"><h2 id="portfolio-chart">{fill(m.portfolio.chartTitle, { date: formatDate(locale, first) })}</h2>{enough && <p className="muted small">{snapshot.sample ? m.portfolio.chartNote : m.portfolio.liveChartNote}</p>}</div>
      {enough && last ? <>
        <div className="portfolio-chart" role="img" aria-label={`${m.portfolio.portfolioLine}: ${formatNumber(locale, last.portfolio, 1)}${last.benchmark != null ? `; ${m.portfolio.benchmarkLine}: ${formatNumber(locale, last.benchmark, 1)}` : ""}`}>
          <svg viewBox="0 0 800 180" preserveAspectRatio="none" aria-hidden="true">
            <path d={linePath(points, "portfolio")} className="portfolio-nav-line" />
            {points.some((point) => point.benchmark != null) && <path d={linePath(points, "benchmark")} className="portfolio-benchmark-line" />}
          </svg>
        </div>
        <div className="portfolio-legend"><span>{m.portfolio.portfolioLine}</span><span>{m.portfolio.benchmarkLine}</span></div>
      </> : <p className="notice">{fill(m.portfolio.historyBuilding, { date: formatDate(locale, first), n: points.length })}</p>}
      {indexed?.twrPercent != null && <p className="muted small">{formatDate(locale, first)} – {formatDate(locale, last!.date)} · {m.portfolio.twrSince}: {formatNumber(locale, indexed.twrPercent, 2)} %{indexed.benchmarkPercent != null && <> · {m.portfolio.benchmarkSince}: {formatNumber(locale, indexed.benchmarkPercent, 2)} %</>}</p>}
    </section>
    <section className="sheet-section" aria-labelledby="portfolio-weights">
      <h2 id="portfolio-weights">{m.portfolio.weightsTitle}</h2>
      <div className="table-scroll"><table className="data-table"><thead><tr><th scope="col">{m.portfolio.symbol}</th><th scope="col">{m.portfolio.weight}</th></tr></thead><tbody>{snapshot.weights.map((position) => <tr key={position.symbol}><th scope="row">{position.symbol}</th><td className="num">{formatNumber(locale, position.weightPercent, 1)} %</td></tr>)}</tbody></table></div>
    </section>
  </div>;
}
