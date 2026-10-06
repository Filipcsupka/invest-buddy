import type pg from "pg";
import type { ScoreResult } from "../engine";
import { computeSignals, SIGNAL_RULES, type Signal, type SignalSymbolInput } from "../engine/signals";
import { computeTechnicals, type Bar, type Technicals } from "../data/technicals";
import { latestBaseline, type Baseline } from "./portfolio-baseline";
import { latestIdeaPerSymbol, ideaSignature, type IdeaAction, type Idea, type SizeTier } from "./ideas";

/** The benchmark every idea is compared against: the default home for money that has no better use. */
export const BENCHMARK = { symbol: "CSPX", description: "S&P 500 UCITS ETF, the default home for money that has no better use" } as const;
export const DEFAULT_MAX_SYMBOLS = 12;
const MAX_EVIDENCE_PER_SYMBOL = 6;
const BENCH_SPY = "SPY";

export interface JudgeField { value: boolean | null; agreement: string; verified: boolean; carriedFrom: string | null; reason: string }
export interface JudgeEvidence { url: string; field: string; publishedAt: string | null; quote: string | null }
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
  /** Action, size tier and ratings for each symbol, from data only (src/engine/signals.ts). The owner EUR band is filled only when a baseline exists. The judge cannot change them, only downgrade to WATCH. */
  signals: JudgeSignal[];
  previousIdeas: JudgePrevious[];
}

const round = (v: number, d = 2) => Number(v.toFixed(d));

interface ConsensusRow { symbol: string; field: string; value: boolean | null; agreement: string; verified: boolean; reason: string; carried_from: string | null; evidence_refs: { url?: string; claim?: string; publishedAt?: string; quote?: string }[] }
interface ScoreRow { ticker: string; name: string; sector: string; tier: number | null; audit: ScoreResult }

/** Which symbols go to the judge: held names, names with an earlier idea, and names in the Setup or Watch state. Everything else is noise. Capped at `max`. */
export function pickSymbols(rows: ScoreRow[], held: Set<string>, previous: Set<string>, max = DEFAULT_MAX_SYMBOLS): ScoreRow[] {
  const wanted = (r: ScoreRow) => held.has(r.ticker) || previous.has(r.ticker) || r.audit.state === "Setup met (>=18)" || r.audit.state === "Watch";
  return rows.filter(wanted).sort((a, b) => Number(held.has(b.ticker)) - Number(held.has(a.ticker)) || b.audit.total - a.audit.total || a.ticker.localeCompare(b.ticker)).slice(0, max);
}

