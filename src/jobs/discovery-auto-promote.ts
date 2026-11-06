import pg from "pg";
import { promoteCandidate } from "../../scripts/discovery-promote";
import { getText } from "../collectors/http";
import { requireSecUserAgent } from "../collectors/sec-user-agent";
import { nameExclusion } from "./discovery-quality";
import { runLoggedJob } from "./job-log";

/**
 * Promotes stored discovery candidates into the tracked universe without the owner command (owner decision 2026-10-20: nothing runs by hand).
 * Only rows from the last 3 weeks that passed the DS1 screen with state Watch or better are taken, best rule score first. Each promotion adds
 * collect, extract and judge cost, so a run takes at most `cap` names and the week at most `weeklyCap`.
 */
export interface AutoPromoteOptions { dryRun: boolean; cap: number; weeklyCap: number }
export const AUTO_ACTOR = "discovery-promote";
export const PROMOTABLE_STATES = ["Watch", "Setup met (>=18)"];

export function parseAutoPromoteArgs(args: string[]): AutoPromoteOptions {
  const out: AutoPromoteOptions = { dryRun: false, cap: 2, weeklyCap: 6 };
  const number = (value: string | undefined) => { const n = Number(value); if (!Number.isInteger(n) || n < 0) throw new Error("Invalid number option"); return n; };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") out.dryRun = true;
    else if (args[i] === "--cap") out.cap = number(args[++i]);
    else if (args[i] === "--weekly-cap") out.weeklyCap = number(args[++i]);
    else throw new Error("Unknown discovery-auto-promote option");
  }
  return out;
}

export interface AutoCandidate { symbol: string; name: string; rule_score: number; rule_state: string; week_start: string }

export async function selectAutoCandidates(db: Pick<pg.Pool, "query">, today: string, cap: number, weeklyCap: number): Promise<AutoCandidate[]> {
  const done = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM universe_membership WHERE added_by=$1 AND valid_from >= date_trunc('week',$2::date)::date AND valid_from <= $2::date`, [AUTO_ACTOR, today]);
  const room = Math.max(0, Math.min(cap, weeklyCap - Number(done.rows[0]?.n ?? 0)));
  if (!room) return [];
  const rows = await db.query<AutoCandidate>(
    `SELECT DISTINCT ON (d.symbol) d.symbol,d.name,d.rule_score,d.rule_state,d.week_start::text
     FROM discovery_candidates d
     WHERE d.status='pending' AND d.week_start >= $1::date - 21 AND d.rule_state = ANY($2)
       AND NOT EXISTS (SELECT 1 FROM universe_membership m WHERE m.ticker=d.symbol AND m.valid_to IS NULL)
     ORDER BY d.symbol, d.week_start DESC`, [today, PROMOTABLE_STATES]);
  return rows.rows.filter(r => !nameExclusion(r.symbol, r.name)).sort((a, b) => b.rule_score - a.rule_score || (a.symbol < b.symbol ? -1 : 1)).slice(0, room);
}

async function main() {
  const options = parseAutoPromoteArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!options.dryRun) requireSecUserAgent(process.env.SEC_USER_AGENT);
  const today = new Date().toISOString().slice(0, 10);
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const picked = await selectAutoCandidates(pool, today, options.cap, options.weeklyCap);
    const promoted: string[] = [], failed: { symbol: string; error: string }[] = [];
    for (const c of picked) {
      if (options.dryRun) { process.stdout.write(`${JSON.stringify({ event: "would_promote", symbol: c.symbol, ruleScore: c.rule_score })}\n`); continue; }
      try { await promoteCandidate(pool, c.symbol, { dryRun: false, today, get: (url) => getText(url) }); promoted.push(c.symbol); }
      catch (error) { failed.push({ symbol: c.symbol, error: error instanceof Error ? error.message : String(error) }); }
    }
    process.stdout.write(`${JSON.stringify({ event: "auto_promote", picked: picked.map(c => c.symbol), promoted, failed })}\n`);
    return { dryRun: options.dryRun, picked: picked.length, promoted: promoted.length, failures: failed.length };
  } finally { await pool.end(); }
}

if (/(?:^|[/\\])discovery-auto-promote\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("discovery-auto-promote", main);
