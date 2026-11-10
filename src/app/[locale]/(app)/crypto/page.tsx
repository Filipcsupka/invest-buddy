import type { Metadata } from "next";
import { pageMetadata } from "@/i18n/metadata";
import { withPageLog } from "@/app/page-log";
import { assertViewable } from "@/markets/gate";
import { assetSummaries } from "@/db/markets";
import { getMarketsMessages } from "@/i18n/markets-messages";
import { resolveLocale, type LocaleParams } from "@/app/[locale]/locale";
import { AssetListPage } from "../indices/_components/asset-pages";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const m = getMarketsMessages(locale);
  return { ...pageMetadata(locale, "/crypto", m.crypto.title, m.crypto.lede), robots: { index: false, follow: false } };
}
async function CryptoPage({ params }: LocaleParams) {
  const locale = await resolveLocale(params);
  await assertViewable("eodhd");
  const m = getMarketsMessages(locale);
  return <AssetListPage locale={locale} title={m.crypto.title} lede={m.crypto.lede} caption={m.crypto.table} basePath="crypto" rows={await assetSummaries("crypto")} />;
}
export default withPageLog("/crypto", CryptoPage);
