import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withPageLog } from "@/app/page-log";
import { assertViewable } from "@/markets/gate";
import { requireEtfScreeningAccess } from "@/components/etf/owner";
import { etfCatalogDetail } from "@/db/etf-catalog";
import { readEtfFundView } from "@/db/etf-view";
import { getEtfDetailMessages, getEtfMessages } from "@/i18n/etf-messages";
import { pageMetadata } from "@/i18n/metadata";
import { RecordHead } from "@/components/record-parts";
import { AreaChip } from "@/components/kit";
import { EtfTabNav, FundDividends, FundExposure, FundHoldings, FundOverview, FundPerformance } from "@/components/etf/detail";
import { isEtfTab } from "@/components/etf/tabs";
import s from "@/components/etf/etf.module.css";
import { resolveLocale } from "@/app/[locale]/locale";
import { AdrLine } from "@/components/disclaimer";
import { getEtfFundMessages } from "@/i18n/etf-fund-messages";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string; key: string; tab: string }>; searchParams?: Promise<{ page?: string }> };
const validKey = (key: string) => /^[A-Za-z0-9:._-]{1,80}$/.test(key);
const decodedKey = (key: string) => {
  try { return decodeURIComponent(key); } catch { return ""; }
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const { key: rawKey, tab } = await params;
  const key = decodedKey(rawKey);
  const m = getEtfDetailMessages(locale);
  const path = `/etf/fund/${encodeURIComponent(key)}/${encodeURIComponent(tab)}`;
  return { ...pageMetadata(locale, path, isEtfTab(tab) ? m[tab] : m.vendorData, m.vendorLede), robots: { index: false, follow: false } };
}

/** Owner-only vendor fund data, rendered from stored rows. Facts only: no calls, scores or states. */
async function EtfFundTabPage({ params, searchParams }: Props) {
  // The market gate for the ETF section, then the paid fund permission: a licensed free account never opens fund tabs.
  await assertViewable("eodhd", "etf");
  await requireEtfScreeningAccess();
  const locale = await resolveLocale(params);
  const { key: rawKey, tab } = await params;
  const key = decodedKey(rawKey);
  if (!validKey(key) || !isEtfTab(tab)) notFound();
  const result = await etfCatalogDetail(key.toUpperCase());
  if (!result) notFound();
  const { fund } = result;
  const rawPage = tab === "holdings" ? (await searchParams)?.page : undefined;
  const holdingsPage = rawPage && /^[1-9]\d{0,2}$/.test(rawPage) ? Number(rawPage) : 1;
  const view = await readEtfFundView(fund, tab, undefined, holdingsPage);
  if (tab === "holdings" && holdingsPage > Math.max(1, Math.ceil(view.holdingsTotal / 50))) notFound();
  const m = getEtfDetailMessages(locale), e = getEtfMessages(locale);
  const fm = getEtfFundMessages(locale);
  return <div className="frame page">
    <RecordHead area={<AreaChip locale={locale} area="etf" />} title={fund.name} lede={m.vendorLede} stamp={<span className="stamp">{m.ownerOnly}</span>}
      actions={<><Link className="button secondary" href={`/${locale}/etf/fund/${encodeURIComponent(fund.listingKey)}`}>{e.fundDetails}</Link><Link className="button secondary" href={`/${locale}/methodology`}>{fm.methodology}</Link></>} />
    <EtfTabNav locale={locale} listingKey={fund.listingKey} active={tab} />
    <div className={s.stack}>
      {tab === "overview" ? <FundOverview locale={locale} fund={fund} view={view} />
        : tab === "holdings" ? <FundHoldings locale={locale} view={view} listingKey={fund.listingKey} />
        : tab === "exposure" ? <FundExposure locale={locale} view={view} />
        : tab === "performance" ? <FundPerformance locale={locale} view={view} />
        : <FundDividends locale={locale} view={view} />}
    </div>
    <AdrLine text={fm.informational} />
  </div>;
}
export default withPageLog("/etf/fund/[key]/[tab]", EtfFundTabPage);
