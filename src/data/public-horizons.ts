import { cache } from "react";
import { getPool } from "@/db/pool";
import type { StoredHorizonProfile } from "@/db/horizon-labels";
import type { HorizonResult } from "@/engine/horizon";
import { CACHE_TAGS, webCached } from "./web-cache";

export type PublicHorizon = {
  ticker: string;
  profile: StoredHorizonProfile;
  values: HorizonResult["values"];
};

/** Public pages use the last computed observation, never an owner override. */
async function publicHorizonsUncached(): Promise<Record<string, PublicHorizon>> {
  if (process.env.DATA_MODE === "fixture") return {};
  const db = getPool();
  if (!db) return {};
  const { rows } = await db.query<{ ticker: string; observed_profile: StoredHorizonProfile | null; input_values: HorizonResult["values"] | null }>(
    `SELECT DISTINCT ON (ticker) ticker,observed_profile,input_values
     FROM horizon_labels WHERE kind='computed' AND as_of<=CURRENT_DATE
     ORDER BY ticker,as_of DESC,id DESC`,
  );
  return Object.fromEntries(rows.filter((row) => row.observed_profile).map((row) => [row.ticker, {
    ticker: row.ticker, profile: row.observed_profile!, values: row.input_values ?? {},
  }]));
}

export const publicHorizons = cache(webCached(publicHorizonsUncached, "public-horizons", [CACHE_TAGS.scores], { bypass: () => !getPool() }));
