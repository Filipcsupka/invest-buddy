import type pg from "pg";
import { HORIZON_RULES, type HorizonProfile, type HorizonResult } from "@/engine/horizon";

export interface HorizonLabel {
  ticker: string; as_of: string; profile: StoredHorizonProfile; observed_profile: StoredHorizonProfile | null;
  input_values: HorizonResult["values"]; reasons: string[]; horizon_rules_version: string;
  candidate_profile: StoredHorizonProfile | null; candidate_sessions: number; session_date: string | null;
  override_reason: string | null; override_date: string | null;
}
export interface LabelInput { ticker: string; asOf: string; sessionDate: string; result: HorizonResult; filingDate?: string | null }
type Query = Pick<pg.PoolClient, "query">;
export type StoredHorizonProfile = "sustained" | "event_driven" | "mixed" | "no_data";
export const storedProfile = (profile: HorizonProfile): StoredHorizonProfile =>
  profile === "event" ? "event_driven" : profile === "no-data" ? "no_data" : profile;

export async function appendComputed(db: Query, input: LabelInput): Promise<boolean> {
  const previous = (await db.query<HorizonLabel>(
    "SELECT * FROM horizon_labels WHERE ticker=$1 AND kind='computed' AND as_of<$2::date ORDER BY as_of DESC,id DESC LIMIT 1",
    [input.ticker, input.asOf],
  )).rows[0];
  const observed = storedProfile(input.result.profile);
  let profile = previous?.profile ?? observed;
  let candidate: StoredHorizonProfile | null = null;
  let sessions = 0;
  if (previous && observed !== profile) {
    candidate = observed;
    sessions = previous.candidate_profile === observed ? previous.candidate_sessions + ((previous.session_date ?? "") < input.sessionDate ? 1 : 0) : 1;
    const newFiling = !!input.filingDate && (!previous.session_date || input.filingDate > previous.session_date) && input.filingDate <= input.sessionDate;
    if (sessions >= 10 || newFiling) { profile = observed; candidate = null; sessions = 0; }
  }
  const inserted = await db.query(
    `INSERT INTO horizon_labels (ticker,as_of,kind,profile,observed_profile,input_values,reasons,horizon_rules_version,candidate_profile,candidate_sessions,session_date)
     VALUES ($1,$2::date,'computed',$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10::date)
     ON CONFLICT (ticker,as_of) WHERE kind='computed' DO NOTHING RETURNING id`,
    [input.ticker,input.asOf,profile,observed,JSON.stringify(input.result.values),JSON.stringify(input.result.reasons),HORIZON_RULES.version,candidate,sessions,input.sessionDate],
  );
  return inserted.rowCount === 1;
}

export async function appendOverride(db: Query, ticker: string, asOf: string, profile: StoredHorizonProfile, reason: string): Promise<void> {
  if (!reason.trim()) throw new Error("Override reason is required");
  await db.query(
    `INSERT INTO horizon_labels (ticker,as_of,kind,profile,horizon_rules_version,override_reason,override_date)
     VALUES ($1,$2::date,'override',$3,$4,$5,$2::date)`,
    [ticker,asOf,profile,HORIZON_RULES.version,reason.trim()],
  );
}

export async function latestHorizonLabels(db: Query, asOf: string): Promise<HorizonLabel[]> {
  return (await db.query<HorizonLabel>(
    `SELECT c.ticker,c.as_of::text,COALESCE(o.profile,c.profile) AS profile,c.observed_profile,
      c.input_values,c.reasons,c.horizon_rules_version,c.candidate_profile,c.candidate_sessions,
      c.session_date::text,o.override_reason,o.override_date::text
     FROM (SELECT DISTINCT ON (ticker) * FROM horizon_labels WHERE kind='computed' AND as_of<=$1::date ORDER BY ticker,as_of DESC,id DESC) c
     LEFT JOIN LATERAL (
       SELECT profile,override_reason,override_date FROM horizon_labels
       WHERE kind='override' AND ticker=c.ticker AND as_of<=$1::date
       ORDER BY as_of DESC,id DESC LIMIT 1
     ) o ON true ORDER BY c.ticker`, [asOf],
  )).rows;
}
