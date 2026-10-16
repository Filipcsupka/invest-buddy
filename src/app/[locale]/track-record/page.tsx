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
import Link from "next/link";
import { CountUp, DataTable } from "@/components/kit";
import { JumpTabs, KpiCard, KpiRow, RecordCard, RecordHead } from "@/components/record-parts";
import { getRecordPagesMessages } from "@/i18n/record-pages-messages";
import "@/components/record-pages.css";
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
    const periods = periodTable(record.signals, benchmark, new Date().toISOString().slice(0, 10), record.firstDate);
    const periodLabel = (period: string) => periods.grain === "month" ? formatMonth(locale, period) : period;
    const rp = getRecordPagesMessages(locale).record;
    const startDate = record.firstDate ? formatDate(locale, record.firstDate) : m.trackRecord.none;
    const hitRate = record.hit20.n > 0 ? record.hit20.rate ?? 0 : null;
    const jump = [
      { id: "benchmark", label: "SPY" },
      ...(periods.rows.length > 0 ? [{ id: "periods", label: m.trackRecord.periodTitle }] : []),
      ...(record.worst.length > 0 ? [{ id: "worst", label: m.trackRecord.worstTitle }] : []),
      { id: "signals", label: m.trackRecord.signalsTitle },
    ];
    return <div className="frame page">
      <RecordHead
        title={m.trackRecord.title}
        lede={m.trackRecord.liveLede}
        meta={<><DataStatus locale={locale} lastUpdated={record.lastDate} stale={stale(record.lastDate)} /><OperatorDisclosure text={m.common.operatorDisclosure} /></>}
        actions={<Link className="button secondary" href={`/${locale}/methodology`}>{m.nav.methodology}</Link>}
      />
      <p className="notice">{m.trackRecord.liveNote}</p>
      <KpiRow count={hitRate === null ? 4 : 5}>
        {hitRate !== null && <KpiCard featured label={rp.hitRateLabel} note={fill(rp.hitRateNote, { n: formatNumber(locale, record.hit20.n) })}>{formatPercent(locale, hitRate)}</KpiCard>}
        <KpiCard label={rp.startLabel}>{record.firstDate ? <time dateTime={record.firstDate}>{startDate}</time> : startDate}</KpiCard>
        <KpiCard label={rp.snapshotsLabel}><CountUp value={record.snapshotCount} locale={locale} /></KpiCard>
        <KpiCard label={rp.signalsLabel}><CountUp value={record.buySignalCount} locale={locale} /></KpiCard>
        <KpiCard label={rp.measuredLabel}><CountUp value={record.hit20.n} locale={locale} /></KpiCard>
      </KpiRow>
      <div className="rp-grid" data-split="2">
        <RecordCard id="record-summary" title={m.trackRecord.summaryTitle} lede={fill(record.snapshotCount === 1 ? m.trackRecord.summaryOne : m.trackRecord.summary, { count: formatNumber(locale, record.snapshotCount), date: startDate })}>
          <div className="rp-notes">
            {record.hit20.n > 0 && <p className="rp-hit">{fill(m.trackRecord.hitRate, { rate: formatPercent(locale, record.hit20.rate ?? 0), n: formatNumber(locale, record.hit20.n) })}</p>}
            {record.buySignalCount < 30 && <p className="muted small">{fill(m.trackRecord.smallSample, { n: formatNumber(locale, record.buySignalCount) })}</p>}
            {record.firstDate && <p className="muted small">{fill(m.trackRecord.excluded, { date: startDate })}</p>}
          </div>
        </RecordCard>
        <RecordCard id="record-method" title={rp.methodTitle} lede={rp.missesStay}>
          <div className="rp-method">
            <p className="prose">{m.trackRecord.method}</p>
            <p className="rp-line">{fill(m.trackRecord.methodLine, { universe: formatNumber(locale, universe), date: startDate, n: formatNumber(locale, record.buySignalCount) })}</p>
            <p className="rp-line">{m.trackRecord.backtest}</p>
          </div>
        </RecordCard>
      </div>
      <JumpTabs label={rp.jumpLabel} items={jump} />
      <div className="rp-stack">
      <PaywallSegment id="track-record-benchmark"><RecordCard id="benchmark" title="SPY">
        {benchmark.length >= 2 ? <figure className="rp-figure">
          <Chart
            bars={benchmark}
            count={benchmark.length}
            locale={locale}
            dipZone={false}
            averages={false}
            labels={{ name: "SPY", aria: m.chart.label, close: "SPY", ma50: m.chart.ma50, ma200: m.chart.ma200, dip: m.chart.dip, last: m.chart.last }}
          />
        </figure> : <p className="notice">{m.common.noDataYet}</p>}
      </RecordCard></PaywallSegment>
      {periods.rows.length > 0 && <PaywallSegment id="track-record-periods"><RecordCard id="periods" title={m.trackRecord.periodTitle} lede={m.trackRecord.periodNote} flush>
        <DataTable label={m.trackRecord.periodTitle} bounded={false}>
          <thead><tr><th scope="col">{periods.grain === "month" ? m.trackRecord.periodMonth : m.trackRecord.periodYear}</th><th scope="col" className="num">{m.trackRecord.periodN}</th><th scope="col" className="num">{m.trackRecord.periodHit}</th><th scope="col" className="num">{m.trackRecord.periodExcess}</th><th scope="col" className="num">{m.trackRecord.periodSpy}</th></tr></thead>
          <tbody>
            {periods.rows.map((row) => <tr key={row.period}>
              <th scope="row">{periodLabel(row.period)}</th><td className="num">{formatNumber(locale, row.n)}{row.pending > 0 && <span className="muted small"> ({fill(m.trackRecord.periodPending, { n: formatNumber(locale, row.pending) })})</span>}</td>
              <td className="num">{row.hitRate === null ? "–" : formatPercent(locale, row.hitRate)}</td>
              <td className="num">{row.meanExcess === null ? "–" : formatPercent(locale, row.meanExcess)}</td>
              <td className="num">{row.spyChange === null ? "–" : formatPercent(locale, row.spyChange)}</td>
            </tr>)}
            {periods.spy && <tr className="rp-bench"><th scope="row">{fill(m.trackRecord.periodSpyRow, { from: formatDate(locale, periods.spy.from), to: formatDate(locale, periods.spy.to) })}</th><td className="num">–</td><td className="num">–</td><td className="num">–</td><td className="num">{formatPercent(locale, periods.spy.change)}</td></tr>}
          </tbody>
        </DataTable>
      </RecordCard></PaywallSegment>}
      {record.worst.length > 0 && <PaywallSegment id="track-record-worst"><RecordCard id="worst" title={m.trackRecord.worstTitle} lede={m.trackRecord.worstNote} flush>
        <DataTable label={m.trackRecord.worstTitle} bounded={false}>
          <thead><tr><th scope="col">{m.trackRecord.date}</th><th scope="col">{m.trackRecord.ticker}</th><th scope="col">{m.trackRecord.window}</th><th scope="col">{m.trackRecord.worstTitle}</th></tr></thead>
          <tbody>{record.worst.map((item) => <tr key={`${item.id}:${item.window}`}>
            <td>{formatDate(locale, item.asOf)}</td><th scope="row">{item.ticker}</th><td>{m.trackRecord[`return${item.window}`]}</td>
            <td>{fill(m.trackRecord.worstCell, { stock: formatPercent(locale, item.stock), excess: formatPercent(locale, item.excess) })}</td>
          </tr>)}</tbody>
        </DataTable>
      </RecordCard></PaywallSegment>}
      <PaywallSegment id="track-record-signals"><RecordCard id="signals" title={m.trackRecord.signalsTitle} flush={record.signals.length > 0}>
        {record.signals.length === 0 ? <p className="rp-empty">{record.snapshotCount === 0 ? m.trackRecord.empty : m.trackRecord.noSignals}</p> : <DataTable label={m.trackRecord.signalsTitle} density="compact">
          <thead><tr><th scope="col">{m.trackRecord.date}</th><th scope="col">{m.trackRecord.ticker}</th><th scope="col">{flags().ADVICE_OUTPUT ? m.trackRecord.state : m.trackRecord.stateOnly}</th>{WINDOWS.map((days) => <th scope="col" key={days}>{m.trackRecord[`return${days}`]}</th>)}</tr></thead>
          <tbody>{record.signals.map((signal) => <tr key={signal.id}>
            <td>{formatDate(locale, signal.asOf)}</td><th scope="row">{signal.ticker}</th><td>{recordSignalLabel(locale, signal)}</td>
            {WINDOWS.map((days) => <td key={days}>{signal.windows[days] ? fill(m.trackRecord.returnCell, { stock: formatPercent(locale, signal.windows[days]!.stock), excess: formatPercent(locale, signal.windows[days]!.excess) }) : <span className="muted">{m.trackRecord.pending}</span>}</td>)}
          </tr>)}</tbody>
        </DataTable>}
      </RecordCard></PaywallSegment>
      </div>
      <Disclaimer text={m.common.disclaimer} />
    </div>;
  }
  const rp = getRecordPagesMessages(locale).record;
  const data = await scoreHistory();
  const rows = data.rows.map((row) => toRow(locale, row));
  const dates = [...new Set(rows.map((row) => row.date))].sort().reverse();
  const byDate = dates.map((date) => ({ date, rows: rows.filter((row) => row.date === date) as ScreenRow[] }));

  return (
    <div className="frame page">
      <RecordHead
        title={m.trackRecord.title}
        lede={data.sample ? m.trackRecord.lede : m.trackRecord.liveLede}
        stamp={data.sample && <SampleStamp text={m.common.sample} />}
        meta={<><DataStatus locale={locale} lastUpdated={data.lastUpdated} stale={data.stale} /><OperatorDisclosure text={m.common.operatorDisclosure} /></>}
        actions={<Link className="button secondary" href={`/${locale}/methodology`}>{m.nav.methodology}</Link>}
      />

      <p className="notice">{data.sample ? m.trackRecord.note : m.trackRecord.liveNote}</p>

      <KpiRow count={3}>
        <KpiCard featured label={rp.firstSnapshot} note={rp.missesStay}>{dates.length ? <time dateTime={dates[dates.length - 1]}>{formatDate(locale, dates[dates.length - 1])}</time> : m.trackRecord.none}</KpiCard>
        <KpiCard label={rp.snapshotsLabel}><CountUp value={dates.length} locale={locale} /></KpiCard>
        <KpiCard label={rp.tickersLabel}><CountUp value={byDate[0]?.rows.length ?? 0} locale={locale} /></KpiCard>
      </KpiRow>
      <JumpTabs label={rp.jumpLabel} items={[...(data.sample ? [{ id: "benchmark", label: m.trackRecord.benchmarkTitle }] : []), { id: "log", label: m.trackRecord.logTitle }]} />
      <div className="rp-stack">
      {data.sample && <PaywallSegment id="track-record-benchmark"><RecordCard id="benchmark" title={m.trackRecord.benchmarkTitle} lede={m.trackRecord.benchmarkNote} meta={<SampleStamp text={m.common.sample} />}>
        <figure className="rp-figure">
          <Chart
            bars={fixtureBenchmark()}
            locale={locale}
            dipZone={false}
            labels={{ name: m.trackRecord.benchmarkName, aria: m.chart.label, close: m.trackRecord.benchmarkName, ma50: m.chart.ma50, ma200: m.chart.ma200, dip: m.chart.dip, last: m.chart.last }}
          />
        </figure>
      </RecordCard></PaywallSegment>}

      <PaywallSegment id="track-record-history"><RecordCard id="log" title={m.trackRecord.logTitle}>
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
            <details key={date} className="disclosure-block snapshot rp-snapshot" open={i === 0}>
              <summary>{title}</summary>
              {table}
            </details>
          );
        })}
      </RecordCard></PaywallSegment>
      </div>
    </div>
  );
}

export default withPageLog("/track-record", TrackRecord);
