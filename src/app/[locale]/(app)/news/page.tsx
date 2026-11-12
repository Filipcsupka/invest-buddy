import type { Metadata } from "next";
import Link from "next/link";
import { withPageLog } from "@/app/page-log";
import { Disclaimer } from "@/components/disclaimer";
import { DataTable } from "@/components/kit";
import { RecordCard, RecordHead } from "@/components/record-parts";
import "@/components/record-pages.css";
import { newsFeed, topNewsTags } from "@/db/news";
import { fill, formatNumber, getMessages } from "@/i18n";
import { getFlowMessages } from "@/i18n/flow-messages";
import { pageMetadata } from "@/i18n/metadata";
import { assertViewable } from "@/markets/gate";
import { resolveLocale, type LocaleParams } from "@/app/[locale]/locale";
import { figure, formatUtcTime } from "../economy/format";
import styles from "../economy/flow.module.css";

export const dynamic = "force-dynamic";

type Search = { ticker?: string | string[]; tag?: string | string[] };
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const SHOWN_TICKERS = 4;

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getFlowMessages(locale).news;
  return { ...pageMetadata(locale, "/news", m.title, m.metaDescription), robots: { index: false, follow: false } };
}

async function News({ params, searchParams }: LocaleParams & { searchParams?: Promise<Search> }) {
  const locale = await resolveLocale(params);
  await assertViewable("eodhd");
  const m = getFlowMessages(locale);
  const n = m.news;
  const query = await searchParams;
  const rawTicker = first(query?.ticker)?.trim().toUpperCase().slice(0, 24);
  const ticker = rawTicker && /^[A-Z0-9][A-Z0-9.-]*$/.test(rawTicker) ? rawTicker : undefined;
  const rawTag = first(query?.tag)?.trim().toUpperCase().slice(0, 80);
  const tag = rawTag || undefined;
  const [items, tags] = await Promise.all([newsFeed({ ticker, tag }), topNewsTags()]);
  const href = (next: { ticker?: string; tag?: string }) => {
    const search = new URLSearchParams();
    if (next.ticker) search.set("ticker", next.ticker);
    if (next.tag) search.set("tag", next.tag);
    const text = search.toString();
    return `/${locale}/news${text ? `?${text}` : ""}`;
  };
  const tagOptions = tag && !tags.some((item) => item.tag === tag) ? [{ tag, count: 0 }, ...tags] : tags;
  return <div className="frame page">
    <RecordHead title={n.title} lede={n.lede} meta={<Disclaimer text={getMessages(locale).common.disclaimer} />} />
    <div className="rp-stack">
      <div className="rp-filter" role="search" aria-label={m.common.filters}>
        <form method="get" action={`/${locale}/news`}>
          <label>
            <span>{n.tickerLabel}</span>
            <input className="kit-input" type="search" name="ticker" defaultValue={ticker ?? ""} maxLength={24} autoComplete="off" spellCheck={false} />
          </label>
          {tag ? <input type="hidden" name="tag" value={tag} /> : null}
          <button className="button" type="submit">{m.common.apply}</button>
          {ticker || tag ? <Link className="button secondary" href={href({})}>{m.common.reset}</Link> : null}
        </form>
        {tagOptions.length ? <div className="rp-filter-codes">
          <span id="tag-filter">{n.tagsTitle}</span>
          <nav className="kit-tabs" aria-labelledby="tag-filter">
            <Link href={href({ ticker })} aria-current={tag ? undefined : "page"}>{m.common.all}</Link>
            {tagOptions.map((item) => <Link key={item.tag} href={href({ ticker, tag: item.tag })} aria-current={tag === item.tag ? "page" : undefined}>{item.tag.toLowerCase()}</Link>)}
          </nav>
        </div> : null}
      </div>
      <RecordCard id="news-feed" title={n.feedTitle} lede={n.feedNote} meta={<span className="rp-pill">{formatNumber(locale, items.length)}</span>} flush={items.length > 0}>
        {items.length === 0 ? <p className="rp-empty">{ticker || tag ? n.noMatch : m.common.noData}</p> : <DataTable label={n.feedTitle} density="compact">
          <thead><tr>
            <th scope="col">{n.published}</th><th scope="col">{n.headline}</th><th scope="col">{n.tickers}</th><th scope="col" className="num">{n.polarity}</th>
          </tr></thead>
          <tbody>{items.map((item) => <tr key={item.link}>
            <td className={styles.when}><time dateTime={item.publishedAt}>{formatUtcTime(locale, item.publishedAt)}</time></td>
            <th scope="row">
              <a className={styles.headline} href={item.link} target="_blank" rel="noopener noreferrer nofollow" aria-label={fill(n.opens, { title: item.title })}>{item.title}</a>
            </th>
            <td><span className={styles.chips}>
              {item.symbols.slice(0, SHOWN_TICKERS).map((symbol) => <Link key={symbol} className={styles.chip} href={href({ ticker: symbol, tag })}>{symbol}</Link>)}
              {item.symbols.length > SHOWN_TICKERS ? <span className={styles.chip} title={item.symbols.slice(SHOWN_TICKERS).join(", ")}>{fill(n.more, { n: item.symbols.length - SHOWN_TICKERS })}</span> : null}
            </span></td>
            <td className="num">{figure(locale, item.polarity, m.common.dash)}</td>
          </tr>)}</tbody>
        </DataTable>}
        <p className={styles.note}>{n.polarityNote} {fill(m.common.source, { source: "Market data financial news" })}</p>
      </RecordCard>
    </div>
  </div>;
}

export default withPageLog("/news", News);
