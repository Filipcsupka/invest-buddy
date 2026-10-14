import { runLoggedJob } from "./job-log";
import pg from "pg";
import { createHash } from "node:crypto";
import { scoreAsOf } from "../engine/score-as-of";
import type { UniverseProvider } from "../data/providers";
import { fixtureProvider } from "../data/fixtures";
import type { ScoreRepository, ScoredInstrument, SaveOutcome } from "../db/types";
import { PostgresScoreRepository } from "../db/postgres";
import { MemoryScoreRepository } from "../db/memory";
import { DatabaseUniverseProvider } from "../data/db-provider";
import { SCORE_RULES_VERSION } from "../engine/score";

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export async function runDaily(provider: UniverseProvider, repository: ScoreRepository, asOf?: string, providerName = "fixture"): Promise<SaveOutcome> {
  if (asOf && !validDate(asOf)) throw new Error("Date must be YYYY-MM-DD");
  const instruments = await provider.instruments();
  const inputs = await Promise.all(instruments.map(async (instrument) => {
    const bars = await provider.bars(instrument.ticker);
    const fundamentals = await provider.fundamentals(instrument.ticker);
    const macro = await provider.macro(instrument.ticker);
    return { instrument, bars, fundamentals, macro };
  }));
  const date = asOf ?? (provider instanceof DatabaseUniverseProvider ? await provider.latestScanDate() : inputs[0]?.bars.at(-1)?.date);
  if (!date || !validDate(date)) throw new Error("No valid data date available");
  const records: ScoredInstrument[] = inputs.map(({ instrument, bars, fundamentals, macro }) => {
    const throughDate = bars.filter((bar) => bar.date <= date);
    const result = scoreAsOf({ ticker: instrument.ticker, bars, fundamentals, macro }, date);
    const origin = provider instanceof DatabaseUniverseProvider ? provider.provenance.get(instrument.ticker) : undefined;
    const fingerprint = createHash("sha256").update(JSON.stringify({ consensus: origin?.fingerprintRows ?? { fundamentals, macro }, sources: origin?.sources ?? null, latestBarDate: throughDate.at(-1)?.date ?? null, bars: throughDate, rules: SCORE_RULES_VERSION })).digest("hex");
    return { instrument, fingerprint, consensusRows: origin?.fingerprintRows, result: { ...result, ...(origin ? { scanRunId: Object.values(origin.runIds)[0], scanRunIds: origin.runIds, agreement: origin.agreement, consensusValues: origin.consensusValues, evidenceUrls: origin.evidenceUrls, sources: origin.sources, ...(origin.carriedFrom ? { carriedFrom: origin.carriedFrom, expiredFields: origin.expiredFields ?? [] } : {}) } : {}) } };
  });
  return repository.saveDaily(date, providerName, records);
}

/**
 * Best-effort purge of the web pod's cached reads after the score and portfolio writes.
 * Needs INGEST_BASE_URL (or WEB_BASE_URL) and INGEST_TOKEN. Never throws: the 300 s cache expiry is the fallback.
 */
export async function purgeWebCacheRemote(env: Record<string, string | undefined> = process.env, fetchFn: typeof fetch = fetch): Promise<boolean> {
  const base = env.INGEST_BASE_URL ?? env.WEB_BASE_URL;
  const token = env.INGEST_TOKEN;
  if (!base || !token) { process.stdout.write("Cache purge skipped: INGEST_BASE_URL and INGEST_TOKEN not both set\n"); return false; }
  try {
    const res = await fetchFn(`${base.replace(/\/+$/, "")}/api/revalidate`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ tags: ["scores", "portfolio"] }), signal: AbortSignal.timeout(5000) });
    if (!res.ok) { process.stdout.write(`Cache purge failed: HTTP ${res.status}\n`); return false; }
    process.stdout.write("Cache purged\n");
    return true;
  } catch (error) {
    process.stdout.write(`Cache purge failed: ${error instanceof Error ? error.name : "error"}\n`);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const memory = args.includes("--memory");
  const dateIndex = args.indexOf("--date");
  const date = dateIndex >= 0 ? args[dateIndex + 1] : undefined;
  if (dateIndex >= 0 && !date) throw new Error("--date requires YYYY-MM-DD");
  if (args.some((arg, index) => arg !== "--memory" && arg !== "--date" && index !== dateIndex + 1)) throw new Error("Usage: npm run daily -- [--date YYYY-MM-DD] [--memory]");
  const url = process.env.DATABASE_URL;
  if (!memory && !url) throw new Error("DATABASE_URL is required; use --memory for a fixture-only run");
  const pool = memory ? null : new pg.Pool({ connectionString: url });
  try {
    const fixtureMode = process.env.DATA_MODE === "fixture" || memory;
    const scoreDate = date ?? (fixtureMode ? undefined : await new DatabaseUniverseProvider(pool!).latestScanDate());
    const provider = fixtureMode ? fixtureProvider : new DatabaseUniverseProvider(pool!, scoreDate ?? undefined);
    const result = await runDaily(provider, pool ? new PostgresScoreRepository(pool) : new MemoryScoreRepository(), scoreDate ?? undefined, fixtureMode ? "fixture" : "scan");
    if (pool) await purgeWebCacheRemote();
    process.stdout.write(`${result.inserted ? "Stored" : "Already stored"}: ${result.instrumentCount} instruments, ${result.alerts.length} state changes\n`);
    return { instruments: result.instrumentCount, stateChanges: result.alerts.length, stored: result.inserted, failures: 0 };
  } finally { await pool?.end(); }
}

if (/(?:^|[/\\])daily\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("daily", main);
