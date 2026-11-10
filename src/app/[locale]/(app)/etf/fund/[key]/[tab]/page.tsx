import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withPageLog } from "@/app/page-log";
import { assertViewable } from "@/markets/gate";
import { etfCatalogDetail } from "@/db/etf-catalog";
import { etfDetailView } from "@/db/etf-detail";
import { getEtfDetailMessages, getEtfMessages } from "@/i18n/etf-messages";
import { pageMetadata } from "@/i18n/metadata";
import { RecordHead } from "@/components/record-parts";
import { DividendsPanel, EtfTabNav, ExposurePanel, HoldingsPanel, OverviewPanel, PerformancePanel } from "@/components/etf/detail";
import { isEtfTab } from "@/components/etf/tabs";
import s from "@/components/etf/etf.module.css";
import { resolveLocale } from "@/app/[locale]/locale";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string; key: string; tab: string }> };
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
async function EtfFundTabPage({ params }: Props) {
  await assertViewable("eodhd");
  const locale = await resolveLocale(params);
  const { key: rawKey, tab } = await params;
  const key = decodedKey(rawKey);
  if (!validKey(key) || !isEtfTab(tab)) notFound();
  const result = await etfCatalogDetail(key.toUpperCase());
  if (!result) notFound();
  const { fund } = result;
  const view = await etfDetailView(fund.listingKey, { holdingsLimit: tab === "holdings" ? 500 : 10, barDays: tab === "overview" ? 400 : 1 });
  const m = getEtfDetailMessages(locale), e = getEtfMessages(locale);
  return <div className="frame page">
    <RecordHead title={fund.name} lede={m.vendorLede} stamp={<span className="stamp">{m.ownerOnly}</span>}
      actions={<Link className="button secondary" href={`/${locale}/etf/fund/${encodeURIComponent(fund.listingKey)}`}>{e.fundDetails}</Link>} />
    <EtfTabNav locale={locale} listingKey={fund.listingKey} active={tab} />
    <div className={s.stack}>
      {tab === "overview" ? <OverviewPanel locale={locale} fund={fund} view={view} />
        : tab === "holdings" ? <HoldingsPanel locale={locale} view={view} />
        : tab === "exposure" ? <ExposurePanel locale={locale} view={view} />
        : tab === "performance" ? <PerformancePanel locale={locale} view={view} />
        : <DividendsPanel locale={locale} view={view} />}
    </div>
  </div>;
}
export default withPageLog("/etf/fund/[key]/[tab]", EtfFundTabPage);
