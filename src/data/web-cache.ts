import { unstable_cache } from "next/cache";

/** Tags purged by `/api/revalidate` and the ingest routes. */
export const CACHE_TAGS = { scores: "scores", ideas: "ideas", portfolio: "portfolio" } as const;
/** Upper bound on how long a read can lag the database when no purge arrives. Under the 3 day stale() rule. */
export const REVALIDATE_SECONDS = 300;

/**
 * Cross-request cache for public, viewer-independent reads (Next data cache, shared by all viewers).
 * Never wrap a loader that reads a session, cookie or header: the result would be served to everyone.
 * Pages stay dynamic (so no build-time render and no per-viewer HTML is cached); only the data is reused.
 * Fixture mode and callers outside a Next request (unit tests, jobs) skip the cache.
 */
export function webCached<A extends unknown[], R>(fn: (...args: A) => Promise<R>, key: string, tags: string[]): (...args: A) => Promise<R> {
  const cached = unstable_cache(fn, [key], { revalidate: REVALIDATE_SECONDS, tags });
  return async (...args: A) => {
    if (process.env.DATA_MODE === "fixture") return fn(...args);
    try {
      return await cached(...args);
    } catch (error) {
      // No incremental cache outside the Next runtime. Any other error is the loader's own.
      if (error instanceof Error && /incrementalCache/.test(error.message)) return fn(...args);
      throw error;
    }
  };
}
