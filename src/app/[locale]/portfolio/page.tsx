import type { Metadata } from "next";
import { SampleStamp } from "@/components/operator-disclosure";
import { samplePortfolio } from "@/portfolio/fixture";
import pg from "pg";
import { PostgresPortfolioRepository } from "@/db/portfolio";
import { fill, formatDate, formatNumber, getMessages } from "@/i18n";
import { pageMetadata } from "@/i18n/metadata";
import { resolveLocale, type LocaleParams } from "../locale";

export const dynamic = "force-dynamic";

async function publishedPortfolio() {
  if (!process.env.DATABASE_URL) return samplePortfolio;
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    return await new PostgresPortfolioRepository(pool).latestPublished(new Date().toISOString().slice(0, 10)) ?? samplePortfolio;
  } catch {
    return samplePortfolio;
  } finally { await pool.end(); }
}

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  return pageMetadata(locale, "/portfolio", m.meta.portfolioTitle, m.meta.portfolioDescription);
}

export default async function PortfolioPage({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  const snapshot = await publishedPortfolio();
  const series = snapshot.series;
  const all = series.flatMap((point) => [point.nav, point.benchmark]);
  const min = Math.floor(Math.min(...all) - 1);
  const max = Math.ceil(Math.max(...all) + 1);
  const line = (key: "nav" | "benchmark") => series.map((point, index) => `${index === 0 ? "M" : "L"}${(index / (series.length - 1)) * 800},${160 - ((point[key] - min) / (max - min)) * 140}`).join(" ");
  return <div className="frame page">
    <header className="page-head">
      <div className="page-title-row"><h1 className="title">{m.portfolio.title}</h1>{(snapshot.sample || snapshot.benchmarkSample) && <SampleStamp text={m.common.sample} />}</div>
      <p className="lede">{snapshot.sample ? m.portfolio.lede : m.portfolio.liveLede}</p>
      <p className="notice">{snapshot.sample ? m.portfolio.sampleDisclosure : m.portfolio.disclosure}</p>
      <p className="muted">{fill(m.portfolio.asOf, { date: formatDate(locale, snapshot.asOf) })} · {m.portfolio.delay}</p>
    </header>
    <section className="sheet-section" aria-labelledby="portfolio-chart">
      <div className="section-head"><h2 id="portfolio-chart">{m.portfolio.chartTitle}</h2><p className="muted small">{snapshot.sample ? m.portfolio.chartNote : snapshot.benchmarkSample ? m.portfolio.fixtureBenchmarkNote : m.portfolio.liveChartNote}</p></div>
      <div className="portfolio-chart" role="img" aria-label={`${m.portfolio.portfolioLine}: ${formatNumber(locale, series.at(-1)!.nav, 1)}; ${m.portfolio.benchmarkLine}: ${formatNumber(locale, series.at(-1)!.benchmark, 1)}`}>
        <svg viewBox="0 0 800 180" preserveAspectRatio="none" aria-hidden="true"><path d={line("nav")} className="portfolio-nav-line" /><path d={line("benchmark")} className="portfolio-benchmark-line" /></svg>
      </div>
      <div className="portfolio-legend"><span>{m.portfolio.portfolioLine}</span><span>{m.portfolio.benchmarkLine}</span></div>
      <p className="muted small">{formatDate(locale, series[0].date)} – {formatDate(locale, series.at(-1)!.date)} · {m.portfolio.dailyTwr}: {formatNumber(locale, series.at(-1)!.twrPercent, 2)} %</p>
    </section>
    <section className="sheet-section" aria-labelledby="portfolio-weights">
      <h2 id="portfolio-weights">{m.portfolio.weightsTitle}</h2>
      <div className="table-scroll"><table className="data-table"><thead><tr><th scope="col">{m.portfolio.symbol}</th><th scope="col">{m.portfolio.weight}</th></tr></thead><tbody>{snapshot.weights.map((position) => <tr key={position.symbol}><th scope="row">{position.symbol}</th><td className="num">{formatNumber(locale, position.weightPercent, 1)} %</td></tr>)}</tbody></table></div>
    </section>
  </div>;
}
