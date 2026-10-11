import pg from "pg";
import { getText } from "../src/collectors/http";
import { requireSecUserAgent } from "../src/collectors/sec-user-agent";
import { refreshMaster } from "../src/data/master-refresh";
import { isKnownInstrument } from "../src/db/universe";
import { changeUniverse, parseChange } from "./universe-change";

/** DS1: promote one stored discovery candidate into the tracked universe. Usage: discovery-promote SYMBOL [--dry-run] */
export function parsePromoteArgs(args: string[]): { symbol: string; dryRun: boolean } {
  const flags = args.filter((arg) => arg.startsWith("--"));
  const rest = args.filter((arg) => !arg.startsWith("--"));
  const symbol = rest[0]?.toUpperCase();
  if (flags.some((flag) => flag !== "--dry-run") || rest.length !== 1 || !symbol || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) throw new Error("Usage: discovery-promote SYMBOL [--dry-run]");
  return { symbol, dryRun: flags.length === 1 };
}

export interface PromoteResult {
  symbol: string; week: string; name: string; sector: string; dryRun: boolean;
  /** False when the ticker was already an active member and only the candidate status changed. */
  addedToUniverse: boolean;
  /** Fields filled in instrument_ids by the SEC refresh, as "field=value". */
  seeded: string[];
  seedFailures: string[];
}

type Db = Pick<pg.Pool, "query" | "connect">;

/**
 * Refuses a symbol with no pending or approved row in discovery_candidates. Otherwise adds the ticker to universe_membership (list discovery,
 * no tier) through the D11 transactional change, seeds instrument_ids and fills CIK and SIC from SEC, then sets the candidate to approved.
 * Each step is safe to repeat, so a failed run can be rerun. A dry run reads only.
 */
export async function promoteCandidate(db: Db, symbol: string, opts: { dryRun: boolean; today: string; get: (url: string) => Promise<string> }): Promise<PromoteResult> {
  const found = await db.query<{ week_start: string; name: string; sector: string; status: string }>(
    `SELECT week_start::text,name,sector,status FROM discovery_candidates WHERE symbol=$1 AND status IN ('pending','approved') ORDER BY week_start DESC LIMIT 1`, [symbol]);
  const row = found.rows[0];
  if (!row) throw new Error(`Unknown candidate ${symbol}: no pending or approved row in discovery_candidates`);
  const member = await isKnownInstrument(db, symbol);
  const result: PromoteResult = { symbol, week: row.week_start, name: row.name, sector: row.sector, dryRun: opts.dryRun, addedToUniverse: !member, seeded: [], seedFailures: [] };
  if (opts.dryRun) return result;
  if (!member) {
    await changeUniverse(db, parseChange(["add", symbol, "--date", opts.today, "--reason", `Approved discovery candidate, week ${row.week_start}`, "--actor", "discovery-promote",
      "--name", row.name, "--sector", row.sector, "--list", "discovery", "--criteria-version", "discovery-v1"]));
  }
  await db.query(`INSERT INTO instrument_ids (ticker,instrument_type,vendor_symbols,valid_from) VALUES ($1,'equity','{}'::jsonb,$2::date)
    ON CONFLICT (ticker) WHERE valid_to IS NULL DO NOTHING`, [symbol, opts.today]);
  try {
    const refresh = await refreshMaster(db, { get: opts.get, today: opts.today, tickers: [symbol] });
    result.seeded = refresh.changes.map((change) => `${change.field}=${change.to ?? "null"}`);
    result.seedFailures = refresh.failures.map((failure) => failure.reason);
  } catch (error) { result.seedFailures = [error instanceof Error ? error.message : String(error)]; }
  await db.query("UPDATE discovery_candidates SET status='approved',reviewed_at=now() WHERE week_start=$1::date AND symbol=$2 AND status='pending'", [row.week_start, symbol]);
  return result;
}

export function nextSteps(result: PromoteResult): string[] {
  if (result.dryRun) return ["Dry run: nothing was written. Run again without --dry-run to promote."];
  const steps = [
    "The weekday chain (collect, prices, daily) now includes the ticker from the next run; no manual job is needed.",
    `Check it after the next daily run: the company page /en/company/${result.symbol} and the alert in the digest.`,
    "Detect puts a discovery-list name with no applied extraction into the gate (unextractedDiscoverySymbols), so extract and judge follow the same path as other names.",
  ];
  if (result.seedFailures.length) steps.unshift(`CIK and SIC were not filled (${result.seedFailures.join("; ")}). Run npm run master:refresh later.`);
  return steps;
}

async function main() {
  const { symbol, dryRun } = parsePromoteArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!dryRun) requireSecUserAgent(process.env.SEC_USER_AGENT);
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await promoteCandidate(pool, symbol, { dryRun, today: new Date().toISOString().slice(0, 10), get: (url) => getText(url) });
    process.stdout.write(`${symbol}: ${dryRun ? "would promote" : "promoted"} ${result.name} (${result.sector}), candidate week ${result.week}${result.addedToUniverse ? "" : ", already in the universe"}\n`);
    if (result.seeded.length) process.stdout.write(`instrument_ids: ${result.seeded.join(", ")}\n`);
    process.stdout.write(`Next steps:\n${nextSteps(result).map((step, i) => `${i + 1}. ${step}`).join("\n")}\n`);
  } finally { await pool.end(); }
}

if (/(?:^|[/\\])discovery-promote\.(?:ts|js)$/.test(process.argv[1] ?? "")) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
