import { notFound } from "next/navigation";
import { getPool } from "@/db/pool";
import { getViewer, isOwner } from "@/viewer/get-viewer";
import { etfScoreView } from "@/components/etf/owner";

/** Public ETF pages cannot render catalog or pick data once EODHD enrichment is present. */
export async function requireEtfDataAccess() {
  if (!await etfScoreView()) notFound();
}

/** A ticker's vendor bars and private score inputs stay behind the owner session. */
export async function requireCompanyDataAccess(ticker: string) {
  const db = getPool();
  const privateMode = process.env.EODHD_PRIVATE_USE === "on";
  const vendor = db ? (await db.query<{ present: boolean }>(`SELECT (
    EXISTS (SELECT 1 FROM daily_bars WHERE ticker=$1 AND source_id='eodhd') OR
    EXISTS (SELECT 1 FROM fundamentals_pit WHERE ticker=$1 AND source_id='eodhd') OR
    EXISTS (SELECT 1 FROM eps_history WHERE ticker=$1 AND source_id='eodhd') OR
    EXISTS (SELECT 1 FROM collected_facts WHERE symbol=$1 AND source_id='eodhd') OR
    EXISTS (SELECT 1 FROM insider_transactions WHERE ticker=$1 AND source_id='eodhd')
  ) AS present`, [ticker])).rows[0]?.present : false;
  if ((privateMode || vendor) && !isOwner(await getViewer())) notFound();
}
