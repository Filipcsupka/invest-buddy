import { unstable_cache } from "next/cache";

/** Tags purged by `/api/revalidate` and the ingest routes. */
export const CACHE_TAGS = { scores: "scores", ideas: "ideas", portfolio: "portfolio" } as const;
/** Upper bound on how long a read can lag the database when no purge arrives. Under the 3 day stale() rule. */
export const REVALIDATE_SECONDS = 300;
/** Serialized size budget for the in-process cache. The oldest entries are dropped first. */
export const MEMORY_BUDGET_BYTES = 64 * 1024 * 1024;

interface Entry { value: unknown; at: number; gen: number; bytes: number }
interface State { generations: Map<string, number>; entries: Map<string, Entry>; inflight: Map<string, Promise<unknown>>; bytes: number }

/**
 * One state per process. Next bundles instrumentation, pages and route handlers separately, so module-level maps would
 * not be shared between the start-up warm-up, the pages and the purge route.
 */
const state = (): State => {
  const key = Symbol.for("invest-buddy.web-cache");
  const holder = globalThis as unknown as Record<symbol, State | undefined>;
  return holder[key] ??= { generations: new Map(), entries: new Map(), inflight: new Map(), bytes: 0 };
};
const generation = (tags: readonly string[]) => tags.reduce((sum, tag) => sum + (state().generations.get(tag) ?? 0), 0);
/** Inside the Next server. Unit tests and jobs keep the plain `unstable_cache` path. */
const inNextServer = () => !!process.env.NEXT_RUNTIME;

/** Soft purge: entries with these tags are served once more while one background read replaces them. */
export function markStale(tags: readonly string[]): void {
  const { generations } = state();
  for (const tag of tags) generations.set(tag, (generations.get(tag) ?? 0) + 1);
}

/** Drops every in-process entry. Tests only. */
export function clearWebCache(): void {
  const s = state();
  s.entries.clear(); s.inflight.clear(); s.generations.clear(); s.bytes = 0;
}

function store(key: string, value: unknown, gen: number) {
  const s = state();
  let bytes = 0;
  try { bytes = (JSON.stringify(value) ?? "").length; } catch { return; }
  if (bytes > MEMORY_BUDGET_BYTES) return;
  const old = s.entries.get(key);
  if (old) { s.bytes -= old.bytes; s.entries.delete(key); }
  s.entries.set(key, { value, at: Date.now(), gen, bytes });
  s.bytes += bytes;
  for (const [oldest, entry] of s.entries) {
    if (s.bytes <= MEMORY_BUDGET_BYTES) break;
    s.entries.delete(oldest); s.bytes -= entry.bytes;
  }
}

/**
 * Cross-request cache for public, viewer-independent reads (shared by all viewers).
 * Never wrap a loader that reads a session, cookie or header: the result would be served to everyone.
 * Pages stay dynamic (so no build-time render and no per-viewer HTML is cached); only the data is reused.
 *
 * In the Next server the cache lives in process memory:
 * - concurrent misses for the same key share one loader call (single flight);
 * - an entry older than REVALIDATE_SECONDS, or purged with `markStale`, is still served while one background call
 *   replaces it, so a purge or a 300 s expiry never sends every visitor to the database at once;
 * - a failed background call keeps the old entry and is retried by the next request.
 * Outside the Next server (unit tests, jobs) the read goes through `unstable_cache`, which falls back to the loader.
 * Fixture mode and a `bypass` hit (for example no database pool, so an empty result is not kept) skip the cache.
 */
export function webCached<A extends unknown[], R>(fn: (...args: A) => Promise<R>, key: string, tags: string[], options: { bypass?: () => boolean } = {}): (...args: A) => Promise<R> {
  const cached = unstable_cache(fn, [key], { revalidate: REVALIDATE_SECONDS, tags });
  const readThrough = async (...args: A): Promise<R> => {
    try {
      return await cached(...args);
    } catch (error) {
      // No incremental cache outside the Next runtime. Any other error is the loader's own.
      if (error instanceof Error && /incrementalCache/.test(error.message)) return fn(...args);
      throw error;
    }
  };
  const load = (entryKey: string, args: A): Promise<R> => {
    const s = state();
    const running = s.inflight.get(entryKey);
    if (running) return running as Promise<R>;
    const gen = generation(tags);
    const call = fn(...args).then((value) => { store(entryKey, value, gen); return value; })
      .finally(() => { if (s.inflight.get(entryKey) === call) s.inflight.delete(entryKey); });
    s.inflight.set(entryKey, call);
    return call;
  };
  return async (...args: A) => {
    if (process.env.DATA_MODE === "fixture" || options.bypass?.()) return fn(...args);
    if (!inNextServer()) return readThrough(...args);
    const entryKey = JSON.stringify([key, args]);
    const entry = state().entries.get(entryKey);
    if (!entry) return load(entryKey, args);
    const fresh = Date.now() - entry.at < REVALIDATE_SECONDS * 1000 && entry.gen === generation(tags);
    if (!fresh) load(entryKey, args).catch((error: unknown) => {
      console.warn(JSON.stringify({ event: "web_cache_refresh_failed", key, error: error instanceof Error ? error.name : "unknown" }));
    });
    return entry.value as R;
  };
}
