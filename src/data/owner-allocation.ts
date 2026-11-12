import { flags } from "@/config/flags";
import { getPool } from "@/db/pool";
import { latestBaseline, type Baseline } from "@/db/portfolio-baseline";
import { latestIdeaPerSymbol, type StoredIdea } from "@/db/ideas";
import { sampleBaseline, sampleIdeas } from "@/ideas/fixtures";
import { latestScores } from "@/data/store";
import { allocate, type AllocationResult, type AllocationSignal } from "@/engine/allocation";
import { horizonProfile, type HorizonProfile } from "@/engine/horizon";
import { recycledCashLedger, holdingFacts, type RecycledSale } from "@/portfolio/recycled-cash";
import { buildRows } from "../../scripts/horizon-report";
import { readListingFacts, sectorGroupsFor, type ListingFacts } from "./shortlist-sectors";

export const ownerViewEnabled = () => flags().OWNER_VIEW;

export interface OwnerAllocationData { baseline: Baseline | null; result: AllocationResult | null; sample: boolean; sales: RecycledSale[]; holdings: { symbol: string; gainFromCostPercent: number | null; daysHeld: number | null }[] }

export async function ownerAllocation(): Promise<OwnerAllocationData> {
  const sample = process.env.DATA_MODE === "fixture";
  let baseline: Baseline | null = null;
  let ideas: StoredIdea[] = [];
  let profileBySymbol = new Map<string, HorizonProfile>();
  let listingFacts = new Map<string, ListingFacts>();
  if (sample) { baseline = sampleBaseline; ideas = sampleIdeas; }
  else {
    const db = getPool();
    if (db) {
      [baseline, ideas] = await Promise.all([latestBaseline(db, new Date().toISOString().slice(0, 10)), latestIdeaPerSymbol(db)]);
      if (baseline) {
        const asOf = baseline.asOf;
        const symbols = [...new Set([...baseline.positions.map((p) => p.symbol), ...ideas.map((idea) => idea.symbol)])];
        [profileBySymbol, listingFacts] = await Promise.all([
          buildRows(db, asOf).then((rows) => new Map(rows.map((row) => [row.ticker, row.result.profile]))),
          readListingFacts(db, symbols, asOf).catch(() => new Map<string, ListingFacts>()),
        ]);
      }
    }
  }
  if (!baseline) return { baseline: null, result: null, sample, sales: [], holdings: [] };
  // Fixture mode still runs the classifier, so missing inputs remain explicitly no data.
  const profile = (symbol: string): HorizonProfile => profileBySymbol.get(symbol) ?? horizonProfile({ bars: [], revenue: [], marketCapUsd: null, flags: [], tier: null }).profile;
  const scores = await latestScores();
  const scoreBySymbol = new Map(scores.rows.map((row) => [row.instrument.ticker, row.result.total]));
  // Sector groups for the sector cap (docs/sizing-guide.md). The listing sector fills in when no stored facts are read (fixture mode).
  const listingSector = new Map(scores.rows.map((row) => [row.instrument.ticker, row.instrument.sector]));
  const symbols = [...new Set([...baseline.positions.map((p) => p.symbol), ...ideas.map((idea) => idea.symbol)])];
  const sectors = sectorGroupsFor(symbols, listingFacts, (symbol) => listingSector.get(symbol) ?? null);
  const sector = (symbol: string) => sectors.get(symbol)?.group ?? null;
  const signals: AllocationSignal[] = ideas.filter((idea) => idea.sizeTier).map((idea) => ({
    symbol: idea.symbol, tier: idea.sizeTier!, action: idea.action, asOf: idea.asOf,
    score: scoreBySymbol.get(idea.symbol) ?? 0,
    profile: profile(idea.symbol),
    sector: sector(idea.symbol),
  }));
  const portfolioValueEur = baseline.cashEur + baseline.positions.reduce((sum, p) => sum + p.valueEur, 0);
  const trades = baseline.trades ?? [];
  const ledger = recycledCashLedger(trades, baseline.cashEur);
  const firstOfMonth = `${baseline.asOf.slice(0, 7)}-01`;
  const historyComplete = !!baseline.tradeFromDate && baseline.tradeFromDate <= firstOfMonth;
  return {
    baseline, sample, sales: ledger.sales,
    holdings: baseline.positions.map((p) => ({ symbol: p.symbol, ...holdingFacts(p.symbol, p.quantity ?? 0, p.valueEur, p.costEur, baseline.asOf, trades) })),
    result: allocate({
      monthlyContributionEur: baseline.monthlyContributionEur ?? 0,
      freeCashEur: baseline.cashEur,
      recycledCashEur: ledger.availableEur,
      portfolioValueEur,
      positions: baseline.positions.map((p) => ({ symbol: p.symbol, valueEur: p.valueEur, profile: profile(p.symbol), sector: sector(p.symbol), lastAddMonth: historyComplete ? trades.filter((t) => t.symbol === p.symbol && t.quantity > 0).at(-1)?.date.slice(0, 7) ?? null : undefined })),
      signals,
    }),
  };
}
