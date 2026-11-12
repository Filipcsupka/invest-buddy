import type { Metadata } from "next";
import Link from "next/link";
import { withPageLog } from "@/app/page-log";
import { Disclaimer } from "@/components/disclaimer";
import { DataTable } from "@/components/kit";
import { MacroEvents } from "@/components/macro-events";
import { KpiCard, KpiRow, RecordCard, RecordHead } from "@/components/record-parts";
import "@/components/record-pages.css";
import { loadMacroEvents } from "@/data/macro-calendar";
import { economicCalendar, eventCountries, fedFundsRate, latestIndicators, ustCurve, type CalendarEvent, type CurveView } from "@/db/economy";
import { getPool } from "@/db/pool";
import { fill, formatDate, formatNumber, getMessages, type Locale } from "@/i18n";
import { countryName, getFlowMessages, type FlowMessages } from "@/i18n/flow-messages";
import { pageMetadata } from "@/i18n/metadata";
import { assertViewable } from "@/markets/gate";
import { resolveLocale, type LocaleParams } from "@/app/[locale]/locale";
import { basisPoints, figure, formatUtcTime } from "./format";
import { YieldCurve } from "./yield-curve";
import styles from "./flow.module.css";

export const dynamic = "force-dynamic";

const TABS = ["rates", "calendar", "countries"] as const;
type Tab = (typeof TABS)[number];
type Search = { tab?: string | string[]; country?: string | string[] };

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getFlowMessages(locale).economy;
  return { ...pageMetadata(locale, "/economy", m.title, m.metaDescription), robots: { index: false, follow: false } };
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function Rates({ locale, m, yields, real, bills, long, policy }: {
  locale: Locale; m: FlowMessages; yields: CurveView; real: CurveView; bills: CurveView; long: CurveView; policy: Awaited<ReturnType<typeof fedFundsRate>>;
}) {
  const e = m.economy, dash = m.common.dash;
  const latest = yields.latest;
  if (!latest && !real.latest && !bills.latest && !long.latest) return <p className="rp-empty">{m.common.noData}</p>;
  const at = (view: CurveView | null, slot: "latest" | "weekAgo" | "monthAgo", tenor: string) => view?.[slot]?.points.find((point) => point.tenor === tenor)?.rate;
  const kpi = (tenor: string) => at(yields, "latest", tenor);
  return <>
    <KpiRow count={4}>
      <KpiCard featured label={`10Y`}>{kpi("10Y") === undefined ? dash : `${formatNumber(locale, kpi("10Y")!, 2)} %`}</KpiCard>
      <KpiCard label={`2Y`}>{kpi("2Y") === undefined ? dash : `${formatNumber(locale, kpi("2Y")!, 2)} %`}</KpiCard>
      <KpiCard label={`3M`}>{kpi("3M") === undefined ? dash : `${formatNumber(locale, kpi("3M")!, 2)} %`}</KpiCard>
      <KpiCard label={e.policyTitle} note={policy ? fill(e.policyNote, { date: formatDate(locale, policy.date) }) : undefined}>
        {policy ? `${formatNumber(locale, policy.value, 2)} %` : dash}
      </KpiCard>
    </KpiRow>
    {latest ? <RecordCard id="curve" title={e.curveTitle} lede={e.curveLede}>
      <YieldCurve locale={locale} latest={latest} prior={yields.monthAgo} />
      <p className={styles.note}>{e.curveSourceNote}</p>
    </RecordCard> : null}
    {latest ? <RecordCard id="par-yields" title={e.rateTable} meta={<span className="rp-pill">{fill(m.common.updated, { date: formatDate(locale, latest.date) })}</span>} flush>
      <DataTable label={e.rateTable} density="compact">
        <thead><tr>
          <th scope="col">{e.tenor}</th><th scope="col" className="num">{e.rate}</th>
          <th scope="col" className="num">{e.weekChange}</th><th scope="col" className="num">{e.monthChange}</th><th scope="col">{e.sourceCol}</th>
        </tr></thead>
        <tbody>{latest.points.map((point) => <tr key={point.tenor}>
          <th scope="row">{point.tenor}</th>
          <td className="num">{formatNumber(locale, point.rate, 2)} %</td>
          <td className="num">{basisPoints(locale, e.bp, point.rate, at(yields, "weekAgo", point.tenor)) ?? dash}</td>
          <td className="num">{basisPoints(locale, e.bp, point.rate, at(yields, "monthAgo", point.tenor)) ?? dash}</td>
          <td>{e.sources[point.source]}</td>
        </tr>)}</tbody>
      </DataTable>
    </RecordCard> : null}
    <div className={styles.grid2}>
      {real.latest ? <RecordCard id="real-yields" title={e.realTitle} meta={<span className="rp-pill">{formatDate(locale, real.latest.date)}</span>} flush>
        <DataTable label={e.realTitle} density="compact">
          <thead><tr><th scope="col">{e.tenor}</th><th scope="col" className="num">{e.rate}</th><th scope="col" className="num">{e.monthChange}</th></tr></thead>
          <tbody>{real.latest.points.map((point) => <tr key={point.tenor}>
            <th scope="row">{point.tenor}</th><td className="num">{formatNumber(locale, point.rate, 2)} %</td>
            <td className="num">{basisPoints(locale, e.bp, point.rate, at(real, "monthAgo", point.tenor)) ?? dash}</td>
          </tr>)}</tbody>
        </DataTable>
      </RecordCard> : null}
      {bills.latest ? <RecordCard id="bills" title={e.billTitle} meta={<span className="rp-pill">{formatDate(locale, bills.latest.date)}</span>} flush>
        <DataTable label={e.billTitle} density="compact">
          <thead><tr><th scope="col">{e.tenor}</th><th scope="col" className="num">{e.billRate}</th></tr></thead>
          <tbody>{bills.latest.points.map((point) => <tr key={point.tenor}>
            <th scope="row">{point.tenor}</th><td className="num">{formatNumber(locale, point.rate, 2)} %</td>
          </tr>)}</tbody>
        </DataTable>
      </RecordCard> : null}
      {long.latest ? <RecordCard id="long-term" title={e.longTitle} meta={<span className="rp-pill">{formatDate(locale, long.latest.date)}</span>} flush>
        <DataTable label={e.longTitle} density="compact">
          <thead><tr><th scope="col">{e.tenor}</th><th scope="col" className="num">{e.rate}</th></tr></thead>
          <tbody>{long.latest.points.map((point) => <tr key={point.tenor}>
            <th scope="row">{e.longTypes[point.tenor] ?? point.tenor}</th><td className="num">{formatNumber(locale, point.rate, 2)} %</td>
          </tr>)}</tbody>
        </DataTable>
      </RecordCard> : null}
    </div>
    <p className={styles.note}>{fill(m.common.source, { source: "Market data (US Treasury rates), US Treasury, FRED" })}</p>
  </>;
}

