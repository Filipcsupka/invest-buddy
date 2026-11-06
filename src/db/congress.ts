import { createHash } from "node:crypto";
import type pg from "pg";
import { canDisplay } from "../data/sources-registry";
import { getPool } from "./pool";
import { isoDay, num, record, text, type Parsed } from "./economy-vendor";

type Query = Pick<pg.Pool, "query">;

export type Chamber = "house" | "senate";
export interface CongressTradeRow {
  key: string; filingId: string; chamber: Chamber; bioguideId: string | null; memberName: string; state: string | null; district: number | null;
  party: string | null; symbol: string | null; assetDescription: string | null; assetType: string | null; txType: string | null; owner: string | null;
  txDate: string | null; disclosureDate: string; amountRange: string | null; amountLow: number | null; amountHigh: number | null;
  daysToDisclose: number | null; isLate: boolean | null; comment: string | null; filingUrl: string | null; raw: Record<string, unknown>;
}
export interface CongressPage extends Parsed<CongressTradeRow> { total: number | null; hasNext: boolean }

/** A filed trade date outside 1990 to one year after disclosure is a typing error in the feed (3031 was seen); the column is left empty and raw keeps it. */
function plausibleTradeDate(value: unknown, disclosure: string): string | null {
  const day = isoDay(value);
  if (!day) return null;
  const latest = `${Number(disclosure.slice(0, 4)) + 1}${disclosure.slice(4)}`;
  return day >= "1990-01-01" && day <= latest ? day : null;
}

const https = (value: unknown): string | null => {
  const raw = text(value);
  if (!raw) return null;
  try { return new URL(raw).protocol === "https:" ? raw : null; } catch { return null; }
};

/**
 * congressional-trades page (`{ data, meta, links }`, beta). Required: chamber, a member name, a disclosure date and a filing id or URL.
 * A filing lists several trades, so each row gets a key from its own fields plus its position among identical rows of the same filing.
 */
export function parseCongressTrades(payload: unknown): CongressPage {
  const page = record(payload);
  const data = page?.data;
  if (!Array.isArray(data)) return { rows: [], skipped: 1, total: null, hasNext: false };
  const rows: CongressTradeRow[] = [];
  let skipped = 0;
  for (const item of data) {
    const row = record(item);
    const member = record(row?.member), asset = record(row?.asset), tx = record(row?.transaction), source = record(row?.source);
    const chamber = text(row?.chamber)?.toLowerCase();
    const name = text(member?.full_name) ?? ([text(member?.first_name), text(member?.last_name)].filter(Boolean).join(" ") || null);
    const disclosureDate = isoDay(tx?.disclosure_date);
    const filingUrl = https(source?.filing_url);
    const filingId = text(source?.filing_identifier) ?? filingUrl;
    if (!row || (chamber !== "house" && chamber !== "senate") || !name || !disclosureDate || !filingId) { skipped++; continue; }
    const district = num(member?.district);
    const late = tx?.is_late;
    rows.push({
      key: "", filingId, chamber, bioguideId: text(member?.bioguide_id), memberName: name, state: text(member?.state), district: district === null ? null : Math.trunc(district),
      party: text(member?.party), symbol: text(asset?.symbol)?.toUpperCase() ?? null, assetDescription: text(asset?.description), assetType: text(asset?.asset_type),
      txType: text(tx?.type)?.toLowerCase() ?? null, owner: text(tx?.owner), txDate: plausibleTradeDate(tx?.transaction_date, disclosureDate), disclosureDate,
      amountRange: text(tx?.amount_range), amountLow: num(tx?.amount_low), amountHigh: num(tx?.amount_high), daysToDisclose: num(tx?.days_to_disclose),
      isLate: typeof late === "boolean" ? late : null, comment: text(tx?.comment), filingUrl, raw: row,
    });
  }
  const meta = record(page?.meta), links = record(page?.links);
  return { rows, skipped, total: num(meta?.total), hasNext: typeof links?.next === "string" && links.next.length > 0 };
}

/** Stable keys across runs: same fields and same position among identical trades of one filing give the same key. Call it on every row of a run at once. */
export function assignTradeKeys(rows: CongressTradeRow[]): CongressTradeRow[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const tx = record(row.raw.transaction);
    const identity = JSON.stringify([row.chamber, row.filingId, row.bioguideId, row.memberName, row.symbol, row.assetDescription, row.txType, row.owner,
      text(tx?.transaction_date), row.disclosureDate, row.amountRange, row.comment]);
    const n = seen.get(identity) ?? 0;
    seen.set(identity, n + 1);
    return { ...row, key: createHash("sha256").update(`${identity}#${n}`).digest("hex").slice(0, 40) };
  });
}

