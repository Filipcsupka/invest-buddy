import type { Metadata } from "next";
import { pageMetadata } from "@/i18n/metadata";
import { withPageLog } from "@/app/page-log";
import { assertViewable } from "@/markets/gate";
import { assetSummaries } from "@/db/markets";
import { getMarketsMessages } from "@/i18n/markets-messages";
import { resolveLocale, type LocaleParams } from "@/app/[locale]/locale";
import { AssetListPage } from "./_components/asset-pages";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMarketsMessages(locale);
  return { ...pageMetadata(locale, "/indices", m.indices.title, m.indices.lede), robots: { index: false, follow: false } };
}
async function IndicesPage({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  await assertViewable("eodhd", "indices");
  const m = getMarketsMessages(locale);
  return <AssetListPage locale={locale} title={m.indices.title} lede={m.indices.lede} caption={m.indices.table} basePath="indices" rows={await assetSummaries("index")} />;
}
export default withPageLog("/indices", IndicesPage);
