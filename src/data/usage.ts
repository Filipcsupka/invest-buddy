import type pg from "pg";

/**
 * API usage ledger and guard (roadmap D8). Every request to a metered source is reserved here before it is sent.
 * Caps come from `data_sources` (daily_cap, monthly_cost_cap_eur, D2); usage is written to `api_usage` (migration 025).
 * A reserve that would pass a cap throws CapReached and writes nothing.
 */
export class CapReached extends Error {
  constructor(readonly source: string, readonly reason: "daily_cap" | "reserved_share" | "cost_cap", message: string) { super(message); this.name = "CapReached"; }
}
export class UnknownUsageSource extends Error {
  constructor(readonly source: string) { super(`no data_sources row for ${source}`); this.name = "UnknownUsageSource"; }
}

/** Part of a source's daily cap that only one job may use. Other jobs share what is left: cap minus the share. */
export interface ReservedShare { job: string; requests: number }
/** Twelve Data: 800 requests a day (registry). The prices job needs 37 and keeps 100, so discovery stops at 700. */
export const RESERVED_SHARES: Readonly<Record<string, ReservedShare>> = { twelvedata: { job: "prices", requests: 100 } };

export interface Limits { dailyCap: number | null; monthlyCostCapEur: number | null }
export interface Used { dayTotal: number; dayByShareJob: number; monthCostEur: number }
export interface ReserveOptions {
  job?: string;
  runId?: string | null;
  /** Credits the request costs. Omitted means unknown, stored as NULL and marked unverified. */
  credits?: number | null;
  creditsVerified?: boolean;
  /** Estimated cost in EUR. Above 0 marks a paid call: it needs a monthly_cost_cap_eur that covers it. */
  costEur?: number;
  now?: Date;
}
export interface Reservation { source: string; day: string; requests: number }
export interface UsageLedger { reserve(source: string, n: number, options?: ReserveOptions): Promise<Reservation> }

export const utcDay = (now: Date) => now.toISOString().slice(0, 10);

/** Pure decision. Throws CapReached when the request does not fit. A null daily cap means no daily limit; a null cost cap counts as 0. */
export function checkReserve(source: string, n: number, limits: Limits, used: Used, options: ReserveOptions = {}, share: ReservedShare | undefined = RESERVED_SHARES[source]): void {
  if (!Number.isInteger(n) || n <= 0) throw new Error("reserve needs a positive whole number of requests");
  const job = options.job ?? "unknown";
  const cost = options.costEur ?? 0;
  if (!(cost >= 0) || !Number.isFinite(cost)) throw new Error("costEur must be a non-negative number");
  if (cost > 0 && used.monthCostEur + cost > (limits.monthlyCostCapEur ?? 0))
    throw new CapReached(source, "cost_cap", `${source}: monthly cost cap ${limits.monthlyCostCapEur ?? 0} EUR would be passed (${used.monthCostEur} used, ${cost} requested)`);
  if (limits.dailyCap === null) return;
  if (used.dayTotal + n > limits.dailyCap) throw new CapReached(source, "daily_cap", `${source}: daily cap ${limits.dailyCap} would be passed (${used.dayTotal} used, ${n} requested)`);
  if (share && job !== share.job) {
    const others = used.dayTotal - used.dayByShareJob;
    const allowed = Math.max(0, limits.dailyCap - share.requests);
    if (others + n > allowed) throw new CapReached(source, "reserved_share", `${source}: ${share.requests} requests a day are reserved for ${share.job}; ${job} may use ${allowed} (${others} used, ${n} requested)`);
  }
}

/** Postgres ledger. One transaction per reserve, serialised per source by an advisory lock, so concurrent jobs cannot pass the cap together. */
export class PostgresUsageLedger implements UsageLedger {
  constructor(private readonly pool: pg.Pool) {}
  async reserve(source: string, n: number, options: ReserveOptions = {}): Promise<Reservation> {
    const day = utcDay(options.now ?? new Date());
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`api_usage:${source}`]);
      const limits = await client.query<{ daily_cap: number | null; monthly_cost_cap_eur: string | null }>("SELECT daily_cap, monthly_cost_cap_eur FROM data_sources WHERE id=$1", [source]);
      if (!limits.rows[0]) throw new UnknownUsageSource(source);
      const shareJob = RESERVED_SHARES[source]?.job ?? null;
      const usage = await client.query<{ day_total: string; day_by_share_job: string; month_cost: string }>(
        `SELECT COALESCE(sum(requests) FILTER (WHERE day = $2::date), 0)::text AS day_total,
                COALESCE(sum(requests) FILTER (WHERE day = $2::date AND job = $3), 0)::text AS day_by_share_job,
                COALESCE(sum(est_cost_eur) FILTER (WHERE day >= date_trunc('month', $2::date)::date AND day <= $2::date), 0)::text AS month_cost
         FROM api_usage WHERE source_id = $1 AND day >= date_trunc('month', $2::date)::date`, [source, day, shareJob]);
      const row = usage.rows[0];
      const cap = limits.rows[0].monthly_cost_cap_eur;
      checkReserve(source, n, { dailyCap: limits.rows[0].daily_cap, monthlyCostCapEur: cap === null ? null : Number(cap) },
        { dayTotal: Number(row.day_total), dayByShareJob: Number(row.day_by_share_job), monthCostEur: Number(row.month_cost) }, options);
      await client.query(`INSERT INTO api_usage (source_id, day, requests, credits, credits_basis, est_cost_eur, job, run_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [source, day, n, options.credits ?? null, options.creditsVerified ? "verified" : "unverified", options.costEur ?? 0, options.job ?? "unknown", options.runId ?? null]);
      await client.query("COMMIT");
      return { source, day, requests: n };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }
}

export interface MemoryUsageRow { source: string; day: string; requests: number; credits: number | null; costEur: number; job: string }
/** In-memory ledger for `--memory` runs and tests. Same guard, same limits shape. */
export class MemoryUsageLedger implements UsageLedger {
  readonly rows: MemoryUsageRow[] = [];
  constructor(private readonly limits: Record<string, Limits> = {}) {}
  async reserve(source: string, n: number, options: ReserveOptions = {}): Promise<Reservation> {
    const limits = this.limits[source];
    if (!limits) throw new UnknownUsageSource(source);
    const day = utcDay(options.now ?? new Date());
    const shareJob = RESERVED_SHARES[source]?.job;
    const today = this.rows.filter((row) => row.source === source && row.day === day);
    const sum = (rows: MemoryUsageRow[]) => rows.reduce((total, row) => total + row.requests, 0);
    checkReserve(source, n, limits, {
      dayTotal: sum(today), dayByShareJob: sum(today.filter((row) => row.job === shareJob)),
      monthCostEur: this.rows.filter((row) => row.source === source && row.day.slice(0, 7) === day.slice(0, 7)).reduce((total, row) => total + row.costEur, 0)
    }, options);
    this.rows.push({ source, day, requests: n, credits: options.credits ?? null, costEur: options.costEur ?? 0, job: options.job ?? "unknown" });
    return { source, day, requests: n };
  }
}
