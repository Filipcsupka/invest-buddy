import pg from "pg";
import type { OHLCV } from "../engine/types";
import { REVENUE_CONCEPTS } from "../collectors/sources/frames";
import { lastCompletedSession, previousSession } from "../data/trading-calendar";
import { COLLECT_ONLY_LIST } from "../db/universe";
import { planPromotions, PROMOTE, weekStartOf, type PromotePlan } from "../universe/promote";
import { CRITERIA_VERSION, revenueGrowth } from "../universe/select";
import { DQ_THRESHOLDS } from "./dq";
import { runLoggedJob } from "./job-log";

/**
 * D36 promotion job: moves `extended` names with 10 clean sessions (D16) to `core`, at most PROMOTE.weeklyCap a week, in growth order.
 * The database change is the one `scripts/universe-change.ts` makes for remove plus add: `valid_to` on the extended row, a new core row from
 * the same date, and the instrument source set to `guide`. Both run in one transaction per name. `--dry-run` prints the plan and writes nothing.
 */
export interface PromoteOptions { dryRun: boolean; cap: number }

export function parsePromoteArgs(args: string[]): PromoteOptions {
  const out: PromoteOptions = { dryRun: false, cap: PROMOTE.weeklyCap };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") out.dryRun = true;
    else if (args[i] === "--cap") {
      const value = Number(args[++i]);
      if (!Number.isInteger(value) || value < 0) throw new Error("Invalid --cap");
      out.cap = value;
    } else throw new Error("Unknown universe-promote option");
  }
  return out;
}

/** The last `count` completed sessions, newest last. */
export function recentSessions(asOf: string, count: number): string[] {
  const out = [asOf];
  while (out.length < count) out.unshift(previousSession(out[0]));
  return out;
}

export async function loadPlan(db: Pick<pg.Pool, "query">, today: string, asOf: string, cap: number): Promise<PromotePlan> {
  const members = await db.query<{ ticker: string; name: string; valid_from: string }>(
    `SELECT m.ticker, i.name, m.valid_from::text FROM universe_membership m JOIN instruments i ON i.ticker=m.ticker
     WHERE m.list=$1 AND m.valid_to IS NULL AND m.valid_from <= $2::date ORDER BY m.ticker`, [COLLECT_ONLY_LIST, today]);
  const tickers = members.rows.map((r) => r.ticker);
  const bars = await db.query<{ ticker: string; bar_date: string; open: string; high: string; low: string; close: string; volume: string }>(
    `SELECT ticker, bar_date::text, open, high, low, close, volume FROM daily_bars
     WHERE ticker = ANY($1) AND bar_date <= $2::date AND bar_date >= $2::date - $3::int ORDER BY ticker, bar_date`, [tickers, asOf, DQ_THRESHOLDS.lookbackDays]);
  const barMap = new Map<string, OHLCV[]>();
  for (const r of bars.rows) (barMap.get(r.ticker) ?? barMap.set(r.ticker, []).get(r.ticker)!).push({ date: r.bar_date, open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close), volume: Number(r.volume) });
  // Same three-month revenue facts as scripts/select-universe.ts, so the order matches the selection's growth rank.
  const rev = await db.query<{ ticker: string; concept: string; period_end: string; value: string }>(
    `SELECT DISTINCT ON (ticker,concept,period_end) ticker,concept,period_end::text,value::text FROM fundamentals_pit
     WHERE ticker = ANY($1) AND taxonomy='us-gaap' AND unit='USD' AND concept=ANY($2) AND filed<=$3::date AND period_start IS NOT NULL AND period_end-period_start BETWEEN 80 AND 100
     ORDER BY ticker,concept,period_end,filed DESC`, [tickers, [...REVENUE_CONCEPTS], today]);
  const revMap = new Map<string, Map<string, { periodEnd: string; value: number }[]>>();
  for (const r of rev.rows) {
    const byConcept = revMap.get(r.ticker) ?? revMap.set(r.ticker, new Map()).get(r.ticker)!;
    (byConcept.get(r.concept) ?? byConcept.set(r.concept, []).get(r.concept)!).push({ periodEnd: r.period_end, value: Number(r.value) });
  }
  const growth = (ticker: string) => {
    const concepts = [...(revMap.get(ticker)?.entries() ?? [])].sort(([a, x], [b, y]) => y.length - x.length || (a < b ? -1 : 1));
    return revenueGrowth(concepts[0]?.[1] ?? []).yoyGrowthPct;
  };
  const done = await db.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM universe_membership WHERE added_by=$1 AND list='core' AND valid_from >= $2::date AND valid_from <= $3::date",
    [PROMOTE.actor, weekStartOf(today), today]);
  return planPromotions(members.rows.map((m) => ({ ticker: m.ticker, name: m.name, validFrom: m.valid_from, bars: barMap.get(m.ticker) ?? [], yoyGrowthPct: growth(m.ticker) })),
    recentSessions(asOf, PROMOTE.cleanSessions), { today, alreadyThisWeek: Number(done.rows[0]?.n ?? 0), cap });
}

