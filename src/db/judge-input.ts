import type pg from "pg";
import type { ScoreResult } from "../engine";
import { computeSignals, SIGNAL_RULES, type Signal, type SignalSymbolInput } from "../engine/signals";
import { computeTechnicals, type Bar, type Technicals } from "../data/technicals";
import { freshnessDays } from "../data/evidence";
import { CITABLE_AGREEMENTS, SEC_PUBLIC_URL } from "../data/sources";
import { latestBaseline, type Baseline } from "./portfolio-baseline";
import { latestIdeaPerSymbol, ideaSignature, type IdeaAction, type Idea, type SizeTier } from "./ideas";

/** The benchmark every idea is compared against: the default home for money that has no better use. */
export const BENCHMARK = { symbol: "CSPX", description: "S&P 500 UCITS ETF, the default home for money that has no better use" } as const;
export const DEFAULT_MAX_SYMBOLS = 12;
export const MAX_EVIDENCE_PER_SYMBOL = 8;
/** Agreements that stand as verified facts. Their evidence refs may be cited. */
/** Primary documents behind the flags: the earnings release exhibit and the 10-Q. */
export const PRIMARY_DOC_TYPES = ["8-K EX-99.1", "8-K EX-99.2", "10-Q"] as const;
const BENCH_SPY = "SPY";

export interface JudgeField { value: boolean | null; agreement: string; verified: boolean; carriedFrom: string | null; reason: string }
export interface JudgeEvidence { url: string; field: string; label: string | null; publishedAt: string | null; quote: string | null }
/** A stored, display-allowed SEC document of the symbol. */
export interface PrimaryDoc { url: string; docType: string; publishedAt: string }
export interface JudgeSymbol {
  symbol: string; name: string; sector: string; tier: number | null;
  held: { valueEur: number; weightPercent: number } | null;
  score: { total: number; technical: number; fundamentals: number; macro: number; state: string; pullbackInUptrend: boolean; asOf: string };
  invalidReasons: string[];
  /** Derived chart numbers only. The raw price series never leaves the database (Twelve Data free plan terms). */
  technicals: Technicals | null;
  matchedRules: string[];
  fields: Record<string, JudgeField>;
  expiredFields: string[];
  carriedFrom: string | null;
  evidence: JudgeEvidence[];
}
export interface JudgeSignal extends Signal { signature: string }
export interface JudgePrevious { symbol: string; asOf: string; action: IdeaAction; setup: Idea["setup"]; signature: string; sizeTier: SizeTier | null }
export interface JudgeInput {
  asOf: string;
  generatedAt: string;
  ruleConfigVersion: string;
  benchmark: typeof BENCHMARK;
  portfolio: (Omit<Baseline, "positions"> & { investedEur: number; positions: { symbol: string; valueEur: number; quantity?: number }[] }) | null;
  symbols: JudgeSymbol[];
  /** Action, size tier and ratings for each symbol, from data only. Owner amounts are calculated separately for the private view. The judge can only downgrade to WATCH. */
  signals: JudgeSignal[];
  previousIdeas: JudgePrevious[];
}

const round = (v: number, d = 2) => Number(v.toFixed(d));

interface ConsensusRow { symbol: string; field: string; value: boolean | null; agreement: string; verified: boolean; reason: string; carried_from: string | null; evidence_refs: { url?: string; claim?: string; publishedAt?: string; fiscalPeriod?: string; quote?: string }[] }
interface ScoreRow { ticker: string; name: string; sector: string; tier: number | null; audit: ScoreResult }

/** Which symbols go to the judge: held names, names with an earlier idea, and names in the Setup or Watch state. Everything else is noise. Capped at `max`. */
export function pickSymbols(rows: ScoreRow[], held: Set<string>, previous: Set<string>, max = DEFAULT_MAX_SYMBOLS, requested: Set<string> = new Set()): ScoreRow[] {
  const wanted = (r: ScoreRow) => requested.has(r.ticker) || held.has(r.ticker) || previous.has(r.ticker) || r.audit.state === "Setup met (>=18)" || r.audit.state === "Watch";
  return rows.filter(wanted).sort((a, b) => Number(requested.has(b.ticker)) - Number(requested.has(a.ticker)) || Number(held.has(b.ticker)) - Number(held.has(a.ticker)) || b.audit.total - a.audit.total || a.ticker.localeCompare(b.ticker)).slice(0, max);
}

const refLabel = (ref: { url?: string; fiscalPeriod?: string }): string | null =>
  ref.url && SEC_PUBLIC_URL.test(ref.url) ? "SEC XBRL" : ref.fiscalPeriod?.startsWith("Form 4") ? "SEC Form 4" : null;
const docLabel = (docType: string): string => (docType === "10-Q" ? "10-Q" : "Earnings release");

