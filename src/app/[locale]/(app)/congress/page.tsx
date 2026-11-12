import type { Metadata } from "next";
import Link from "next/link";
import { withPageLog } from "@/app/page-log";
import { Disclaimer } from "@/components/disclaimer";
import { KpiCard, KpiRow, RecordCard, RecordHead } from "@/components/record-parts";
import "@/components/record-pages.css";
import { congressStats, congressTrades, type Chamber } from "@/db/congress";
import { fill, formatDate, formatNumber, getMessages } from "@/i18n";
import { getFlowMessages } from "@/i18n/flow-messages";
import { pageMetadata } from "@/i18n/metadata";
import { assertViewable } from "@/markets/gate";
import { resolveLocale, type LocaleParams } from "@/app/[locale]/locale";
import { CongressTable } from "./congress-table";
import styles from "../economy/flow.module.css";

export const dynamic = "force-dynamic";

type Search = { ticker?: string | string[]; member?: string | string[]; chamber?: string | string[] };
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const CHAMBERS: readonly Chamber[] = ["house", "senate"];

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getFlowMessages(locale).congress;
  return { ...pageMetadata(locale, "/congress", m.title, m.metaDescription), robots: { index: false, follow: false } };
}

async function Congress({ params, searchParams }: LocaleParams & { searchParams?: Promise<Search> }) {
  const locale = await resolveLocale(params);
  await assertViewable("eodhd");
  const m = getFlowMessages(locale);
  const c = m.congress;
  const query = await searchParams;
  const rawTicker = first(query?.ticker)?.trim().toUpperCase().slice(0, 12);
  const ticker = rawTicker && /^[A-Z0-9][A-Z0-9.-]*$/.test(rawTicker) ? rawTicker : undefined;
  const member = first(query?.member)?.trim().slice(0, 60) || undefined;
  const chamber = CHAMBERS.find((item) => item === first(query?.chamber)?.trim().toLowerCase());
  const [trades, stats] = await Promise.all([congressTrades({ ticker, member, chamber }), congressStats()]);
  const href = (next: { chamber?: Chamber }) => {
    const search = new URLSearchParams();
    if (member) search.set("member", member);
    if (ticker) search.set("ticker", ticker);
    if (next.chamber) search.set("chamber", next.chamber);
    const text = search.toString();
    return `/${locale}/congress${text ? `?${text}` : ""}`;
  };
  const filtered = Boolean(ticker || member || chamber);
  return <div className="frame page">
    <RecordHead title={c.title} lede={c.lede} meta={<Disclaimer text={getMessages(locale).common.disclaimer} />} />
    <p className="notice">{m.common.ownerNote}</p>
    <KpiRow count={4}>
      <KpiCard featured label={c.kpiTrades} note={stats.latest ? fill(m.common.updated, { date: formatDate(locale, stats.latest) }) : undefined}>{formatNumber(locale, stats.trades)}</KpiCard>
      <KpiCard label={c.kpiMembers}>{formatNumber(locale, stats.members)}</KpiCard>
      <KpiCard label={c.kpiPurchases}>{formatNumber(locale, stats.purchases)}</KpiCard>
      <KpiCard label={c.kpiSales}>{formatNumber(locale, stats.sales)}</KpiCard>
    </KpiRow>
    <div className="rp-stack">
      <div className="rp-filter" role="search" aria-label={m.common.filters}>
        <form method="get" action={`/${locale}/congress`}>
          <label>
            <span>{c.memberLabel}</span>
            <input className={`kit-input ${styles.memberInput}`} type="search" name="member" defaultValue={member ?? ""} maxLength={60} autoComplete="off" spellCheck={false} />
          </label>
          <label>
            <span>{c.tickerLabel}</span>
            <input className="kit-input" type="search" name="ticker" defaultValue={ticker ?? ""} maxLength={12} autoComplete="off" spellCheck={false} />
          </label>
          {chamber ? <input type="hidden" name="chamber" value={chamber} /> : null}
          <button className="button" type="submit">{m.common.apply}</button>
          {filtered ? <Link className="button secondary" href={`/${locale}/congress`}>{m.common.reset}</Link> : null}
        </form>
        <div className="rp-filter-codes">
          <span id="chamber-filter">{c.chamberLabel}</span>
          <nav className="kit-tabs" aria-labelledby="chamber-filter">
            <Link href={href({})} aria-current={chamber ? undefined : "page"}>{m.common.all}</Link>
            {CHAMBERS.map((item) => <Link key={item} href={href({ chamber: item })} aria-current={chamber === item ? "page" : undefined}>{c.chambers[item]}</Link>)}
          </nav>
        </div>
      </div>
      <RecordCard id="congress-feed" title={c.tableTitle} lede={c.tableNote} meta={<span className="rp-pill">{formatNumber(locale, trades.length)}</span>} flush={trades.length > 0}>
        {trades.length === 0 ? <p className="rp-empty">{filtered ? c.noMatch : m.common.noData}</p> : <CongressTable locale={locale} trades={trades} label={c.tableTitle} />}
        <p className={styles.note}>{c.lateNote} {fill(m.common.source, { source: "Market data congressional trades (House and Senate periodic transaction reports)" })}</p>
      </RecordCard>
    </div>
  </div>;
}

export default withPageLog("/congress", Congress);
