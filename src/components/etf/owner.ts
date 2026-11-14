import { cache } from "react";
import { marketsViewable } from "@/markets/gate";
import { canOpenFunds, getViewer } from "@/viewer/get-viewer";
import { notFound } from "next/navigation";

/** Non-throwing access check for stored ETF fund data (the ETF section of the market gate). */
export async function etfOwnerView(): Promise<boolean> {
  try { return marketsViewable(await getViewer(), process.env, "etf"); } catch { return false; }
}

/** ETF scores and the catalog: the owner, Active customers (Plus or trial) and Passive customers. Never a stock permission. */
export async function etfScoreView(): Promise<boolean> {
  try { return canOpenFunds(await getViewer()); } catch { return false; }
}

/** ETF screening and records are available to the owner, Active (Plus and trial) and Passive sessions. */
export const requireEtfScreeningAccess = cache(async (): Promise<void> => {
  if (!await etfScoreView()) notFound();
});
