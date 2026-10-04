export interface OHLCV { date: string; open: number; high: number; low: number; close: number; volume: number }
export interface Fundamentals {
  revenueGrowthCurrent: number;
  revenueGrowthPrior: number;
  revenueDeclining: boolean;
  epsBeat: boolean;
  guidanceRaised: boolean;
  earningsMissAndGuidanceCut: boolean;
  productCatalyst: boolean;
  insiderOrInstitutionalAccumulation: boolean;
  noRevenue: boolean;
  memePump: boolean;
}
export interface Macro { growthSectorRotation: boolean; dataTailwind: boolean }
export interface ScoreInputs { ticker: string; bars: OHLCV[]; fundamentals: Fundamentals; macro: Macro }
export interface RuleHit { id: string; label: string; points: number; matched: boolean; detail: string }
export type AlertState = "Setup met (>=18)" | "Watch" | "Wait" | "Ignore" | "Criteria broken" | "Insufficient/invalid data";
export interface ScoreResult {
  ticker: string;
  asOf: string;
  technical: number;
  fundamentals: number;
  macro: number;
  total: number;
  state: AlertState;
  pullbackInUptrend: boolean;
  invalidReasons: string[];
  inputs: ScoreInputs;
  ruleHits: RuleHit[];
  rejectionReasons: string[];
}
