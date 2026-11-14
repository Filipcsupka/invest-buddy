import type { Metadata } from "next";
import { pageMetadata } from "@/i18n/metadata";
import { notFound } from "next/navigation";
import { withPageLog } from "@/app/page-log";
import { assertViewable } from "@/markets/gate";
import { assetDetail, INDEX_COMPONENTS_SHOWN, indexRatingReadModel, vendorSymbolFor } from "@/db/markets";
import { rateIndex } from "@/markets/index-rating";
import { indexMessages } from "@/i18n/index-messages";
import { canSeeStockData, getViewer } from "@/viewer/get-viewer";
import { resolveLocale } from "@/app/[locale]/locale";
import { IndexDetail } from "../_components/index-detail";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string; symbol: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = indexMessages(locale);
  const code = (await params).symbol.toUpperCase();
  return { ...pageMetadata(locale, `/indices/${encodeURIComponent(code)}`, `${code} · ${m.title}`, m.detailLede), robots: { index: false, follow: false } };
}
async function IndexPage({ params }: Props) {
  const locale = await resolveLocale(params);
  await assertViewable("eodhd", "indices");
  const vendor = vendorSymbolFor("index", (await params).symbol);
  if (!vendor) notFound();
  const [detail, model, viewer] = await Promise.all([assetDetail("index", vendor), indexRatingReadModel(vendor), getViewer()]);
  if (!detail || !model) notFound();
  const rating = model.inputs ? rateIndex(model.inputs) : null;
  const stockStatesVisible = canSeeStockData(viewer);
  // The read model already holds the whole constituent list with member facts: one read, one cap rule for every viewer.
  const list = model.analytics.isVolatilityIndex ? { asOf: null, rows: [] } : model.components;
  const components = list.rows.slice(0, INDEX_COMPONENTS_SHOWN)
    .map((row) => stockStatesVisible ? row : { ...row, state: null, stateAsOf: null, barDate: null, close: null, ma50: null, ma200: null });
  return <IndexDetail locale={locale} summary={detail.summary} analytics={stockStatesVisible ? model.analytics : { ...model.analytics, scores: null }} rating={rating} bars={model.bars}
    components={components} componentsTotal={list.rows.length} componentsAsOf={list.asOf} stockStatesVisible={stockStatesVisible} />;
}
export default withPageLog("/indices/[symbol]", IndexPage);