/** Ends the extended row and opens a core row from `date`. Skips (returns false) when the name is no longer an active extended member. */
export async function promoteToCore(db: Pick<pg.Pool, "connect">, change: { ticker: string; date: string; reason: string }): Promise<boolean> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`universe:${change.ticker}`]);
    const current = await client.query<{ id: string; list: string; tier: number | null; valid_from: string }>(
      "SELECT id,list,tier,valid_from::text FROM universe_membership WHERE ticker=$1 AND valid_to IS NULL FOR UPDATE", [change.ticker]);
    const row = current.rows[0];
    if (current.rows.length !== 1 || row.list !== COLLECT_ONLY_LIST || change.date <= row.valid_from) { await client.query("ROLLBACK"); return false; }
    await client.query("UPDATE universe_membership SET valid_to=$2,removed_reason=$3,removed_by=$4 WHERE id=$1", [row.id, change.date, "promoted to core", PROMOTE.actor]);
    await client.query("UPDATE instruments SET source='guide' WHERE ticker=$1", [change.ticker]);
    await client.query(`INSERT INTO universe_membership(ticker,list,tier,valid_from,reason,criteria_version,added_by)
      VALUES ($1,'core',$2,$3,$4,$5,$6)`, [change.ticker, row.tier, change.date, change.reason, CRITERIA_VERSION, PROMOTE.actor]);
    await client.query("COMMIT");
    return true;
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
  finally { client.release(); }
}

async function main() {
  const options = parsePromoteArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const now = new Date();
  const today = now.toISOString().slice(0, 10), asOf = lastCompletedSession(now);
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const plan = await loadPlan(pool, today, asOf, options.cap);
    const reason = `D36 promote: ${PROMOTE.cleanSessions} clean sessions (D16) to ${asOf}, criteria ${CRITERIA_VERSION}`;
    let promoted = 0;
    for (const p of plan.promote) {
      if (options.dryRun) { process.stdout.write(`${JSON.stringify({ event: "would_promote", ticker: p.ticker, yoyGrowthPct: p.yoyGrowthPct })}\n`); continue; }
      if (await promoteToCore(pool, { ticker: p.ticker, date: today, reason })) {
        promoted++;
        process.stdout.write(`${JSON.stringify({ event: "promoted", ticker: p.ticker, yoyGrowthPct: p.yoyGrowthPct })}\n`);
      }
    }
    return { asOf, dryRun: options.dryRun, extended: plan.eligible.length + plan.waiting.length, eligible: plan.eligible.length, alreadyThisWeek: plan.alreadyThisWeek, cap: plan.cap,
      planned: plan.promote.length, promoted };
  } finally { await pool.end(); }
}

if (/(?:^|[/\\])universe-promote\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("universe-promote", main);
