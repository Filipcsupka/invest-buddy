import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { withPageLog } from "@/app/page-log";
import { Disclaimer } from "@/components/disclaimer";
import Link from "next/link";
import { KpiCard, KpiRow, RecordCard, RecordHead } from "@/components/record-parts";
import { getRecordPagesMessages } from "@/i18n/record-pages-messages";
import "@/components/record-pages.css";
import { InsiderPanel } from "@/components/insider-panel";
import { PaywallSegment } from "@/components/paywall-segment";
import { flags } from "@/config/flags";
import { getViewer, limitFor } from "@/viewer/get-viewer";
import { withinDays } from "./depth";
import { insiderEvents } from "@/db/insiders";
import { formatNumber, getMessages } from "@/i18n";
import { pageMetadata } from "@/i18n/metadata";
import { resolveLocale, type LocaleParams } from "../locale";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMessages(locale);
  return { ...pageMetadata(locale, "/insiders", m.meta.insidersTitle, m.meta.insidersDescription), robots: { index: flags().INSIDERS_PAGE, follow: flags().INSIDERS_PAGE } };
}

const CODES = ["P", "S", "A", "M", "F"] as const;

async function Insiders({ params, searchParams }: LocaleParams & { searchParams?: Promise<{ ticker?: string | string[]; code?: string | string[] }> }) {
  const locale = await resolveLocale(params);
  if (!flags().INSIDERS_PAGE) notFound();
  const m = getMessages(locale);
  const rp = getRecordPagesMessages(locale).insiders;
  const query = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const ticker = first(query?.ticker)?.trim().toUpperCase().slice(0, 12);
  const rawCode = first(query?.code)?.trim().toUpperCase();
  const code = CODES.find((item) => item === rawCode);
  const viewer = await getViewer();
  const all = withinDays(await insiderEvents(ticker || undefined), limitFor(viewer, "insiderDays"));
  const events = code ? all.filter((event) => event.code === code) : all;
  const href = (next?: string) => {
    const params = new URLSearchParams();
    if (ticker) params.set("ticker", ticker);
    if (next) params.set("code", next);
    const text = params.toString();
    return `/${locale}/insiders${text ? `?${text}` : ""}`;
  };
  const companies = new Set(all.map((event) => event.ticker)).size;
  return <div className="frame page">
    <RecordHead title={m.insiders.title} lede={m.insiders.lede} meta={<Disclaimer text={m.common.disclaimer} />} />
    <p className="notice">{m.insiders.note}</p>
    <KpiRow count={4}>
      <KpiCard featured label={rp.filings}>{formatNumber(locale, all.length)}</KpiCard>
      <KpiCard label={rp.companies}>{formatNumber(locale, companies)}</KpiCard>
      <KpiCard label={rp.purchases}>{formatNumber(locale, all.filter((event) => event.code === "P").length)}</KpiCard>
      <KpiCard label={rp.sales}>{formatNumber(locale, all.filter((event) => event.code === "S").length)}</KpiCard>
    </KpiRow>
    <div className="rp-stack">
      <div className="rp-filter" role="search" aria-label={rp.filterTitle}>
        <form method="get" action={`/${locale}/insiders`}>
          <label>
            <span>{rp.tickerLabel}</span>
            <input className="kit-input" type="search" name="ticker" defaultValue={ticker ?? ""} maxLength={12} autoComplete="off" spellCheck={false} />
          </label>
          {code ? <input type="hidden" name="code" value={code} /> : null}
          <button className="button" type="submit">{rp.apply}</button>
          {ticker || code ? <Link className="button secondary" href={`/${locale}/insiders`}>{rp.reset}</Link> : null}
        </form>
        <div className="rp-filter-codes">
          <span id="code-filter">{rp.codeLabel}</span>
          <nav className="kit-tabs" aria-labelledby="code-filter">
            <Link href={href()} aria-current={code ? undefined : "page"}>{rp.allCodes}</Link>
            {CODES.map((item) => <Link key={item} href={href(item)} aria-current={code === item ? "page" : undefined} title={m.insiders.codes[item]}>{item}</Link>)}
          </nav>
        </div>
      </div>
      <PaywallSegment id="insiders-history" viewer={viewer} locale={locale}>
        <RecordCard id="insiders-feed" title={m.insiders.title} lede={rp.tableNote} meta={<span className="rp-pill">{formatNumber(locale, events.length)}</span>} flush={events.length > 0}>
          {events.length === 0 && all.length > 0 ? <p className="rp-empty">{rp.noMatch}</p> : <InsiderPanel locale={locale} events={events} />}
        </RecordCard>
      </PaywallSegment>
      <RecordCard id="form4-codes" title={m.insiders.codesTitle} className="insider-codes">
        <dl className="rp-codes">
          {Object.entries(m.insiders.codes).map(([item, description]) => <div key={item}><dt>{item}</dt><dd>{description.replace(/^[A-Z]:\s*/, "")}</dd></div>)}
        </dl>
      </RecordCard>
    </div>
  </div>;
}

export default withPageLog("/insiders", Insiders);
