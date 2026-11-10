import { revalidateTag } from "next/cache";
import { CACHE_TAGS, markStale } from "./web-cache";

/**
 * Marks the cached reads for these tags stale. Never throws.
 * The in-process cache serves the old entry once more while one background read replaces it (no stampede after the
 * post-daily purge). The `unstable_cache` entries expire at once, so that background read reaches the database.
 */
export function purgeWebCache(tags: string[] = [CACHE_TAGS.scores, CACHE_TAGS.ideas, CACHE_TAGS.portfolio]): boolean {
  markStale(tags);
  try {
    for (const tag of tags) revalidateTag(tag, { expire: 0 });
    return true;
  } catch (error) {
    console.warn(JSON.stringify({ event: "cache_purge_failed", tags, error: error instanceof Error ? error.name : "unknown" }));
    return false;
  }
}
