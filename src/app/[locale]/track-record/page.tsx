import { withPageLog } from "@/app/page-log";
import type { Metadata } from "next";
import { Chart } from "@/components/chart";
import { Disclaimer } from "@/components/disclaimer";
import { OperatorDisclosure, SampleStamp } from "@/components/operator-disclosure";
import { ScreenTable } from "@/components/screen-table";
import { toRow, type ScreenRow } from "@/components/view-model";
import { fixtureBenchmark } from "@/data/record";
import { instrumentUniverse, scoreHistory, stale } from "@/data/store";
import { recordHistory } from "@/db/track-record";
import { recordBenchmark } from "@/db/record-benchmark";
import { DataStatus } from "@/components/data-status";
import { PaywallSegment } from "@/components/paywall-segment";
export const dynamic = "force-dynamic";
import { fill, formatDate, formatNumber, formatPercent, getMessages, intlTag, plural, type Locale } from "@/i18n";
import { pageMetadata } from "@/i18n/metadata";
import { resolveLocale, type LocaleParams } from "../locale";
import { recordSignalLabel } from "@/i18n/record-signal";
import { flags } from "@/config/flags";
import { WINDOWS } from "@/track-record/measure";
import { periodTable } from "@/track-record/period-table";

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  return pageMetadata(locale, "/track-record", m.meta.trackRecordTitle, m.meta.trackRecordDescription);
}

