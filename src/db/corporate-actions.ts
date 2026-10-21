import type pg from "pg";
import type { CorporateAction } from "../data/corporate-actions";
import type { RevisedBar } from "../data/corporate-actions";

/** Inserts actions and lets a vendor-confirmed split replace an earlier heuristic for the same event. */
export async function insertCorporateActions(db: Pick<pg.Pool, "query">, rows: CorporateAction[]): Promise<number> {
  if (!rows.length) return 0;
  const result = await db.query(`INSERT INTO corporate_actions (ticker,action_date,kind,ratio,amount,source_id,detected_by,detail)
    SELECT t,d,k,r,a,s,b,x::jsonb FROM unnest($1::text[],$2::date[],$3::text[],$4::numeric[],$5::numeric[],$6::text[],$7::text[],$8::text[]) AS v(t,d,k,r,a,s,b,x)
    ON CONFLICT (ticker,action_date,kind) DO UPDATE SET ratio=EXCLUDED.ratio,amount=EXCLUDED.amount,source_id=EXCLUDED.source_id,
      detected_by=EXCLUDED.detected_by,detail=EXCLUDED.detail,observed_at=now()
    WHERE EXCLUDED.detected_by='vendor' AND corporate_actions.detected_by='heuristic'`,
    [rows.map((r) => r.ticker), rows.map((r) => r.actionDate), rows.map((r) => r.kind), rows.map((r) => r.ratio), rows.map((r) => r.amount),
      rows.map((r) => r.sourceId), rows.map((r) => r.detectedBy), rows.map((r) => JSON.stringify(r.detail))]);
  return result.rowCount ?? 0;
}

/** In-memory twin for tests. */
export function insertMemoryCorporateActions(store: CorporateAction[], rows: CorporateAction[]): number {
  let written = 0;
  for (const row of rows) {
    const existing = store.findIndex((s) => s.ticker === row.ticker && s.actionDate === row.actionDate && s.kind === row.kind);
    if (existing >= 0) {
      if (row.detectedBy === "vendor" && store[existing].detectedBy === "heuristic") { store[existing] = { ...row }; written++; }
      continue;
    }
    store.push({ ...row }); written++;
  }
  return written;
}

/** Superseded closes of the last `days` days next to the stored close of the same bar, per ticker. */
export async function loadRevisedBars(db: Pick<pg.Pool, "query">, days: number): Promise<Map<string, RevisedBar[]>> {
  const res = await db.query<{ ticker: string; bar_date: string; old_close: string; new_close: string }>(
    `SELECT r.ticker, r.bar_date::text AS bar_date, r.close AS old_close, b.close AS new_close
     FROM (SELECT DISTINCT ON (ticker, bar_date) ticker, bar_date, close, source_id FROM daily_bar_revisions
           WHERE kind='superseded' AND observed_at >= now() - make_interval(days => $1::int) ORDER BY ticker, bar_date, observed_at DESC) r
     JOIN daily_bars b ON b.ticker=r.ticker AND b.bar_date=r.bar_date AND b.source_id=r.source_id ORDER BY r.ticker, r.bar_date`, [days]);
  const out = new Map<string, RevisedBar[]>();
  for (const r of res.rows) (out.get(r.ticker) ?? out.set(r.ticker, []).get(r.ticker)!).push({ barDate: r.bar_date, oldClose: Number(r.old_close), newClose: Number(r.new_close) });
  return out;
}
