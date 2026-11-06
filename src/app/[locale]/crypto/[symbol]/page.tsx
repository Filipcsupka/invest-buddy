import type { Metadata } from "next";
import { pageMetadata } from "@/i18n/metadata";
import { notFound } from "next/navigation";
import { withPageLog } from "@/app/page-log";
import { assertViewable } from "@/markets/gate";
import { assetDetail, vendorSymbolFor } from "@/db/markets";
import { getMarketsMessages } from "@/i18n/markets-messages";
import { resolveLocale } from "../../locale";
import { AssetDetailPage } from "../../indices/_components/asset-pages";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string; symbol: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMarketsMessages(locale);
  const code = (await params).symbol.toUpperCase();
  return { ...pageMetadata(locale, `/crypto/${encodeURIComponent(code)}`, `${code} · ${m.crypto.title}`, m.crypto.detailLede), robots: { index: false, follow: false } };
}
async function CoinPage({ params }: Props) {
  const locale = await resolveLocale(params);
  await assertViewable("eodhd");
  const vendor = vendorSymbolFor("crypto", (await params).symbol);
  const detail = vendor ? await assetDetail("crypto", vendor) : null;
  if (!vendor || !detail) notFound();
  return <AssetDetailPage locale={locale} assetClass="crypto" detail={detail} lede={getMarketsMessages(locale).crypto.detailLede} basePath="crypto" />;
}
export default withPageLog("/crypto/[symbol]", CoinPage);
