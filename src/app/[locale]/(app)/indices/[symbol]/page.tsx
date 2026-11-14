import type { Metadata } from "next";
import { pageMetadata } from "@/i18n/metadata";
import { notFound } from "next/navigation";
import { withPageLog } from "@/app/page-log";
import { assertViewable } from "@/markets/gate";
import { assetDetail, indexComponentFacts, indexComponents, indexRatingReadModel, vendorSymbolFor } from "@/db/markets";
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
  const vix = model.analytics.isVolatilityIndex;
  const components = vix ? { asOf: null, rows: [] } : stockStatesVisible && model.analytics.asOf
    ? await indexComponentFacts(vendor, model.analytics.asOf)
    : await indexComponents(vendor);
  return <IndexDetail locale={locale} summary={detail.summary} analytics={model.analytics} rating={rating} bars={model.bars}
    components={components.rows.map((row) => ({ ...row, vendorSymbol: row.exchange ? `${row.code}.${row.exchange}` : null, ticker: "ticker" in row && typeof row.ticker === "string" ? row.ticker : null }))}
    componentsAsOf={components.asOf} stockStatesVisible={stockStatesVisible} />;
}
export default withPageLog("/indices/[symbol]", IndexPage);