function EventTable({ locale, m, label, events }: { locale: Locale; m: FlowMessages; label: string; events: CalendarEvent[] }) {
  const e = m.economy, dash = m.common.dash;
  if (!events.length) return <p className="rp-empty">{m.common.noData}</p>;
  return <DataTable label={label} density="compact">
    <thead><tr>
      <th scope="col">{e.when}</th><th scope="col">{e.country}</th><th scope="col">{e.event}</th><th scope="col">{e.period}</th>
      <th scope="col" className="num">{e.actual}</th><th scope="col" className="num">{e.estimate}</th><th scope="col" className="num">{e.previous}</th>
    </tr></thead>
    <tbody>{events.map((event) => <tr key={event.key}>
      <td className={styles.when}><time dateTime={event.eventAt}>{formatUtcTime(locale, event.eventAt)}</time></td>
      <td><abbr title={countryName(locale, event.country)}>{event.country}</abbr></td>
      <th scope="row">{event.type}{event.comparison ? <span className={styles.muted}> ({event.comparison})</span> : null}</th>
      <td>{event.period ?? dash}</td>
      <td className="num">{figure(locale, event.actual, dash)}</td>
      <td className="num">{figure(locale, event.estimate, dash)}</td>
      <td className="num">{figure(locale, event.previous, dash)}</td>
    </tr>)}</tbody>
  </DataTable>;
}

