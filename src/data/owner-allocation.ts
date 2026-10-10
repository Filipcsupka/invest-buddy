import pg from "pg";
import { flags } from "@/config/flags";
import { latestBaseline, type Baseline } from "@/db/portfolio-baseline";
import { latestIdeaPerSymbol, type StoredIdea } from "@/db/ideas";
import { sampleBaseline, sampleIdeas } from "@/ideas/fixtures";
import { latestScores } from "@/data/store";
import { allocate, type AllocationResult, type AllocationSignal } from "@/engine/allocation";

export const ownerViewEnabled = () => flags().OWNER_VIEW;

export interface OwnerAllocationData { baseline: Baseline | null; result: AllocationResult | null; sample: boolean }

export async function ownerAllocation(): Promise<OwnerAllocationData> {
  const sample = process.env.DATA_MODE === "fixture";
  let baseline: Baseline | null = null;
  let ideas: StoredIdea[] = [];
  if (sample) { baseline = sampleBaseline; ideas = sampleIdeas; }
  else if (process.env.DATABASE_URL) {
    const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
    try {
      [baseline, ideas] = await Promise.all([latestBaseline(db, new Date().toISOString().slice(0, 10)), latestIdeaPerSymbol(db)]);
    } finally { await db.end(); }
  }
  if (!baseline) return { baseline: null, result: null, sample };
  const scores = await latestScores();
  const scoreBySymbol = new Map(scores.rows.map((row) => [row.instrument.ticker, row.result.total]));
  const signals: AllocationSignal[] = ideas.filter((idea) => idea.sizeTier).map((idea) => ({
    symbol: idea.symbol, tier: idea.sizeTier!, action: idea.action, asOf: idea.asOf,
    score: scoreBySymbol.get(idea.symbol) ?? 0,
  }));
  const portfolioValueEur = baseline.cashEur + baseline.positions.reduce((sum, p) => sum + p.valueEur, 0);
  return {
    baseline, sample, result: allocate({
      monthlyContributionEur: baseline.monthlyContributionEur ?? 0,
      freeCashEur: baseline.cashEur,
      portfolioValueEur,
      positions: baseline.positions.map((p) => ({ symbol: p.symbol, valueEur: p.valueEur })),
      signals,
    }),
  };
}
