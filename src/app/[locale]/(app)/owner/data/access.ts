import { notFound } from "next/navigation";
import { canSeeStockData, getViewer } from "@/viewer/get-viewer";
import { etfScoreView } from "@/components/etf/owner";

/** Public ETF pages cannot render catalog or pick data once EODHD enrichment is present. */
export async function requireEtfDataAccess() {
  if (!await etfScoreView()) notFound();
}

/**
 * Stock pages (stocks, company, heatmap, portfolio, track record, insiders) render stored scores and vendor data: the owner and an
 * Active plan only (canSeeStockData), whatever EODHD_PRIVATE_USE and VENDOR_DISPLAY_LICENSE say. The proxy checks the same rule first;
 * this page-level check keeps a page safe if it is ever reached another way.
 */
export async function requireStockData() {
  if (!canSeeStockData(await getViewer())) notFound();
}

/** A ticker's vendor bars and private score inputs: the stock rule above. */
export async function requireCompanyDataAccess(_ticker: string) {
  void _ticker;
  await requireStockData();
}
