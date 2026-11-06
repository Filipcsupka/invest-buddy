import pg from "pg";
import { EodhdClient, EodhdHttpError } from "../data-providers/eodhd/client";
import { logEodhdCalls } from "../db/asset-bars";
import { componentsDue, parseComponents, saveComponents } from "../db/markets";
import { runLoggedJob } from "./job-log";

/** A fundamentals request with filter=Components is billed as 10 calls, like any fundamentals request. */
export const COMPONENT_CALLS = 10;
const DAY = 86_400_000;
export interface IndexComponentsArgs { dryRun: boolean; staleDays: number; maxCalls: number; only?: string[] }

export function parseIndexComponentsArgs(args: string[]): IndexComponentsArgs {
  const out: IndexComponentsArgs = { dryRun: false, staleDays: 28, maxCalls: 300 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") out.dryRun = true;
    else if (args[i] === "--stale-days") out.staleDays = Number(args[++i]);
    else if (args[i] === "--max-calls") out.maxCalls = Number(args[++i]);
    else if (args[i] === "--only") out.only = (args[++i] ?? "").split(",").map((symbol) => symbol.trim().toUpperCase()).filter(Boolean);
    else throw new Error(`Unknown index-components option ${args[i]}`);
  }
  if (!Number.isInteger(out.staleDays) || out.staleDays < 1 || out.staleDays > 365) throw new Error("--stale-days needs 1..365");
  if (!Number.isInteger(out.maxCalls) || out.maxCalls < COMPONENT_CALLS || out.maxCalls > 1000) throw new Error(`--max-calls needs ${COMPONENT_CALLS}..1000`);
  return out;
}

type Db = Pick<pg.Pool, "query">;
type Api = Pick<EodhdClient, "fundamentals" | "getCallCosts">;

/** Stores the constituent list of each tracked index not attempted within `staleDays`. Indices without a list are recorded as empty. */
export async function runIndexComponents(db: Db, api: Api | null, options: IndexComponentsArgs, today = new Date().toISOString().slice(0, 10)) {
  const staleBefore = new Date(Date.parse(`${today}T00:00:00Z`) - (options.staleDays - 1) * DAY).toISOString().slice(0, 10);
  const due = await componentsDue(db, staleBefore, options.only);
  let refreshed = 0, rows = 0, empty = 0, capped = 0;
  const failures: string[] = [];
  const spent = () => api?.getCallCosts().fundamentals ?? 0;
  try {
    if (!options.dryRun && api) for (const [index, symbol] of due.entries()) {
      if (spent() + COMPONENT_CALLS > options.maxCalls) { capped = due.length - index; break; }
      let parsed;
      try { parsed = parseComponents(await api.fundamentals<unknown>(symbol, "Components")); }
      catch (error) {
        failures.push(symbol);
        await saveComponents(db, symbol, today, null);
        if (error instanceof EodhdHttpError && [401, 402, 403].includes(error.status)) break;
        continue;
      }
      const saved = await saveComponents(db, symbol, today, parsed);
      rows += saved;
      if (saved) refreshed++; else empty++;
    }
  } finally {
    if (spent() > 0) await logEodhdCalls(db, "eodhd-index-components", spent());
  }
  return { due: due.length, estimatedCalls: due.length * COMPONENT_CALLS, refreshed, empty, capped, rows, failures: failures.length, failedSymbols: failures.join(","), calls: spent() };
}

if (process.argv[1]?.endsWith("eodhd-index-components.ts") || process.argv[1]?.endsWith("eodhd-index-components.js")) {
  const options = parseIndexComponentsArgs(process.argv.slice(2));
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  void runLoggedJob("eodhd-index-components", async () => {
    try { const result = await runIndexComponents(db, options.dryRun ? null : new EodhdClient(), options); if (result.failures) process.exitCode = 1; return result; }
    finally { await db.end(); }
  }, options.dryRun ? { store: null } : {});
}