function formatMonth(locale: Locale, period: string): string {
  return new Intl.DateTimeFormat(intlTag[locale], { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${period}-01T00:00:00Z`));
}

async function TrackRecord({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  if (process.env.DATA_MODE !== "fixture") {
    const record = await recordHistory();
    const benchmark = await recordBenchmark(record.firstDate, record.lastDate);
    const universe = (await instrumentUniverse()).length;
    const periods = periodTable(record.signals, benchmark, new Date().toISOString().slice(0, 10));
    const periodLabel = (period: string) => periods.grain === "month" ? formatMonth(locale, period) : period;
    return <div className="frame page">
      <header className="page-head">
        <h1 className="title">{m.trackRecord.title}</h1>
        <p className="lede">{m.trackRecord.liveLede}</p>
        <DataStatus locale={locale} lastUpdated={record.lastDate} stale={stale(record.lastDate)} />
        <OperatorDisclosure text={m.common.operatorDisclosure} />
      </header>
      <p className="notice">{m.trackRecord.liveNote}</p>
      <section className="sheet-section" aria-labelledby="record-summary">
        <h2 id="record-summary">{m.trackRecord.summaryTitle}</h2>
        <p>{fill(record.snapshotCount === 1 ? m.trackRecord.summaryOne : m.trackRecord.summary, { count: formatNumber(locale, record.snapshotCount), date: record.firstDate ? formatDate(locale, record.firstDate) : m.trackRecord.none })}</p>
        {record.hit20.n > 0 && <p>{fill(m.trackRecord.hitRate, { rate: formatPercent(locale, record.hit20.rate ?? 0), n: formatNumber(locale, record.hit20.n) })}</p>}
        {record.worst.length > 0 && <p className="muted small">{m.trackRecord.worstNote}</p>}
        {record.firstDate && <p className="muted small">{fill(m.trackRecord.excluded, { date: formatDate(locale, record.firstDate) })}</p>}
        {record.buySignalCount < 30 && <p className="muted small">{fill(m.trackRecord.smallSample, { n: formatNumber(locale, record.buySignalCount) })}</p>}
      </section>
      <PaywallSegment id="track-record-benchmark"><section className="sheet-section" aria-labelledby="benchmark">
        <h2 id="benchmark">SPY</h2>
        {benchmark.length >= 2 ? <Chart
          bars={benchmark}
          count={benchmark.length}
          locale={locale}
          dipZone={false}
          averages={false}
          labels={{ name: "SPY", aria: m.chart.label, close: "SPY", ma50: m.chart.ma50, ma200: m.chart.ma200, dip: m.chart.dip, last: m.chart.last }}
        /> : <p className="notice">{m.common.noDataYet}</p>}
      </section></PaywallSegment>
      {periods.rows.length > 0 && <section className="sheet-section" aria-labelledby="periods">
        <h2 id="periods">{m.trackRecord.periodTitle}</h2>
        <div className="table-scroll" role="region" tabIndex={0} aria-label={m.trackRecord.periodTitle}><table className="screen">
          <thead><tr><th scope="col">{periods.grain === "month" ? m.trackRecord.periodMonth : m.trackRecord.periodYear}</th><th scope="col">{m.trackRecord.periodN}</th><th scope="col">{m.trackRecord.periodHit}</th><th scope="col">{m.trackRecord.periodExcess}</th><th scope="col">{m.trackRecord.periodSpy}</th></tr></thead>
          <tbody>
            {periods.rows.map((row) => <tr key={row.period}>
              <td>{periodLabel(row.period)}</td><td>{formatNumber(locale, row.n)}</td>
              <td>{row.hitRate === null ? "–" : formatPercent(locale, row.hitRate)}</td>
              <td>{row.meanExcess === null ? "–" : formatPercent(locale, row.meanExcess)}</td>
              <td>{row.spyChange === null ? "–" : formatPercent(locale, row.spyChange)}</td>
            </tr>)}
            {periods.spy && <tr><th scope="row">{fill(m.trackRecord.periodSpyRow, { from: formatDate(locale, periods.spy.from), to: formatDate(locale, periods.spy.to) })}</th><td>–</td><td>–</td><td>–</td><td>{formatPercent(locale, periods.spy.change)}</td></tr>}
          </tbody>
        </table></div>
        <p className="muted small">{m.trackRecord.periodNote}</p>
      </section>}
      {record.worst.length > 0 && <PaywallSegment id="track-record-worst"><section className="sheet-section" aria-labelledby="worst">
        <h2 id="worst">{m.trackRecord.worstTitle}</h2>
        <div className="table-scroll" role="region" tabIndex={0} aria-label={m.trackRecord.worstTitle}><table className="screen">
          <thead><tr><th scope="col">{m.trackRecord.date}</th><th scope="col">{m.trackRecord.ticker}</th><th scope="col">{m.trackRecord.window}</th><th scope="col">{m.trackRecord.worstTitle}</th></tr></thead>
          <tbody>{record.worst.map((item) => <tr key={`${item.id}:${item.window}`}>
            <td>{formatDate(locale, item.asOf)}</td><td>{item.ticker}</td><td>{m.trackRecord[`return${item.window}`]}</td>
            <td>{fill(m.trackRecord.worstCell, { stock: formatPercent(locale, item.stock), excess: formatPercent(locale, item.excess) })}</td>
          </tr>)}</tbody>
        </table></div>
      </section></PaywallSegment>}
      <PaywallSegment id="track-record-signals"><section className="sheet-section" aria-labelledby="signals">
        <h2 id="signals">{m.trackRecord.signalsTitle}</h2>
        {record.signals.length === 0 ? <p className="muted">{record.snapshotCount === 0 ? m.trackRecord.empty : m.trackRecord.noSignals}</p> : <div className="table-scroll" role="region" tabIndex={0} aria-label={m.trackRecord.signalsTitle}><table className="screen">
          <thead><tr><th scope="col">{m.trackRecord.date}</th><th scope="col">{m.trackRecord.ticker}</th><th scope="col">{flags().ADVICE_OUTPUT ? m.trackRecord.state : m.trackRecord.stateOnly}</th>{WINDOWS.map((days) => <th scope="col" key={days}>{m.trackRecord[`return${days}`]}</th>)}</tr></thead>
          <tbody>{record.signals.map((signal) => <tr key={signal.id}>
            <td>{formatDate(locale, signal.asOf)}</td><td>{signal.ticker}</td><td>{recordSignalLabel(locale, signal)}</td>
            {WINDOWS.map((days) => <td key={days}>{signal.windows[days] ? fill(m.trackRecord.returnCell, { stock: formatPercent(locale, signal.windows[days]!.stock), excess: formatPercent(locale, signal.windows[days]!.excess) }) : m.trackRecord.pending}</td>)}
          </tr>)}</tbody>
        </table></div>}
        <p className="muted small">{m.trackRecord.method}</p>
        <p className="muted small">{fill(m.trackRecord.methodLine, { universe: formatNumber(locale, universe), date: record.firstDate ? formatDate(locale, record.firstDate) : m.trackRecord.none, n: formatNumber(locale, record.buySignalCount) })}</p>
        <p className="muted small">{m.trackRecord.backtest}</p>
      </section></PaywallSegment>
      <Disclaimer text={m.common.disclaimer} />
    </div>;
  }
  const data = await scoreHistory();
  const rows = data.rows.map((row) => toRow(locale, row));
  const dates = [...new Set(rows.map((row) => row.date))].sort().reverse();
  const byDate = dates.map((date) => ({ date, rows: rows.filter((row) => row.date === date) as ScreenRow[] }));

  return (
    <div className="frame page">
      <header className="page-head">
        <div className="page-title-row">
          <h1 className="title">{m.trackRecord.title}</h1>
          {data.sample && <SampleStamp text={m.common.sample} />}
        </div>
        <p className="lede">{data.sample ? m.trackRecord.lede : m.trackRecord.liveLede}</p>
        <DataStatus locale={locale} lastUpdated={data.lastUpdated} stale={data.stale} />
        <OperatorDisclosure text={m.common.operatorDisclosure} />
      </header>

      <p className="notice">{data.sample ? m.trackRecord.note : m.trackRecord.liveNote}</p>

      {data.sample && <PaywallSegment id="track-record-benchmark"><section className="sheet-section" aria-labelledby="benchmark">
        <div className="section-head">
          <h2 id="benchmark">{m.trackRecord.benchmarkTitle}</h2>
          <p className="muted small">{m.trackRecord.benchmarkNote}</p>
        </div>
        <Chart
          bars={fixtureBenchmark()}
          locale={locale}
          dipZone={false}
          labels={{ name: m.trackRecord.benchmarkName, aria: m.chart.label, close: m.trackRecord.benchmarkName, ma50: m.chart.ma50, ma200: m.chart.ma200, dip: m.chart.dip, last: m.chart.last }}
        />
      </section></PaywallSegment>}

      <PaywallSegment id="track-record-history"><section className="sheet-section" aria-labelledby="log">
        <h2 id="log">{m.trackRecord.logTitle}</h2>
        {byDate.map(({ date, rows: list }, i) => {
          const id = `disclaimer-${date}`;
          const title = (
            <span className="snapshot-title">
              <span>{fill(m.trackRecord.snapshot, { date: formatDate(locale, date) })}</span>
              <span className="muted num">{plural(locale, m.plurals.tickers, list.length)}</span>
            </span>
          );
          const table = <ScreenTable locale={locale} rows={list} columns={["company", "score", "state", "reason"]} disclaimerId={id} label={m.trackRecord.logTitle} caption={<Disclaimer text={m.common.disclaimer} id={id} compact />} />;
          return (
            <details key={date} className="disclosure-block snapshot" open={i === 0}>
              <summary>{title}</summary>
              {table}
            </details>
          );
        })}
      </section></PaywallSegment>
    </div>
  );
}

export default withPageLog("/track-record", TrackRecord);
