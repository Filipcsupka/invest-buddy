export interface OHLCV { date: string; open: number; high: number; low: number; close: number; volume: number }
export interface Fundamentals {
  revenueGrowthCurrent: number | null;
  revenueAccelerating?: boolean | null;
  revenueGrowthPrior: number | null;
  revenueDeclining: boolean | null;
  epsBeat: boolean | null;
  guidanceRaised: boolean | null;
  earningsMissAndGuidanceCut: boolean | null;
  productCatalyst: boolean | null;
  insiderOrInstitutionalAccumulation: boolean | null;
  noRevenue: boolean | null;
  memePump: boolean | null;
}
export interface Macro { growthSectorRotation: boolean | null; dataTailwind: boolean | null }
export interface ScoreInputs { ticker: string; bars: OHLCV[]; fundamentals: Fundamentals; macro: Macro }
export interface RuleHit { id: string; label: string; points: number; matched: boolean; detail: string; unknown?: boolean }
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
  /** Relative scoring (EN45). Absent on audits stored before rules version 2026-10-11.1. Points with evidence, out of 25. */
  evidencedMax?: number;
  /** total / evidencedMax in percent, one decimal. */
  percent?: number;
  /** evidencedMax / 25 in percent, one decimal. */
  coverage?: number;
  /** evidencedMax is under 20, so the best state is Watch. */
  incompleteData?: boolean;
  /** Input fields treated as no data because their source is planned (EN45). Absent when none. */
  plannedFields?: string[];
  scanRunId?: string;
  scanRunIds?: Record<string, string>;
  agreement?: Record<string, string>;
  consensusValues?: Record<string, boolean | null>;
  evidenceUrls?: string[];
  /** Per consensus field: where the verified finding comes from. Links only for display-allowed stored documents and public SEC XBRL data. */
  sources?: Record<string, { kind: string; publishedAt: string | null; href: string | null }[]>;
  /** Only with CARRY_FORWARD=on: field to the scan date its value was carried from, and fields that expired to unknown. */
  carriedFrom?: Record<string, string>;
  expiredFields?: string[];
}
