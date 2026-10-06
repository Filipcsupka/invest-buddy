import { freshnessDays, type EvidenceRef } from "./evidence";

/** Placeholder: surprise (percent of the estimate) above which the latest quarter counts as an EPS beat. Not checked against InvestingGuide.md yet. Override with EPS_BEAT_MIN_SURPRISE_PCT. */
export const DEFAULT_EPS_BEAT_MIN_SURPRISE_PCT = 0;
export const epsBeatMinSurprisePct = (env: Record<string, string | undefined> = process.env): number => {
  const raw = env.EPS_BEAT_MIN_SURPRISE_PCT;
  const parsed = raw === undefined || raw.trim() === "" ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : DEFAULT_EPS_BEAT_MIN_SURPRISE_PCT;
};

export const EPS_FACT_KEY = "eps_surprise_latest";
export const EPS_SOURCE_NAME = "Alpha Vantage";
/** Value of the `eps_surprise_latest` fact. Alpha Vantage display rights are unverified, so the raw numbers never leave the database. */
export interface EpsSurpriseFact { reportedDate: string; fiscalDateEnding: string | null; reportedEps: number | null; estimatedEps: number | null; surprisePercent: number | null }
export interface EpsResult { value: boolean | null; reason: string; refs: EvidenceRef[] }

const age = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;

/**
 * Deterministic epsBeat from the newest `eps_surprise_latest` fact on or before `asOf`. null: no fact, so the rule does not apply.
 * value null: the fact is outside the 100-day earnings window or has no surprise figure; the rule cannot settle it.
 * The reason names the source and the reporting date but carries no estimate or EPS figure.
 */
export function epsFromFact(fact: { asOf: string; value: unknown } | null, documentUrl: string | null, asOf: string, minSurprisePct = DEFAULT_EPS_BEAT_MIN_SURPRISE_PCT): EpsResult | null {
  if (!fact) return null;
  const v = fact.value as Partial<EpsSurpriseFact> | null;
  const reported = typeof v?.reportedDate === "string" ? v.reportedDate : fact.asOf;
  const days = age(reported, asOf);
  if (!Number.isFinite(days) || days < 0) return null;
  if (days > freshnessDays.epsBeat) return { value: null, reason: `${EPS_SOURCE_NAME} EPS data: latest report ${reported} is older than ${freshnessDays.epsBeat} days`, refs: [] };
  const surprise = v?.surprisePercent;
  if (typeof surprise !== "number" || !Number.isFinite(surprise)) return { value: null, reason: `${EPS_SOURCE_NAME} EPS data: no estimate or surprise for the report of ${reported}`, refs: [] };
  const refs: EvidenceRef[] = documentUrl ? [{ claim: "fundamentals.epsBeat", url: documentUrl, publishedAt: reported, fiscalPeriod: v?.fiscalDateEnding ? `quarter ended ${v.fiscalDateEnding}` : `reported ${reported}` }] : [];
  const threshold = minSurprisePct === 0 ? "the estimate" : `the estimate by more than ${minSurprisePct}%`;
  return surprise > minSurprisePct
    ? { value: true, reason: `${EPS_SOURCE_NAME} EPS data: reported EPS above ${threshold} for the report of ${reported}`, refs }
    : { value: false, reason: `${EPS_SOURCE_NAME} EPS data: reported EPS not above ${threshold} for the report of ${reported}`, refs };
}
