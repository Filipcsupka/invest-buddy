import type { Metadata } from "next";
import { pageMetadata } from "@/i18n/metadata";
import { notFound } from "next/navigation";
import { withPageLog } from "@/app/page-log";
import { assertViewable } from "@/markets/gate";
import { assetDetail, vendorSymbolFor } from "@/db/markets";
import { getMarketsMessages } from "@/i18n/markets-messages";
import { resolveLocale } from "@/app/[locale]/locale";
import { AssetDetailPage } from "../../indices/_components/asset-pages";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string; pair: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMarketsMessages(locale);
  const code = (await params).pair.toUpperCase();
  return { ...pageMetadata(locale, `/forex/${encodeURIComponent(code)}`, `${code} · ${m.forex.title}`, m.forex.detailLede), robots: { index: false, follow: false } };
}
async function PairPage({ params }: Props) {
  const locale = await resolveLocale(params);
  await assertViewable("eodhd");
  const vendor = vendorSymbolFor("fx", (await params).pair);
  const detail = vendor ? await assetDetail("fx", vendor) : null;
  if (!vendor || !detail) notFound();
  return <AssetDetailPage locale={locale} assetClass="fx" detail={detail} lede={getMarketsMessages(locale).forex.detailLede} basePath="forex" />;
}
export default withPageLog("/forex/[pair]", PairPage);
