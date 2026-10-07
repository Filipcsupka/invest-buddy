import type { Metadata } from "next";
import { Chart } from "@/components/chart";
import { Disclaimer } from "@/components/disclaimer";
import { OperatorDisclosure, SampleStamp } from "@/components/operator-disclosure";
import { ScreenTable } from "@/components/screen-table";
import { toRow, type ScreenRow } from "@/components/view-model";
import { fixtureBenchmark } from "@/data/record";
import { scoreHistory } from "@/data/store";
import { recordHistory } from "@/db/track-record";
import { DataStatus } from "@/components/data-status";
export const dynamic = "force-dynamic";
import { fill, formatDate, formatNumber, formatPercent, getMessages, plural } from "@/i18n";
import { pageMetadata } from "@/i18n/metadata";
import { resolveLocale, type LocaleParams } from "../locale";

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  return pageMetadata(locale, "/track-record", m.meta.trackRecordTitle, m.meta.trackRecordDescription);
}

export default async function TrackRecord({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  if (process.env.DATA_MODE !== "fixture") {
    const record = await recordHistory();
    return <div className="frame page">
      <header className="page-head">
        <h1 className="title">{m.trackRecord.title}</h1>
        <p className="lede">{m.trackRecord.liveLede}</p>
        <DataStatus locale={locale} lastUpdated={record.lastDate} stale={false} />
        <OperatorDisclosure text={m.common.operatorDisclosure} />
      </header>
      <p className="notice">{m.trackRecord.liveNote}</p>
      <section className="sheet-section" aria-labelledby="record-summary">
        <h2 id="record-summary">{m.trackRecord.summaryTitle}</h2>
        <p>{fill(record.snapshotCount === 1 ? m.trackRecord.summaryOne : m.trackRecord.summary, { count: formatNumber(locale, record.snapshotCount), date: record.firstDate ? formatDate(locale, record.firstDate) : m.trackRecord.none })}</p>
        {record.hit30.n > 0 && <p>{fill(m.trackRecord.hitRate, { rate: formatPercent(locale, record.hit30.rate ?? 0), n: formatNumber(locale, record.hit30.n) })}</p>}
        {record.buySignalCount < 30 && <p className="muted small">{fill(m.trackRecord.smallSample, { n: formatNumber(locale, record.buySignalCount) })}</p>}
      </section>
      <section className="sheet-section" aria-labelledby="signals">
        <h2 id="signals">{m.trackRecord.signalsTitle}</h2>
        {record.signals.length === 0 ? <p className="muted">{record.snapshotCount === 0 ? m.trackRecord.empty : m.trackRecord.noSignals}</p> : <div className="table-scroll"><table className="screen">
          <thead><tr><th scope="col">{m.trackRecord.date}</th><th scope="col">{m.trackRecord.ticker}</th><th scope="col">{m.trackRecord.state}</th><th scope="col">{m.trackRecord.return30}</th><th scope="col">{m.trackRecord.return90}</th><th scope="col">{m.trackRecord.return180}</th></tr></thead>
          <tbody>{record.signals.map((signal) => <tr key={signal.id}>
            <td>{formatDate(locale, signal.asOf)}</td><td>{signal.ticker}</td><td>{signal.tier} · {signal.state}</td>
            {([30, 90, 180] as const).map((days) => <td key={days}>{signal.windows[days] ? fill(m.trackRecord.returnCell, { stock: formatPercent(locale, signal.windows[days]!.stock), excess: formatPercent(locale, signal.windows[days]!.excess) }) : m.trackRecord.pending}</td>)}
          </tr>)}</tbody>
        </table></div>}
        <p className="muted small">{m.trackRecord.method}</p>
      </section>
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

      {data.sample && <section className="sheet-section" aria-labelledby="benchmark">
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
      </section>}

      <section className="sheet-section" aria-labelledby="log">
        <h2 id="log">{m.trackRecord.logTitle}</h2>
        {byDate.map(({ date, rows: list }, i) => {
          const id = `disclaimer-${date}`;
          const title = (
            <span className="snapshot-title">
              <span>{fill(m.trackRecord.snapshot, { date: formatDate(locale, date) })}</span>
              <span className="muted num">{plural(locale, m.plurals.tickers, list.length)}</span>
            </span>
          );
          const table = <ScreenTable locale={locale} rows={list} columns={["company", "score", "state", "reason"]} disclaimerId={id} caption={<Disclaimer text={m.common.disclaimer} id={id} compact />} />;
          return (
            <details key={date} className="disclosure-block snapshot" open={i === 0}>
              <summary>{title}</summary>
              {table}
            </details>
          );
        })}
      </section>
    </div>
  );
}
