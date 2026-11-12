import { cache } from "react";
import { marketsViewable } from "@/markets/gate";
import { getViewer, canUseVendorData, isOwner } from "@/viewer/get-viewer";
import { notFound } from "next/navigation";

/** Non-throwing access check for stored ETF fund data. */
export async function etfOwnerView(): Promise<boolean> {
  try { return marketsViewable(await getViewer()); } catch { return false; }
}

/** Score and catalog data use the existing paid vendor-data permission. */
export async function etfScoreView(): Promise<boolean> {
  try { const viewer = await getViewer(); return !viewer.preview && canUseVendorData(viewer) && (isOwner(viewer) || viewer.plan === "plus" || viewer.plan === "trial"); } catch { return false; }
}

/** ETF screening and records are available to owner, Plus, and active trial sessions. */
export const requireEtfScreeningAccess = cache(async (): Promise<void> => {
  if (!await etfScoreView()) notFound();
});
