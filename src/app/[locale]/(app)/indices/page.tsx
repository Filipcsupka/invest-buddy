import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/i18n/metadata";
import { withPageLog } from "@/app/page-log";
import { assertViewable } from "@/markets/gate";
import { assetSummaries, indexRatingReadModel } from "@/db/markets";
import { rateIndex } from "@/markets/index-rating";
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
  const summaries = await assetSummaries("index");
  const rows: IndexListRow[] = [];
  // Keep the database work bounded: the read model joins member facts and price history per index.
  for (let i = 0; i < summaries.length; i += 3) {
    const batch = await Promise.all(summaries.slice(i, i + 3).map(async (summary) => {
      const model = await indexRatingReadModel(summary.symbol);
      const result = model?.inputs ? rateIndex(model.inputs) : null;
      return { summary, price: model?.analytics.price ?? null,
        rating: result ? { kind: result.kind, band: result.band, score: result.score, basisText: result.basisText,
          coveragePct: result.coveragePct, asOf: result.asOf, regime: result.volatilityRegime?.label ?? null } : null,
        region: indexRegion(summary.code, model?.snapshot?.country ?? null) };
    }));
    rows.push(...batch);
  }
  return <div className="frame page"><RecordHead area={<AreaChip locale={locale} area="indices" />} title={m.title} lede={m.lede} actions={<Link className="button secondary" href="#index-rating">{m.methodology}</Link>} />
    <div className={s.stack}><OperatorDisclosure text={getMessages(locale).common.operatorDisclosure} /><IndexList locale={locale} rows={rows} />
      <section id="index-rating" className={s.method} aria-labelledby="index-method-title"><h2 id="index-method-title">{m.methodology}</h2><p>{m.methodologyIntro}</p><p>{m.methodologyBasis}</p><p>{m.methodologyBands}</p></section>
      <p className={s.note}>{m.source}</p></div></div>;
}
export default withPageLog("/indices", IndicesPage);