export async function upsertCongressTrades(db: Query, rows: CongressTradeRow[]): Promise<number> {
  if (!rows.length) return 0;
  const col = <K extends keyof CongressTradeRow>(key: K) => rows.map((row) => row[key]);
  const result = await db.query(`INSERT INTO congress_trades (trade_key,filing_id,chamber,bioguide_id,member_name,state,district,party,symbol,asset_description,
      asset_type,tx_type,owner,tx_date,disclosure_date,amount_range,amount_low,amount_high,days_to_disclose,is_late,comment,filing_url,raw,display_allowed)
    SELECT v.*, $24 FROM unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::int[],$8::text[],$9::text[],$10::text[],$11::text[],$12::text[],
      $13::text[],$14::date[],$15::date[],$16::text[],$17::numeric[],$18::numeric[],$19::int[],$20::boolean[],$21::text[],$22::text[],$23::jsonb[]) AS v
    ON CONFLICT (trade_key) DO UPDATE SET amount_range=EXCLUDED.amount_range, amount_low=EXCLUDED.amount_low, amount_high=EXCLUDED.amount_high,
      days_to_disclose=EXCLUDED.days_to_disclose, is_late=EXCLUDED.is_late, filing_url=EXCLUDED.filing_url, state=EXCLUDED.state, district=EXCLUDED.district,
      party=EXCLUDED.party, asset_type=EXCLUDED.asset_type, raw=EXCLUDED.raw, display_allowed=EXCLUDED.display_allowed, updated_at=now()
    WHERE congress_trades.raw IS DISTINCT FROM EXCLUDED.raw OR congress_trades.display_allowed IS DISTINCT FROM EXCLUDED.display_allowed`,
  [col("key"), col("filingId"), col("chamber"), col("bioguideId"), col("memberName"), col("state"), col("district"), col("party"), col("symbol"), col("assetDescription"),
    col("assetType"), col("txType"), col("owner"), col("txDate"), col("disclosureDate"), col("amountRange"), col("amountLow"), col("amountHigh"),
    col("daysToDisclose").map((value) => value === null ? null : Math.trunc(value)), col("isLate"), col("comment"), col("filingUrl"),
    rows.map((row) => JSON.stringify(row.raw)), canDisplay("eodhd")]);
  return result.rowCount ?? 0;
}

export async function latestDisclosureDate(db: Query): Promise<string | null> {
  const result = await db.query<{ day: string | null }>("SELECT max(disclosure_date)::text AS day FROM congress_trades");
  return result.rows[0]?.day ?? null;
}

// Read models for /congress and the ticker section.

export interface CongressTrade {
  key: string; chamber: Chamber; bioguideId: string | null; memberName: string; state: string | null; district: number | null; symbol: string | null;
  assetDescription: string | null; assetType: string | null; txType: string | null; owner: string | null; txDate: string | null; disclosureDate: string;
  amountRange: string | null; isLate: boolean | null; filingUrl: string | null;
}
export interface CongressFilter { ticker?: string; member?: string; chamber?: Chamber; limit?: number }

const like = (value: string) => `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Newest disclosures first. The filters combine with AND; the member filter matches part of the name or the exact bioguide id. */
export async function congressTrades(filter: CongressFilter = {}, db: Query | null = getPool()): Promise<CongressTrade[]> {
  if (!db) return [];
  const result = await db.query<CongressTrade>(`SELECT trade_key AS key, chamber, bioguide_id AS "bioguideId", member_name AS "memberName", state, district,
      symbol, asset_description AS "assetDescription", asset_type AS "assetType", tx_type AS "txType", owner, tx_date::text AS "txDate",
      disclosure_date::text AS "disclosureDate", amount_range AS "amountRange", is_late AS "isLate", filing_url AS "filingUrl"
    FROM congress_trades
    WHERE ($1::text IS NULL OR symbol=$1) AND ($2::text IS NULL OR member_name ILIKE $2 OR bioguide_id=$3) AND ($4::text IS NULL OR chamber=$4)
    ORDER BY disclosure_date DESC, tx_date DESC NULLS LAST, member_name, trade_key LIMIT $5`,
  [filter.ticker ?? null, filter.member ? like(filter.member) : null, filter.member?.toUpperCase() ?? null, filter.chamber ?? null, Math.min(filter.limit ?? 150, 500)]);
  return result.rows;
}

export interface CongressStats { trades: number; members: number; purchases: number; sales: number; latest: string | null }
/** Counts over the last `days` days of disclosures, for the page's KPI row. */
export async function congressStats(days = 30, db: Query | null = getPool()): Promise<CongressStats> {
  const empty = { trades: 0, members: 0, purchases: 0, sales: 0, latest: null };
  if (!db) return empty;
  const result = await db.query<{ trades: string; members: string; purchases: string; sales: string; latest: string | null }>(`
    SELECT count(*) AS trades, count(DISTINCT member_name) AS members, count(*) FILTER (WHERE tx_type='purchase') AS purchases,
      count(*) FILTER (WHERE tx_type='sale') AS sales, (SELECT max(disclosure_date)::text FROM congress_trades) AS latest
    FROM congress_trades WHERE disclosure_date >= CURRENT_DATE - $1::int`, [days]);
  const row = result.rows[0];
  return row ? { trades: Number(row.trades), members: Number(row.members), purchases: Number(row.purchases), sales: Number(row.sales), latest: row.latest } : empty;
}
