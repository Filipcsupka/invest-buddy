import pg from "pg";
import { EodhdClient, EodhdHttpError } from "../data-providers/eodhd/client";
import { logEodhdCalls } from "../db/asset-bars";
import { indexSnapshotsDue, parseIndexFundamentals, saveIndexSnapshot } from "../db/markets";
import { runLoggedJob } from "./job-log";

/** One fundamentals request with filter=General,Components is billed as 10 calls. */
export const SNAPSHOT_CALLS = 10;
export const SNAPSHOT_FILTER = "General,Components";
/** 25 tracked indices at 10 calls each. INDEX_FUNDAMENTALS_MAX_CALLS overrides it; --max-calls overrides both. */
export const DEFAULT_MAX_CALLS = 250;
const DAY = 86_400_000;
export interface IndexFundamentalsArgs { dryRun: boolean; staleDays: number; maxCalls: number; only?: string[] }

export function parseIndexFundamentalsArgs(args: string[], env: Record<string, string | undefined> = process.env): IndexFundamentalsArgs {
  const budget = env.INDEX_FUNDAMENTALS_MAX_CALLS?.trim();
  const out: IndexFundamentalsArgs = { dryRun: false, staleDays: 6, maxCalls: budget ? Number(budget) : DEFAULT_MAX_CALLS };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") out.dryRun = true;
    else if (args[i] === "--stale-days") out.staleDays = Number(args[++i]);
    else if (args[i] === "--max-calls") out.maxCalls = Number(args[++i]);
    else if (args[i] === "--only") out.only = (args[++i] ?? "").split(",").map((symbol) => symbol.trim().toUpperCase()).filter(Boolean);
    else throw new Error(`Unknown index-fundamentals option ${args[i]}`);
  }
  if (!Number.isInteger(out.staleDays) || out.staleDays < 1 || out.staleDays > 365) throw new Error("--stale-days needs 1..365");
  if (!Number.isInteger(out.maxCalls) || out.maxCalls < SNAPSHOT_CALLS || out.maxCalls > 1000) throw new Error(`--max-calls (or INDEX_FUNDAMENTALS_MAX_CALLS) needs ${SNAPSHOT_CALLS}..1000`);
  return out;
}

type Db = Pick<pg.Pool, "query">;
type Api = Pick<EodhdClient, "fundamentals" | "getCallCosts">;

/**
 * Weekly index snapshots: for each tracked index not attempted within `staleDays`, one request for the `General` block and
 * the current constituents with weights. Both are stored under today's date with their provenance. An index without a list
 * (VIX) is recorded as empty and keeps its `General` block. Stops at the call budget, on an access error and on a rate limit
 * (429), which records no attempt so the index stays due.
 */
export async function runIndexFundamentals(db: Db, api: Api | null, options: IndexFundamentalsArgs, today = new Date().toISOString().slice(0, 10)) {
  const staleBefore = new Date(Date.parse(`${today}T00:00:00Z`) - (options.staleDays - 1) * DAY).toISOString().slice(0, 10);
  const due = await indexSnapshotsDue(db, staleBefore, options.only);
  let refreshed = 0, empty = 0, capped = 0, components = 0, weighted = 0;
  const failures: string[] = [];
  const spent = () => api?.getCallCosts().fundamentals ?? 0;
  try {
    if (!options.dryRun && api) for (const [index, symbol] of due.entries()) {
      if (spent() + SNAPSHOT_CALLS > options.maxCalls) { capped = due.length - index; break; }
      let parsed;
      try { parsed = parseIndexFundamentals(await api.fundamentals<unknown>(symbol, SNAPSHOT_FILTER)); }
      catch (error) {
        failures.push(symbol);
        // A rate limit says nothing about this index: leave it and the rest unattempted so the next run retries them first.
        if (error instanceof EodhdHttpError && error.status === 429) { capped = due.length - index - 1; break; }
        await saveIndexSnapshot(db, symbol, today, null, SNAPSHOT_FILTER);
        if (error instanceof EodhdHttpError && [401, 402, 403].includes(error.status)) break;
        continue;
      }
      // An empty array or an unexpected body is an empty snapshot, not a failure: the vendor answered.
      const status = await saveIndexSnapshot(db, symbol, today, parsed ?? { general: null, components: [] }, SNAPSHOT_FILTER);
      if (status === "ok") refreshed++; else empty++;
      components += parsed?.components.length ?? 0;
      weighted += parsed?.components.filter((row) => row.weight !== null).length ?? 0;
    }
  } finally {
    if (spent() > 0) await logEodhdCalls(db, "eodhd-index-fundamentals", spent());
  }
  return { due: due.length, estimatedCalls: due.length * SNAPSHOT_CALLS, budget: options.maxCalls, refreshed, empty, capped, components, weighted,
    failures: failures.length, failedSymbols: failures.join(","), calls: spent() };
}

if (process.argv[1]?.endsWith("eodhd-index-fundamentals.ts") || process.argv[1]?.endsWith("eodhd-index-fundamentals.js")) {
  const options = parseIndexFundamentalsArgs(process.argv.slice(2));
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  void runLoggedJob("eodhd-index-fundamentals", async () => {
    // A retry is another billed request; disable automatic retries so the configured call cap is strict.
    try { const result = await runIndexFundamentals(db, options.dryRun ? null : new EodhdClient({ maxRetries: 0 }), options); if (result.failures) process.exitCode = 1; return result; }
    finally { await db.end(); }
  }, options.dryRun ? { store: null } : {});
}
