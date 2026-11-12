import { marketsViewable } from "@/markets/gate";
import { getViewer, canUseVendorData } from "@/viewer/get-viewer";
import { getPool } from "@/db/pool";
import { notFound } from "next/navigation";

/** Non-throwing owner check for the public ETF pages: vendor sections render only for the authenticated owner. */
export async function etfOwnerView(): Promise<boolean> {
  try { return marketsViewable(await getViewer()); } catch { return false; }
}

/** Score and catalog data use the existing paid vendor-data permission. */
export async function etfScoreView(): Promise<boolean> {
  try { return canUseVendorData(await getViewer()); } catch { return false; }
}

/** Keep private ETF data out of the free route when vendor enrichment is present. */
export async function requireEtfScreeningAccess(): Promise<void> {
  if (process.env.DATA_MODE === "fixture") return;
  const db = getPool();
  const privateMode = process.env.EODHD_PRIVATE_USE === "on";
  const vendor = db ? (await db.query<{ present: boolean }>("SELECT EXISTS (SELECT 1 FROM etf_catalog WHERE enrichment_source='eodhd') AS present")).rows[0]?.present : false;
  if ((privateMode || vendor) && !await etfScoreView()) notFound();
}
