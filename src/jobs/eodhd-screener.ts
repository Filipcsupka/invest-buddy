import pg from "pg";
import { EodhdClient, EodhdHttpError } from "../data-providers/eodhd/client";
import { logEodhdCalls } from "../db/asset-bars";
import { mapScreenerRows, saveScreenerRun, screenerRunExists } from "../db/screener";
import { SCREENER_PRESETS, type ScreenerPreset } from "../db/screener-presets";
import { runLoggedJob } from "./job-log";

/** One /screener request is billed as 5 calls (vendor documentation). */
export const SCREENER_CALLS = 5;
export interface ScreenerArgs { dryRun: boolean; force: boolean; only?: string[]; maxCalls: number }

export function parseScreenerArgs(args: string[]): ScreenerArgs {
  const out: ScreenerArgs = { dryRun: false, force: false, maxCalls: 100 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") out.dryRun = true;
    else if (args[i] === "--force") out.force = true;
    else if (args[i] === "--only") out.only = (args[++i] ?? "").split(",").map((id) => id.trim()).filter(Boolean);
    else if (args[i] === "--max-calls") out.maxCalls = Number(args[++i]);
    else throw new Error(`Unknown screener option ${args[i]}`);
  }
  if (!Number.isInteger(out.maxCalls) || out.maxCalls < SCREENER_CALLS || out.maxCalls > 1000) throw new Error(`--max-calls needs ${SCREENER_CALLS}..1000`);
  const unknown = out.only?.filter((id) => !SCREENER_PRESETS.some((preset) => preset.id === id)) ?? [];
  if (unknown.length) throw new Error(`Unknown screener preset ${unknown.join(",")}`);
  return out;
}

type Db = Pick<pg.Pool, "query">;
type Api = Pick<EodhdClient, "screener" | "getCallCosts">;

/**
 * Runs each preset once a day and stores its rows. A preset already stored for `today` is skipped unless --force.
 * The run stops before a request would pass the call cap, and on 401, 402 or 403.
 */
export async function runScreener(db: Db, api: Api | null, options: ScreenerArgs, today = new Date().toISOString().slice(0, 10), transact: <T>(fn: (tx: Db) => Promise<T>) => Promise<T> = (fn) => fn(db)) {
  const presets: ScreenerPreset[] = SCREENER_PRESETS.filter((preset) => !options.only || options.only.includes(preset.id));
  let stored = 0, rows = 0, skipped = 0, capped = 0;
  const failures: string[] = [];
  const spent = () => api?.getCallCosts().screener ?? 0;
  try {
    if (!options.dryRun && api) for (const [index, preset] of presets.entries()) {
      if (!options.force && await screenerRunExists(db, preset.id, today)) { skipped++; continue; }
      if (spent() + SCREENER_CALLS > options.maxCalls) { capped = presets.length - index; break; }
      try {
        const page = await api.screener({ filters: JSON.stringify(preset.filters), signals: preset.signals, sort: preset.sort, limit: preset.limit });
        if (!page || !Array.isArray(page.data)) throw new Error("EODHD screener: response has no data array");
        const mapped = mapScreenerRows(page.data);
        rows += await transact((tx) => saveScreenerRun(tx, preset, today, mapped));
        stored++;
      } catch (error) {
        failures.push(preset.id);
        if (error instanceof EodhdHttpError && [401, 402, 403].includes(error.status)) break;
      }
    }
  } finally {
    if (spent() > 0) await logEodhdCalls(db, "eodhd-screener", spent());
  }
  return { presets: presets.length, estimatedCalls: presets.length * SCREENER_CALLS, stored, skipped, capped, rows, failures: failures.length, failedPresets: failures.join(","), calls: spent() };
}

if (process.argv[1]?.endsWith("eodhd-screener.ts") || process.argv[1]?.endsWith("eodhd-screener.js")) {
  const options = parseScreenerArgs(process.argv.slice(2));
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const transact = async <T>(fn: (tx: Db) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    try { await client.query("BEGIN"); const out = await fn(client); await client.query("COMMIT"); return out; }
    catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  };
  void runLoggedJob("eodhd-screener", async () => {
    try { const result = await runScreener(pool, options.dryRun ? null : new EodhdClient(), options, undefined, transact); if (result.failures) process.exitCode = 1; return result; }
    finally { await pool.end(); }
  }, options.dryRun ? { store: null } : {});
}