/**
 * The links the judge may cite for one symbol: every verified finding's refs (agree, verified_single, xbrl_override, data_rule) whose url is a stored
 * display-allowed document or public SEC XBRL data, plus the symbol's own earnings exhibit and 10-Q. Deduplicated by url, newest first, capped.
 * Alpha Vantage, FRED and VIX urls are not display-allowed, so they never appear.
 */
export function collectEvidence(consensus: ConsensusRow[], displayUrls: Set<string>, primaryDocs: PrimaryDoc[] = []): JudgeEvidence[] {
  const all: JudgeEvidence[] = [];
  for (const c of [...consensus].sort((x, y) => x.field.localeCompare(y.field))) {
    if (!c.verified || !CITABLE_AGREEMENTS.has(c.agreement)) continue;
    for (const e of c.evidence_refs ?? []) {
      if (!e.url || !(displayUrls.has(e.url) || SEC_PUBLIC_URL.test(e.url))) continue;
      all.push({ url: e.url, field: c.field, label: refLabel(e), publishedAt: e.publishedAt ?? null, quote: e.quote ? e.quote.slice(0, 240) : null });
    }
  }
  for (const d of primaryDocs) all.push({ url: d.url, field: "primarySource", label: docLabel(d.docType), publishedAt: d.publishedAt, quote: null });
  const seen = new Set<string>();
  const unique = all.filter((e) => !seen.has(e.url) && !!seen.add(e.url));
  return unique.map((e, i) => ({ e, i })).sort((a, b) => (b.e.publishedAt ?? "").localeCompare(a.e.publishedAt ?? "") || a.i - b.i).map((x) => x.e).slice(0, MAX_EVIDENCE_PER_SYMBOL);
}

export function shapeSymbol(row: ScoreRow, consensus: ConsensusRow[], baseline: Baseline | null, invested: number, technicals: Technicals | null, displayUrls: Set<string> = new Set(), primaryDocs: PrimaryDoc[] = []): JudgeSymbol {
  const a = row.audit;
  const pos = baseline?.positions.find((p) => p.symbol === row.ticker);
  const fields: Record<string, JudgeField> = {};
  for (const c of consensus) fields[c.field] = { value: c.value, agreement: c.agreement, verified: c.verified, carriedFrom: c.carried_from, reason: c.reason.slice(0, 200) };
  const evidence = collectEvidence(consensus, displayUrls, primaryDocs);
  const carried = Object.values(fields).map((f) => f.carriedFrom).filter((d): d is string => !!d).sort();
  return {
    symbol: row.ticker, name: row.name, sector: row.sector, tier: row.tier,
    held: pos ? { valueEur: pos.valueEur, weightPercent: invested > 0 ? round((pos.valueEur / invested) * 100, 1) : 0 } : null,
    score: { total: a.total, technical: a.technical, fundamentals: a.fundamentals, macro: a.macro, state: a.state, pullbackInUptrend: a.pullbackInUptrend, asOf: a.asOf },
    invalidReasons: a.invalidReasons, technicals,
    matchedRules: a.ruleHits.filter((r) => r.matched).map((r) => r.id),
    fields, expiredFields: [...(a.expiredFields ?? [])].sort(), carriedFrom: carried[0] ?? null, evidence,
  };
}

/** Deterministic public signals. The owner's baseline is not an action or amount input; the private allocation page handles amounts. */
export function signalsFor(symbols: JudgeSymbol[], portfolio: JudgeInput["portfolio"]): JudgeSignal[] {
  void portfolio;
  const inputs: SignalSymbolInput[] = symbols.map((s) => ({ symbol: s.symbol, held: null, score: { total: s.score.total, state: s.score.state }, fields: Object.fromEntries(Object.entries(s.fields).map(([k, f]) => [k, { value: f.value, agreement: f.agreement, verified: f.verified, carriedFrom: f.carriedFrom }])), expiredFields: s.expiredFields, technicals: s.technicals }));
  const sigs = computeSignals(inputs, null);
  return sigs.map((s) => ({ ...s, signature: ideaSignature({ action: s.action, setup: s.ratings, sizeTier: s.sizeTier }) }));
}

