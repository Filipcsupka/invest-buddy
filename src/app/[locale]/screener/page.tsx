import type { Metadata } from "next";
import { pageMetadata } from "@/i18n/metadata";
import Link from "next/link";
import { withPageLog } from "@/app/page-log";
import { assertViewable } from "@/markets/gate";
import { latestScreenerRuns, screenerResults } from "@/db/screener";
import { SCREENER_PRESETS, presetById, type ScreenerFilter } from "@/db/screener-presets";
import { getMarketsMessages } from "@/i18n/markets-messages";
import { fill, formatNumber, type Locale } from "@/i18n";
import { RecordCard, RecordHead } from "@/components/record-parts";
import t from "@/components/etf/etf.module.css";
import { resolveLocale } from "../locale";
import { OwnerStamp } from "../indices/_components/asset-pages";
import { compact, day, percentOf, signedPercent } from "../indices/_components/format";
import s from "../indices/_components/markets.module.css";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string }>; searchParams?: Promise<{ preset?: string }> };
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMarketsMessages(locale);
  return { ...pageMetadata(locale, "/screener", m.screener.title, m.screener.lede), robots: { index: false, follow: false } };
}

function filterText(locale: Locale, [field, op, value]: ScreenerFilter): string {
  const shown = typeof value === "number" ? field === "dividend_yield" ? percentOf(locale, value, 0) : value >= 1e9 ? `${formatNumber(locale, value / 1e9)} bn` : formatNumber(locale, value) : value;
  return `${field} ${op} ${shown}`;
}

async function ScreenerPage({ params, searchParams }: Props) {
  const locale = await resolveLocale(params);
  await assertViewable("eodhd");
  const m = getMarketsMessages(locale);
  const preset = presetById((await searchParams)?.preset) ?? SCREENER_PRESETS[0];
  const [runs, result] = await Promise.all([latestScreenerRuns(), screenerResults(preset.id)]);
  const run = runs.find((item) => item.preset === preset.id);
  const name = m.screener.names[preset.id] ?? preset.id;
  return <div className="frame page">
    <RecordHead title={m.screener.title} lede={m.screener.lede} stamp={<OwnerStamp locale={locale} />} />
    <div className={t.stack}>
      <nav aria-label={m.screener.presets}><ul className={s.presets}>{SCREENER_PRESETS.map((item) => <li key={item.id}>
        <Link href={`/${locale}/screener?preset=${item.id}`} aria-current={item.id === preset.id ? "page" : undefined}>{m.screener.names[item.id] ?? item.id}</Link>
      </li>)}</ul></nav>
      <RecordCard id="results" title={name} lede={run ? fill(m.screener.runOn, { date: day(locale, run.asOf), n: run.rowCount }) : m.screener.noRun} flush={result.rows.length > 0}>
        <ul className={s.filters} aria-label={m.screener.filters}>
          {preset.filters.map((filter) => <li key={filter.join(" ")}><code>{filterText(locale, filter)}</code></li>)}
          {preset.signals ? <li><code>signal = {preset.signals}</code></li> : null}
        </ul>
        {result.rows.length ? <div className={t.tableWrap}><table className={t.table}>
          <caption className="visually-hidden">{m.screener.table}: {name}</caption>
          <thead><tr>
            <th scope="col" className={s.right}>{m.screener.rank}</th><th scope="col">{m.screener.code}</th><th scope="col">{m.screener.sector}</th>
            <th scope="col" className={s.right}>{m.screener.close}</th><th scope="col" className={s.right}>{m.screener.change1d}</th><th scope="col" className={s.right}>{m.screener.change5d}</th>
            <th scope="col" className={s.right}>{m.screener.marketCap}</th><th scope="col" className={s.right}>{m.screener.dividendYield}</th><th scope="col" className={s.right}>{m.screener.avgVolume}</th>
          </tr></thead>
          <tbody>{result.rows.map((row) => <tr key={`${row.code}.${row.exchange}`}>
            <td className={s.right}>{row.rank}</td>
            <th scope="row">{row.code}<span className={s.code}>{row.name ?? m.noValue} · {row.exchange}</span></th>
            <td>{row.sector ?? m.noValue}</td>
            <td className={s.right}>{row.close === null ? m.noValue : `${row.currencySymbol ?? ""}${formatNumber(locale, row.close, 2)}`}</td>
            <td className={s.right}>{signedPercent(locale, row.change1d)}</td>
            <td className={s.right}>{signedPercent(locale, row.change5d)}</td>
            <td className={s.right}>{compact(locale, row.marketCap)}</td>
            <td className={s.right}>{percentOf(locale, row.dividendYield)}</td>
            <td className={s.right}>{compact(locale, row.avgVolume200d)}</td>
          </tr>)}</tbody>
        </table></div> : run ? <p className={t.note}>{fill(m.screener.empty, { date: day(locale, run.asOf) })}</p> : null}
      </RecordCard>
      <p className={t.note}>{m.screener.note} {m.factsOnly} {m.source}</p>
    </div>
  </div>;
}
export default withPageLog("/screener", ScreenerPage);
