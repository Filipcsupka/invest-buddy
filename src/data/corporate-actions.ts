import type { OHLCV } from "../engine";

export type CorporateActionKind = "split" | "reverse_split" | "dividend" | "spinoff" | "symbol_change";
export interface CorporateAction {
  ticker: string;
  actionDate: string;
  kind: CorporateActionKind;
  /** New shares per old share (4 for a 4:1 split, 0.1 for a 1:10 reverse split). */
  ratio: number | null;
  amount: number | null;
  sourceId: string;
  detectedBy: "vendor" | "heuristic";
  detail: Record<string, unknown>;
}

/** A vendor that lists corporate actions. No implementation yet: the Twelve Data splits endpoint is not verified for the free plan. */
export interface CorporateActionsAdapter {
  sourceId: string;
  fetchActions(ticker: string, since: string): Promise<CorporateAction[]>;
}

/** Placeholder thresholds; the owner sets the final values. */
export const SPLIT_THRESHOLDS = {
  /** A daily close move beyond this fraction is a candidate. Same value as the dq daily_move check. */
  minMove: 0.4,
  /** Volume of the move day against the median volume of the 20 days before. */
  volumeSpike: 2,
  /** Allowed distance from a rational ratio, as a fraction. */
  ratioTolerance: 0.02,
  /** Share of overlapping revised bars that must show the same scale for a whole-history split. */
  historyShare: 0.8,
  minRevisedBars: 20,
};

/** Ratios (new shares per old share) a split can take: n:1 for 2..20 and 3:2, 5:4, plus their reverses. */
const FORWARD = [...Array.from({ length: 19 }, (_, i) => i + 2), 1.5, 1.25];
const CANDIDATES = [...FORWARD, ...FORWARD.map((r) => 1 / r)];

/** Nearest allowed split ratio to `value` within the tolerance, or null. */
export function snapRatio(value: number, tolerance = SPLIT_THRESHOLDS.ratioTolerance, candidates: readonly number[] = CANDIDATES): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  let best: number | null = null;
  for (const candidate of candidates) if (Math.abs(value / candidate - 1) <= tolerance && (best === null || Math.abs(value / candidate - 1) < Math.abs(value / best - 1))) best = candidate;
  return best === null ? null : Math.round(best * 1e6) / 1e6;
}

/**
 * Ratios the bar path can see: the close moves by 1/ratio - 1, which must exceed minMove. 3:2 moves 33% and 5:4 moves 20%, so they
 * (and 4:5, +25%) are found only by the revision path. 2:3 (+50%) and every n:1 from 2 are within reach.
 */
export const BAR_RATIOS: readonly number[] = CANDIDATES.filter((ratio) => Math.abs(1 / ratio - 1) > SPLIT_THRESHOLDS.minMove);

const median = (values: number[]) => { const s = [...values].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
const kindOf = (ratio: number): CorporateActionKind => ratio > 1 ? "split" : "reverse_split";

/**
 * Heuristic on one ticker's stored bars: a close that moves beyond minMove against the previous close, by a factor close to
 * a split ratio, on a volume spike. Only ratios whose move exceeds minMove can be flagged (BAR_RATIOS); 3:2 and 5:4 come from detectFromRevisions. Price falls by the ratio on a split (previous / close = ratio). A real crash is only flagged
 * when its factor happens to sit on a split ratio and volume spikes, which is why the row says `heuristic`.
 */
export function detectFromBars(ticker: string, bars: OHLCV[], sourceId = "twelvedata"): CorporateAction[] {
  const t = SPLIT_THRESHOLDS;
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const out: CorporateAction[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const move = sorted[i].close / sorted[i - 1].close - 1;
    if (Math.abs(move) <= t.minMove) continue;
    const prior = sorted.slice(Math.max(0, i - 20), i).map((bar) => bar.volume);
    const base = median(prior);
    if (!(base > 0) || sorted[i].volume < t.volumeSpike * base) continue;
    const ratio = snapRatio(sorted[i - 1].close / sorted[i].close, SPLIT_THRESHOLDS.ratioTolerance, BAR_RATIOS);
    if (ratio === null) continue;
    out.push({ ticker, actionDate: sorted[i].date, kind: kindOf(ratio), ratio, amount: null, sourceId, detectedBy: "heuristic",
      detail: { rule: "close_move_volume_spike", move: Math.round(move * 10000) / 10000, volumeRatio: Math.round((sorted[i].volume / base) * 100) / 100 } });
  }
  return out;
}

export interface RevisedBar { barDate: string; oldClose: number; newClose: number }

/**
 * D12 signal: after a split the vendor rewrites the old bars, so the superseded close divided by the new close is the same
 * number for the whole history. When most revised bars share one ratio near a split ratio, the split is dated at the first
 * bar after the last rewritten one (`nextBarDate`, from the stored bars).
 */
export function detectFromRevisions(ticker: string, revised: RevisedBar[], nextBarDate: (after: string) => string | null, sourceId = "twelvedata"): CorporateAction[] {
  const t = SPLIT_THRESHOLDS;
  const scaled = revised.filter((r) => r.oldClose > 0 && r.newClose > 0).map((r) => ({ ...r, factor: r.oldClose / r.newClose })).filter((r) => Math.abs(r.factor - 1) > t.ratioTolerance);
  if (revised.length < t.minRevisedBars || scaled.length < t.historyShare * revised.length) return [];
  const ratio = snapRatio(median(scaled.map((r) => r.factor)));
  if (ratio === null) return [];
  const agreeing = scaled.filter((r) => Math.abs(r.factor / ratio - 1) <= t.ratioTolerance);
  if (agreeing.length < t.historyShare * revised.length) return [];
  const last = agreeing.map((r) => r.barDate).sort().at(-1)!;
  const actionDate = nextBarDate(last);
  if (!actionDate) return [];
  return [{ ticker, actionDate, kind: kindOf(ratio), ratio, amount: null, sourceId, detectedBy: "heuristic",
    detail: { rule: "history_rescaled", revisedBars: agreeing.length, lastRescaledBar: last } }];
}