export function shapeSymbol(row: ScoreRow, consensus: ConsensusRow[], baseline: Baseline | null, invested: number, technicals: Technicals | null, displayUrls: Set<string> = new Set()): JudgeSymbol {
  const a = row.audit;
  const pos = baseline?.positions.find((p) => p.symbol === row.ticker);
  const fields: Record<string, JudgeField> = {};
  const evidence: JudgeEvidence[] = [];
  const seen = new Set<string>();
  for (const c of [...consensus].sort((x, y) => x.field.localeCompare(y.field))) {
    fields[c.field] = { value: c.value, agreement: c.agreement, verified: c.verified, carriedFrom: c.carried_from, reason: c.reason.slice(0, 200) };
    for (const e of c.evidence_refs ?? []) {
      if (!e.url || !displayUrls.has(e.url) || seen.has(e.url) || evidence.length >= MAX_EVIDENCE_PER_SYMBOL) continue;
      seen.add(e.url);
      evidence.push({ url: e.url, field: c.field, publishedAt: e.publishedAt ?? null, quote: e.quote ? e.quote.slice(0, 240) : null });
    }
  }
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

/** Deterministic signals for the picked symbols. The baseline only marks held names and fills the private owner band. Cost basis is dropped before this call: profit and loss never decide an action. */
export function signalsFor(symbols: JudgeSymbol[], portfolio: JudgeInput["portfolio"]): JudgeSignal[] {
  const inputs: SignalSymbolInput[] = symbols.map((s) => ({ symbol: s.symbol, held: s.held ? { valueEur: s.held.valueEur } : null, score: { total: s.score.total, state: s.score.state }, fields: Object.fromEntries(Object.entries(s.fields).map(([k, f]) => [k, { value: f.value, agreement: f.agreement, verified: f.verified, carriedFrom: f.carriedFrom }])), expiredFields: s.expiredFields, technicals: s.technicals }));
  const sigs = computeSignals(inputs, portfolio ? { cashEur: portfolio.cashEur, investedEur: portfolio.investedEur, positions: portfolio.positions, monthlyContributionEur: portfolio.monthlyContributionEur } : null);
  return sigs.map((s) => ({ ...s, signature: ideaSignature({ action: s.action, setup: s.ratings, sizeTier: s.sizeTier }) }));
}

export async function buildJudgeInput(pool: Pick<pg.Pool, "query">, asOf: string, now = new Date(), maxSymbols = DEFAULT_MAX_SYMBOLS): Promise<JudgeInput> {
  const baseline = await latestBaseline(pool, asOf);
  const previous = await latestIdeaPerSymbol(pool);
  const scores = await pool.query<ScoreRow>(`SELECT DISTINCT ON (s.ticker) s.ticker, i.name, i.sector, i.tier, s.audit FROM score_results s JOIN instruments i ON i.ticker=s.ticker
    WHERE s.as_of <= $1 AND s.as_of >= ($1::date - 10) ORDER BY s.ticker, s.as_of DESC`, [asOf]);
  const held = new Set((baseline?.positions ?? []).map((p) => p.symbol));
  const picked = pickSymbols(scores.rows, held, new Set(previous.map((p) => p.symbol)), maxSymbols);
  const tickers = picked.map((r) => r.ticker);
  const consensus = picked.length ? await pool.query<ConsensusRow>(`SELECT DISTINCT ON (symbol, field) symbol, field, value, agreement, verified, reason, carried_from::text, evidence_refs
    FROM consensus_findings WHERE symbol = ANY($1) AND as_of <= $2 ORDER BY symbol, field, as_of DESC`, [tickers, asOf]) : { rows: [] as ConsensusRow[] };
  const evidenceUrls = [...new Set(consensus.rows.flatMap((row) => row.evidence_refs ?? []).map((ref) => ref.url).filter((url): url is string => !!url))];
  const cleared = evidenceUrls.length ? await pool.query<{ url: string }>(`SELECT d.url FROM source_documents d
    WHERE d.url = ANY($1::text[]) AND d.meta->>'display_allowed' = 'true'`, [evidenceUrls]) : { rows: [] as { url: string }[] };
  const displayUrls = new Set(cleared.rows.map((row) => row.url));
  const barRows = picked.length ? await pool.query<{ ticker: string; bar_date: string; open: string; high: string; low: string; close: string; volume: string }>(
    `SELECT ticker, bar_date::text, open, high, low, close, volume FROM daily_bars WHERE ticker = ANY($1) AND bar_date <= $2 AND bar_date >= ($2::date - 420) ORDER BY ticker, bar_date`, [[...tickers, BENCH_SPY], asOf]) : { rows: [] };
  const bars = new Map<string, Bar[]>();
  for (const b of barRows.rows) (bars.get(b.ticker) ?? bars.set(b.ticker, []).get(b.ticker)!).push({ date: b.bar_date, open: Number(b.open), high: Number(b.high), low: Number(b.low), close: Number(b.close), volume: Number(b.volume) });
  const invested = (baseline?.positions ?? []).reduce((sum, p) => sum + p.valueEur, 0);
  const portfolio: JudgeInput["portfolio"] = baseline ? { asOf: baseline.asOf, source: baseline.source, currency: "EUR", cashEur: baseline.cashEur, monthlyContributionEur: baseline.monthlyContributionEur ?? null, investedEur: round(invested), positions: baseline.positions.map((p) => ({ symbol: p.symbol, valueEur: p.valueEur })) } : null;
  const symbols = picked.map((r) => shapeSymbol(r, consensus.rows.filter((c) => c.symbol === r.ticker), baseline, invested, computeTechnicals(bars.get(r.ticker) ?? [], bars.get(BENCH_SPY) ?? null), displayUrls));
  return {
    asOf, generatedAt: now.toISOString(), ruleConfigVersion: SIGNAL_RULES.version, benchmark: BENCHMARK, portfolio, symbols,
    signals: signalsFor(symbols, portfolio),
    previousIdeas: previous.map((p) => ({ symbol: p.symbol, asOf: p.asOf, action: p.action, setup: p.setup, signature: p.signature, sizeTier: p.sizeTier })),
  };
}