export async function buildJudgeInput(pool: Pick<pg.Pool, "query">, asOf: string, now = new Date(), maxSymbols = DEFAULT_MAX_SYMBOLS, requested: string[] = []): Promise<JudgeInput> {
  const baseline = await latestBaseline(pool, asOf);
  const previous = await latestIdeaPerSymbol(pool);
  const scores = await pool.query<ScoreRow>(`SELECT DISTINCT ON (s.ticker) s.ticker, i.name, i.sector, m.tier, s.audit FROM score_results s
    JOIN instruments i ON i.ticker=s.ticker JOIN universe_membership m ON m.ticker=i.ticker
    WHERE s.as_of <= $1 AND s.as_of >= ($1::date - 10) AND s.as_of >= m.valid_from AND m.list <> 'benchmark'
      AND m.valid_from <= $1::date AND (m.valid_to IS NULL OR m.valid_to > $1::date)
    ORDER BY s.ticker, s.as_of DESC`, [asOf]);
  const held = new Set((baseline?.positions ?? []).map((p) => p.symbol));
  const picked = pickSymbols(scores.rows, held, new Set(previous.map((p) => p.symbol)), maxSymbols, new Set(requested));
  const tickers = picked.map((r) => r.ticker);
  const consensus = picked.length ? await pool.query<ConsensusRow>(`SELECT DISTINCT ON (symbol, field) symbol, field, value, agreement, verified, reason, carried_from::text, evidence_refs
    FROM consensus_findings WHERE symbol = ANY($1) AND as_of <= $2 ORDER BY symbol, field, as_of DESC`, [tickers, asOf]) : { rows: [] as ConsensusRow[] };
  const evidenceUrls = [...new Set(consensus.rows.flatMap((row) => row.evidence_refs ?? []).map((ref) => ref.url).filter((url): url is string => !!url))];
  const cleared = evidenceUrls.length ? await pool.query<{ url: string }>(`SELECT d.url FROM source_documents d
    WHERE d.url = ANY($1::text[]) AND d.meta->>'display_allowed' = 'true'`, [evidenceUrls]) : { rows: [] as { url: string }[] };
  const displayUrls = new Set(cleared.rows.map((row) => row.url));
  // The symbol's own earnings exhibit and 10-Q are the primary sources behind the flags. Latest of each kind inside the 100 day field window, display-allowed only.
  const docRows = picked.length ? await pool.query<{ symbol: string; doc_type: string; url: string; published_at: string }>(`SELECT DISTINCT ON (symbol, doc_type) symbol, doc_type, url, published_at::date::text AS published_at
    FROM source_documents WHERE symbol = ANY($1) AND doc_type = ANY($2::text[]) AND meta->>'display_allowed' = 'true'
    AND published_at::date <= $3::date AND published_at::date >= ($3::date - $4::int) ORDER BY symbol, doc_type, published_at DESC`, [tickers, [...PRIMARY_DOC_TYPES], asOf, freshnessDays.epsBeat]) : { rows: [] as { symbol: string; doc_type: string; url: string; published_at: string }[] };
  const primaryFor = (symbol: string): PrimaryDoc[] => {
    const docs = docRows.rows.filter((d) => d.symbol === symbol).map((d) => ({ url: d.url, docType: d.doc_type, publishedAt: d.published_at }));
    const release = docs.find((d) => d.docType === "8-K EX-99.1") ?? docs.find((d) => d.docType === "8-K EX-99.2");
    return [release, docs.find((d) => d.docType === "10-Q")].filter((d): d is PrimaryDoc => !!d);
  };
  const barRows = picked.length ? await pool.query<{ ticker: string; bar_date: string; open: string; high: string; low: string; close: string; volume: string }>(
    `SELECT ticker, bar_date::text, open, high, low, close, volume FROM daily_bars WHERE ticker = ANY($1) AND bar_date <= $2 AND bar_date >= ($2::date - 420) ORDER BY ticker, bar_date`, [[...tickers, BENCH_SPY], asOf]) : { rows: [] };
  const bars = new Map<string, Bar[]>();
  for (const b of barRows.rows) (bars.get(b.ticker) ?? bars.set(b.ticker, []).get(b.ticker)!).push({ date: b.bar_date, open: Number(b.open), high: Number(b.high), low: Number(b.low), close: Number(b.close), volume: Number(b.volume) });
  const invested = (baseline?.positions ?? []).reduce((sum, p) => sum + p.valueEur, 0);
  const portfolio: JudgeInput["portfolio"] = baseline ? { asOf: baseline.asOf, source: baseline.source, currency: "EUR", cashEur: baseline.cashEur, monthlyContributionEur: baseline.monthlyContributionEur ?? null, investedEur: round(invested), positions: baseline.positions.map((p) => ({ symbol: p.symbol, valueEur: p.valueEur })) } : null;
  const symbols = picked.map((r) => shapeSymbol(r, consensus.rows.filter((c) => c.symbol === r.ticker), baseline, invested, computeTechnicals(bars.get(r.ticker) ?? [], bars.get(BENCH_SPY) ?? null), displayUrls, primaryFor(r.ticker)));
  return {
    asOf, generatedAt: now.toISOString(), ruleConfigVersion: SIGNAL_RULES.version, benchmark: BENCHMARK, portfolio, symbols,
    signals: signalsFor(symbols, portfolio),
    previousIdeas: previous.map((p) => ({ symbol: p.symbol, asOf: p.asOf, action: p.action, setup: p.setup, signature: p.signature, sizeTier: p.sizeTier })),
  };
}