async function Economy({ params, searchParams }: LocaleParams & { searchParams?: Promise<Search> }) {
  const locale = await resolveLocale(params);
  await assertViewable("eodhd");
  const m = getFlowMessages(locale);
  const e = m.economy;
  const query = await searchParams;
  const tab: Tab = TABS.find((item) => item === first(query?.tab)) ?? "rates";
  const rawCountry = first(query?.country)?.trim().toUpperCase();
  const country = rawCountry && /^[A-Z]{2}$/.test(rawCountry) ? rawCountry : undefined;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const href = (next: Tab) => `/${locale}/economy${next === "rates" ? "" : `?tab=${next}`}`;

  let body;
  if (tab === "rates") {
    const [yields, real, bills, long, policy] = await Promise.all([ustCurve("yield"), ustCurve("real-yield"), ustCurve("bill"), ustCurve("long-term"), fedFundsRate()]);
    body = <Rates locale={locale} m={m} yields={yields} real={real} bills={bills} long={long} policy={policy} />;
  } else if (tab === "calendar") {
    const ahead = new Date(now.getTime() + 14 * 86_400_000).toISOString(), back = new Date(now.getTime() - 7 * 86_400_000).toISOString();
    const [upcoming, recent, countries, official] = await Promise.all([
      economicCalendar({ from: now.toISOString(), to: ahead, country }), economicCalendar({ from: back, to: now.toISOString(), country, newestFirst: true }),
      eventCountries(), loadMacroEvents(getPool(), today),
    ]);
    body = <>
      <div className="rp-filter" role="search" aria-label={m.common.filters}>
        <form method="get" action={`/${locale}/economy`}>
          <input type="hidden" name="tab" value="calendar" />
          <label>
            <span>{e.countryFilter}</span>
            <select className={styles.select} name="country" defaultValue={country ?? ""}>
              <option value="">{m.common.all}</option>
              {countries.map((code) => <option key={code} value={code}>{countryName(locale, code)} ({code})</option>)}
            </select>
          </label>
          <button className="button" type="submit">{m.common.apply}</button>
          {country ? <Link className="button secondary" href={href("calendar")}>{m.common.reset}</Link> : null}
        </form>
      </div>
      <div className={styles.grid2}>
        <MacroEvents locale={locale} today={today} schedule={official} />
        <p className={styles.note}>{e.officialNote}</p>
      </div>
      <RecordCard id="upcoming" title={e.upcomingTitle} lede={e.upcomingLede} meta={<span className="rp-pill">{formatNumber(locale, upcoming.length)}</span>} flush={upcoming.length > 0}>
        <EventTable locale={locale} m={m} label={e.upcomingTitle} events={upcoming} />
      </RecordCard>
      <RecordCard id="recent" title={e.recentTitle} lede={e.recentLede} meta={<span className="rp-pill">{formatNumber(locale, recent.length)}</span>} flush={recent.length > 0}>
        <EventTable locale={locale} m={m} label={e.recentTitle} events={recent} />
      </RecordCard>
      <p className={styles.note}>{fill(m.common.source, { source: "Market data economic events" })}</p>
    </>;
  } else {
    const values = await latestIndicators();
    const indicators = [...new Set(values.map((value) => value.indicator))];
    const countries = [...new Set(values.map((value) => value.country))];
    const cell = new Map(values.map((value) => [`${value.country}|${value.indicator}`, value]));
    body = <RecordCard id="countries" title={e.countriesTitle} lede={e.countriesLede} flush={values.length > 0}>
      {values.length === 0 ? <p className="rp-empty">{m.common.noData}</p> : <DataTable label={e.countriesTitle} density="compact" stickyFirst>
        <thead><tr>
          <th scope="col">{e.country}</th>
          {indicators.map((indicator) => <th key={indicator} scope="col" className="num">{e.indicators[indicator] ?? indicator}</th>)}
        </tr></thead>
        <tbody>{countries.map((code) => <tr key={code}>
          <th scope="row">{countryName(locale, code, values.find((value) => value.country === code)?.countryName)}</th>
          {indicators.map((indicator) => {
            const value = cell.get(`${code}|${indicator}`);
            return <td key={indicator} className="num">{value ? <>{figure(locale, value.value, m.common.dash)} <span className={styles.muted}>({value.date.slice(0, 4)})</span></> : m.common.dash}</td>;
          })}
        </tr>)}</tbody>
      </DataTable>}
      <p className={styles.note}>{fill(m.common.source, { source: "Market data macro indicators (World Bank)" })}</p>
    </RecordCard>;
  }

  return <div className="frame page">
    <RecordHead title={e.title} lede={e.lede} meta={<Disclaimer text={getMessages(locale).common.disclaimer} />} />
    <div className="rp-stack">
      <nav className={`kit-tabs ${styles.tabs}`} aria-label={e.tabs.label}>
        {TABS.map((item) => <Link key={item} href={href(item)} aria-current={tab === item ? "page" : undefined}>{e.tabs[item]}</Link>)}
      </nav>
      {body}
    </div>
  </div>;
}

export default withPageLog("/economy", Economy);
