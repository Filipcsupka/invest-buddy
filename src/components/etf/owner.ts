import { marketsViewable } from "@/markets/gate";
import { getViewer } from "@/viewer/get-viewer";

/** Non-throwing owner check for the public ETF pages: vendor sections render only for the authenticated owner. */
export async function etfOwnerView(): Promise<boolean> {
  try { return marketsViewable(await getViewer()); } catch { return false; }
}
