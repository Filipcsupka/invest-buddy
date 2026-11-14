import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/i18n/metadata";
import { withPageLog } from "@/app/page-log";
import { assertViewable } from "@/markets/gate";
import { assetSummaries } from "@/db/markets";
import { indexListEntries, indexListStamp } from "@/data/index-list";
import { indexMessages } from "@/i18n/index-messages";
import { getMessages } from "@/i18n";
import { resolveLocale, type LocaleParams } from "@/app/[locale]/locale";
import { AreaChip } from "@/components/kit";
import { RecordHead } from "@/components/record-parts";
import { OperatorDisclosure } from "@/components/operator-disclosure";
import { IndexList, indexRegion, type IndexListRow } from "./_components/index-list";
import s from "./_components/index-pages.module.css";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = indexMessages(locale);
  return { ...pageMetadata(locale, "/indices", m.title, m.lede), robots: { index: false, follow: false } };
}
async function IndicesPage({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  await assertViewable("eodhd", "indices");
  const m = indexMessages(locale);
  const [summaries, stamp] = await Promise.all([assetSummaries("index"), indexListStamp()]);
  // One batched, cached read for every index: a fixed handful of queries on a miss, nothing more on a hit.
  const entries = new Map((await indexListEntries(summaries.map((row) => row.symbol), `${stamp}|${summaries.map((row) => row.lastDate ?? "").join(",")}`))
    .map((entry) => [entry.symbol, entry]));
  const rows: IndexListRow[] = summaries.map((summary) => {
    const entry = entries.get(summary.symbol);
    return { summary, price: entry?.price ?? null, rating: entry?.rating ?? null, region: indexRegion(summary.code, entry?.country ?? null) };
  });
  return <div className="frame page"><RecordHead area={<AreaChip locale={locale} area="indices" />} title={m.title} lede={m.lede} actions={<Link className="button secondary" href="#index-rating">{m.methodology}</Link>} />
    <div className={s.stack}><OperatorDisclosure text={getMessages(locale).common.operatorDisclosure} /><IndexList locale={locale} rows={rows} />
      <section id="index-rating" className={s.method} aria-labelledby="index-method-title"><h2 id="index-method-title">{m.methodology}</h2><p>{m.methodologyIntro}</p><p>{m.methodologyBasis}</p><p>{m.methodologyBands}</p></section>
      <p className={s.note}>{m.source}</p></div></div>;
}
export default withPageLog("/indices", IndicesPage);
