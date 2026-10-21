import type { EtfHistory, EtfOutcome, EtfPick, EtfRun } from "@/db/etf";

// All prices, sizes, calls and commentary below are invented sample data.
const base: Omit<EtfPick, "symbol" | "name" | "assetClass" | "call" | "terPct" | "aumUsdM" | "price"> = {
  exchange: "LSE", isin: null, region: "Global", conviction: 3, thesis: "Sample research card for layout and workflow testing.",
  whatHappened: ["The sample price moved within its recent range."], whyItMatters: "The fund's cost and index exposure determine its fit in this sample screen.",
  plan: { entryZone: "Review after a pullback to the sample range.", addWhen: "The index exposure still fits the intended allocation.", stopAddingWhen: "Costs rise or the index mandate changes." },
  risks: ["Market prices can fall.", "Currency moves can affect returns."], trackedIndex: null, domicile: "Ireland", replication: "Physical",
  priceCurrency: "USD", priceAsOf: "2026-10-20", evidence: [], verificationStatus: "unverified", firstSeenAt: "2026-10-06", lastSeenAt: "2026-10-20", benchmarkSymbol: "SPY",
};

export const sampleEtfPicks: EtfPick[] = [
  { ...base, symbol: "VWRA", name: "Global equity sample fund", assetClass: "equity", call: "BUY_ZONE", terPct: 0.22, aumUsdM: 18000, price: 143.28, trackedIndex: "Global all-cap sample index" },
  { ...base, symbol: "CSPX", name: "US large-cap sample fund", assetClass: "equity", call: "WATCH", terPct: 0.07, aumUsdM: 92000, price: 681.41, trackedIndex: "US large-cap sample index" },
  { ...base, symbol: "EIMI", name: "Emerging markets sample fund", assetClass: "equity", call: "WATCH", terPct: 0.18, aumUsdM: 25000, price: 38.12, trackedIndex: "Emerging markets sample index" },
  { ...base, symbol: "AGGH", name: "Global aggregate bond sample fund", assetClass: "bond", call: "BUY_ZONE", terPct: 0.10, aumUsdM: 12000, price: 5.12, trackedIndex: "Global aggregate bond sample index" },
  { ...base, symbol: "IBTS", name: "Short Treasury sample fund", assetClass: "bond", call: "WATCH", terPct: 0.07, aumUsdM: 6000, price: 123.84, trackedIndex: "Short Treasury sample index" },
  { ...base, symbol: "SGLN", name: "Physical gold sample product", assetClass: "commodity", call: "WATCH", terPct: 0.12, aumUsdM: 17000, price: 58.66, trackedIndex: "Gold spot sample reference" },
  { ...base, symbol: "INRG", name: "Clean energy sample fund", assetClass: "equity", call: "AVOID", terPct: 0.65, aumUsdM: 3100, price: 8.14, trackedIndex: "Clean energy sample index" },
  { ...base, symbol: "V60A", name: "Balanced allocation sample fund", assetClass: "multi_asset", call: "WATCH", terPct: 0.25, aumUsdM: 850, price: 35.48, trackedIndex: "Balanced allocation sample index" },
  { ...base, symbol: "DFND", name: "Defensive strategy sample fund", assetClass: "other", call: "AVOID", terPct: 0.48, aumUsdM: 420, price: 22.31, trackedIndex: "Defensive sample index" },
];
export const sampleEtfRun: EtfRun = { asOf: "2026-10-20", status: "ok", picksCount: sampleEtfPicks.length, verifiedCount: 0 };
export const sampleEtfHistory: Record<string, EtfHistory[]> = Object.fromEntries(sampleEtfPicks.map((pick) => [pick.symbol, [
  { asOf: "2026-10-20", call: pick.call, conviction: pick.conviction, price: pick.price, priceCurrency: pick.priceCurrency },
  { asOf: "2026-10-06", call: "WATCH", conviction: 2, price: pick.price === null ? null : Math.round(pick.price * 0.97 * 100) / 100, priceCurrency: pick.priceCurrency },
]]));
export const sampleEtfOutcomes: EtfOutcome[] = [
  { symbol: "VWRA", horizonDays: 30, entryDate: "2026-08-14", exitDate: "2026-09-13", returnPct: 2.8, benchmarkSymbol: "SPY", benchmarkReturnPct: 2.1, excessPct: 0.7 },
  { symbol: "AGGH", horizonDays: 30, entryDate: "2026-08-14", exitDate: "2026-09-13", returnPct: 0.6, benchmarkSymbol: "SPY", benchmarkReturnPct: 2.1, excessPct: -1.5 },
  { symbol: "VWRA", horizonDays: 60, entryDate: "2026-07-15", exitDate: "2026-09-13", returnPct: 4.2, benchmarkSymbol: "SPY", benchmarkReturnPct: 3.8, excessPct: 0.4 },
];
