import type pg from "pg";
import { getPool } from "./pool";

export interface InsiderEvent {
  accession: string;
  lineNo: number;
  ticker: string;
  ownerName: string | null;
  reportingOwners: { name: string | null; isDirector: boolean | null; isOfficer: boolean | null; isTenPercentOwner: boolean | null; isOther: boolean | null }[];
  isDirector: boolean | null;
  isOfficer: boolean | null;
  isTenPercentOwner: boolean | null;
  isOther: boolean | null;
  transactionDate: string;
  filedAt: string;
  code: string;
  shares: number;
  value: number | null;
  /** Null when the instrument has no CIK stored yet. */
  secUrl: string | null;
}

type Row = Omit<InsiderEvent, "shares" | "value" | "secUrl"> & {
  shares: string;
  value: string | null;
  cik: string | null;
};

/** Recent public SEC Form 4 activity for current universe names. */
export async function insiderEvents(ticker?: string, db: Pick<pg.Pool, "query"> | null = getPool()): Promise<InsiderEvent[]> {
  if (!db) return [];
  const result = await db.query<Row>(
    `SELECT t.accession, t.line_no AS "lineNo", t.ticker, t.owner_name AS "ownerName",
       t.reporting_owners AS "reportingOwners", t.is_director AS "isDirector",
       t.is_officer AS "isOfficer", t.is_ten_percent_owner AS "isTenPercentOwner",
       t.is_other AS "isOther", t.transaction_date::text AS "transactionDate",
       t.filed_at::text AS "filedAt", t.code, t.shares::text AS shares,
       (t.shares * t.price)::text AS value, ids.cik::text AS cik
     FROM insider_transactions t
     LEFT JOIN instrument_ids ids ON ids.ticker = t.ticker AND ids.valid_to IS NULL
     WHERE t.display_allowed = true
       AND EXISTS (SELECT 1 FROM data_sources s WHERE s.id = 'sec' AND s.display_allowed = true)
       AND EXISTS (SELECT 1 FROM universe_membership m WHERE m.ticker = t.ticker
         AND m.list <> 'benchmark' AND m.valid_from <= CURRENT_DATE
         AND (m.valid_to IS NULL OR m.valid_to > CURRENT_DATE))
       AND ($1::text IS NULL OR t.ticker = $1)
       AND t.code IN ('P', 'S', 'A', 'M', 'F')
     ORDER BY t.transaction_date DESC, t.filed_at DESC, t.accession DESC, t.line_no DESC
     LIMIT $2`,
    [ticker ?? null, ticker ? 40 : 100],
  );
  return result.rows.map(({ cik, shares, value, ...row }) => ({
    ...row,
    shares: Number(shares),
    value: value === null ? null : Number(value),
    secUrl: cik ? `https://www.sec.gov/Archives/edgar/data/${cik}/${row.accession.replaceAll("-", "")}/` : null,
  }));
}
