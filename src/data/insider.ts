import { freshnessDays, type EvidenceRef } from "./evidence";

/** Placeholder: net open-market buying (USD, 90 days) needed before Form 4 data counts as accumulation. Not checked against InvestingGuide.md yet. Override with INSIDER_MIN_NET_BUY_USD. */
export const DEFAULT_INSIDER_MIN_NET_BUY_USD = 100_000;
/** The collected fact is trusted for this many days after its as_of date (same as collected_facts.expires_at). */
export const INSIDER_FACT_DAYS = 30;
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
  if (!fact || fact.asOf > asOf || fact.asOf <= dayShift(asOf, INSIDER_FACT_DAYS)) return null;
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
