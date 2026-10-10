import { freshnessDays, type EvidenceRef } from "./evidence";

/** Placeholder: net open-market buying (USD, 90 days) needed before Form 4 data counts as accumulation. Not checked against InvestingGuide.md yet. Override with INSIDER_MIN_NET_BUY_USD. */
export const DEFAULT_INSIDER_MIN_NET_BUY_USD = 100_000;
/** The collected fact is trusted for this many days after its as_of date (same as collected_facts.expires_at). */
export const INSIDER_FACT_DAYS = 30;
/** Collect runs after the session it describes, so a fact can be dated a few days after the scoring date it belongs to. */
export const INSIDER_FACT_LEAD_DAYS = 3;
export const insiderMinNetBuyUsd = (env: Record<string, string | undefined> = process.env): number => {
  const raw = env.INSIDER_MIN_NET_BUY_USD;
  const parsed = raw === undefined || raw.trim() === "" ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INSIDER_MIN_NET_BUY_USD;
};

export interface InsiderFact { asOf: string; value: unknown }
export interface InsiderDocument { url: string; publishedAt: string; trades: { date: string; code: string; shares: number }[] }
export interface InsiderResult { value: boolean | null; reason: string; refs: EvidenceRef[] }

const dayShift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
const FIELD_CLAIM = "fundamentals.insiderOrInstitutionalBuying";

/**
 * Deterministic insider flag from the insider_net_buy_90d fact. `documents` are the stored, display-allowed Form 4 filings the fact was built from.
 * null means the data cannot settle it and the agents' consensus stands. A routine-trader exclusion is not applied: the fact carries no insider identity and
 * Form 4 documents are kept 91 days, so same-month-every-year trading cannot be seen yet.
 */
export function insiderFromFact(fact: InsiderFact | null, documents: InsiderDocument[], asOf: string, minNetBuy = DEFAULT_INSIDER_MIN_NET_BUY_USD): InsiderResult | null {
  if (!fact || fact.asOf > dayShift(asOf, -INSIDER_FACT_LEAD_DAYS) || fact.asOf <= dayShift(asOf, INSIDER_FACT_DAYS)) return null;
  const v = fact.value as { netShares?: unknown; netDollars?: unknown; dollarsComplete?: unknown } | null;
  if (!v || typeof v.netShares !== "number" || typeof v.netDollars !== "number" || !Number.isFinite(v.netShares) || !Number.isFinite(v.netDollars)) return null;
  const complete = v.dollarsComplete !== false;
  const earliest = dayShift(asOf, freshnessDays.insiderOrInstitutionalBuying);
  const refs: EvidenceRef[] = documents
    .filter((doc) => doc.url.startsWith("https://") && doc.publishedAt >= earliest && doc.publishedAt <= asOf && doc.trades.some((trade) => trade.code === "P"))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 5)
    .map((doc) => {
      const buy = doc.trades.filter((trade) => trade.code === "P");
      const shares = buy.reduce((n, trade) => n + trade.shares, 0);
      return { claim: FIELD_CLAIM, url: doc.url, publishedAt: doc.publishedAt, fiscalPeriod: `Form 4 trades, 90 days to ${fact.asOf}`, quote: `Form 4 open-market purchase of ${shares} shares, ${buy[0].date}` };
    });
  const net = `net $${Math.round(v.netDollars)} (${v.netShares} shares) over 90 days to ${fact.asOf}`;
  if (v.netDollars > minNetBuy) {
    if (!refs.length) return { value: null, reason: `Form 4 ${net} but no purchase filing within ${freshnessDays.insiderOrInstitutionalBuying} days to cite`, refs: [] };
    return { value: true, reason: `Form 4 data: ${net}, above $${minNetBuy}`, refs };
  }
  // Below the threshold or net selling. Unpriced trades make netDollars a lower bound, so net buying that is not clearly small stays unknown.
  if (!complete && v.netShares > 0) return { value: null, reason: `Form 4 ${net}, some trades have no price`, refs: [] };
  return { value: false, reason: v.netDollars <= 0 ? `Form 4 data: ${net}, no net buying` : `Form 4 data: ${net}, below $${minNetBuy}`, refs };
}

/** One stored Form 4 line, as the net-buy calculation needs it. */
export interface InsiderTxRow { accession: string; ticker: string; transactionDate: string; filedAt: string; code: string; shares: number; price: number | null; derivative: boolean }
export interface InsiderNetBuy { netShares: number; netDollars: number; dollarsComplete: boolean; /** Accessions of the open-market P and S lines that were counted. */ accessions: string[] }
export const INSIDER_WINDOW_DAYS = 90;

/**
 * 90-day net open-market buying from stored Form 4 lines: code P adds, code S subtracts. Grants (A), exercises (M), tax withholding (F), gifts (G),
 * other codes and every derivative line are ignored. A line counts when both its transaction date and its filing date fall in the window ending on asOf.
 * null when the ticker has no line at all in that window (the caller then falls back to the extractor). Lines with only ignored codes give 0 net.
 */
export function netBuyFromTransactions(rows: InsiderTxRow[], asOf: string, windowDays = INSIDER_WINDOW_DAYS): InsiderNetBuy | null {
  const from = dayShift(asOf, windowDays);
  const inWindow = rows.filter((row) => row.transactionDate >= from && row.transactionDate <= asOf && row.filedAt >= from && row.filedAt <= asOf);
  if (!inWindow.length) return null;
  const counted = inWindow.filter((row) => !row.derivative && (row.code === "P" || row.code === "S"));
  const sign = (row: InsiderTxRow) => (row.code === "P" ? 1 : -1);
  const priced = counted.filter((row) => row.price !== null);
  return {
    netShares: counted.reduce((n, row) => n + sign(row) * row.shares, 0),
    netDollars: priced.reduce((n, row) => n + sign(row) * row.shares * (row.price as number), 0),
    dollarsComplete: priced.length === counted.length,
    accessions: [...new Set(counted.map((row) => row.accession))],
  };
}
