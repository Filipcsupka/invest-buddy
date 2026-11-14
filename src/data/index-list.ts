import { cache } from "react";
import { getPool } from "@/db/pool";
import { pageScoreRow } from "@/db/universe";
import { indexListModels } from "@/db/markets";
import { rateIndex, type IndexRatingResult, type VolatilityRegimeLabel } from "@/markets/index-rating";
import type { IndexPriceAnalytics } from "@/markets/index-analytics";
import { CACHE_TAGS, webCached } from "@/data/web-cache";

export type IndexListRating = Pick<IndexRatingResult, "kind" | "band" | "score" | "basisText" | "coveragePct" | "asOf"> & { regime: VolatilityRegimeLabel | null };
export interface IndexListEntry { symbol: string; country: string | null; price: IndexPriceAnalytics; rating: IndexListRating | null }

async function loadIndexListEntries(symbols: string[]): Promise<IndexListEntry[]> {
  return (await indexListModels(symbols)).map((model) => {
    const result = model.inputs ? rateIndex(model.inputs) : null;
    return { symbol: model.symbol, country: model.country, price: model.analytics.price,
      rating: result ? { kind: result.kind, band: result.band, score: result.score, basisText: result.basisText, coveragePct: result.coveragePct,
        asOf: result.asOf, regime: result.volatilityRegime?.label ?? null } : null };
  });
}

// The stamp only keys the cache entry; the loader reads the current rows.
const cachedEntries = webCached((symbols: string[], stamp: string) => { void stamp; return loadIndexListEntries(symbols); }, "index-list-v1", [CACHE_TAGS.scores], { bypass: () => !getPool() });

/**
 * Index list ratings, shared by every viewer: only composites, no factor details and no per-stock states. The entry is
 * cached per data date (`stamp`: latest rule state date, latest constituent attempt and each index's latest bar date), so
 * a new scan, list or bar day starts a fresh read; the web cache's 300 s refresh covers fundamentals that arrive between.
 */
export const indexListEntries = cache((symbols: string[], stamp: string): Promise<IndexListEntry[]> => cachedEntries(symbols, stamp));

/** The data date part of the list cache key: one small query over two indexed maxima. */
export async function indexListStamp(db = getPool()): Promise<string> {
  if (!db) return "";
  const row = (await db.query<{ scores: string | null; lists: string | null }>(`SELECT
    (SELECT max(r.as_of) FROM score_results r WHERE ${pageScoreRow("r")})::text AS scores,
    (SELECT max(attempted_at) FROM index_component_refresh)::text AS lists`)).rows[0];
  return `${row?.scores ?? ""}|${row?.lists ?? ""}`;
}
