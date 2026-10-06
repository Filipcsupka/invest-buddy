import type { Metadata } from "next";
import { Chart } from "@/components/chart";
import { Disclaimer } from "@/components/disclaimer";
import { OperatorDisclosure, SampleStamp } from "@/components/operator-disclosure";
import { ScreenTable } from "@/components/screen-table";
import { toRow, type ScreenRow } from "@/components/view-model";
import { fixtureBenchmark } from "@/data/record";
import { scoreHistory } from "@/data/store";
import { DataStatus } from "@/components/data-status";
export const dynamic = "force-dynamic";
import { fill, formatDate, getMessages, plural } from "@/i18n";
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
