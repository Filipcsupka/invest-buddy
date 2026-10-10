import pg from "pg";
import { CapReached, PostgresUsageLedger, type UsageLedger } from "../data/usage";
import { runLoggedJob } from "./job-log";

/**
 * Resumable backfill runner (roadmap D34). A plug-in pulls history one request at a time for each subject (a ticker, a CIK).
 * After every request the runner saves the plug-in's cursor, so a crash, a daily cap or `--max-requests` never restarts from zero.
 * Every request is reserved in the D8 ledger first. Source tasks (D18, D19, D20, EN22) register their own plug-in with `registerBackfillJob`.
 */
export type BackfillStatus = "running" | "paused" | "done" | "failed";
export interface BackfillState { cursor: unknown; status: BackfillStatus; reason: string | null }

export interface BackfillJob {
  name: string;
  /** `data_sources.id` the requests are reserved against. */
  source: string;
  subjects(): Promise<string[]>;
  /** Makes exactly one request, resuming from `cursor` (null on the first call). Returns the new cursor and whether the subject is complete. */
  step(subject: string, cursor: unknown): Promise<{ cursor: unknown; done: boolean }>;
}

export interface BackfillStore {
  /** Takes the single-runner lock for a job. Returns null when another runner holds it; otherwise a function that releases it. */
  lock(job: string): Promise<(() => Promise<void>) | null>;
  load(job: string, subject: string): Promise<BackfillState | null>;
  save(job: string, subject: string, state: BackfillState): Promise<void>;
}

export class MemoryBackfillStore implements BackfillStore {
  readonly rows = new Map<string, BackfillState>();
  private readonly locked = new Set<string>();
  writes = 0;
  async lock(job: string) {
    if (this.locked.has(job)) return null;
    this.locked.add(job);
    return async () => { this.locked.delete(job); };
  }
  async load(job: string, subject: string) { return this.rows.get(`${job}\u0000${subject}`) ?? null; }
  async save(job: string, subject: string, state: BackfillState) { this.writes++; this.rows.set(`${job}\u0000${subject}`, { ...state }); }
}

/** Postgres store. The lock is a session advisory lock on a dedicated connection, so it is released if the process dies. */
export class PostgresBackfillStore implements BackfillStore {
  constructor(private readonly pool: pg.Pool) {}
  async lock(job: string) {
    const client = await this.pool.connect();
    let held = false;
    try {
      const res = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock(hashtext($1)) AS ok", [`backfill:${job}`]);
      held = res.rows[0]?.ok === true;
    } catch (error) { client.release(); throw error; }
    if (!held) { client.release(); return null; }
    return async () => {
      try { await client.query("SELECT pg_advisory_unlock(hashtext($1))", [`backfill:${job}`]); } finally { client.release(); }
    };
  }
  async load(job: string, subject: string) {
    const res = await this.pool.query<{ cursor: unknown; status: BackfillStatus; reason: string | null }>("SELECT cursor, status, reason FROM backfill_state WHERE job=$1 AND subject=$2", [job, subject]);
    return res.rows[0] ? { cursor: res.rows[0].cursor, status: res.rows[0].status, reason: res.rows[0].reason } : null;
  }
  async save(job: string, subject: string, state: BackfillState) {
    await this.pool.query(
      `INSERT INTO backfill_state (job, subject, cursor, status, reason, updated_at) VALUES ($1,$2,$3::jsonb,$4,$5,now())
       ON CONFLICT (job, subject) DO UPDATE SET cursor=EXCLUDED.cursor, status=EXCLUDED.status, reason=EXCLUDED.reason, updated_at=now()`,
      [job, subject, JSON.stringify(state.cursor ?? null), state.status, state.reason]);
  }
}

export interface BackfillOptions {
  only?: string[];
  maxRequests?: number;
  dryRun?: boolean;
  runId?: string | null;
}
export interface BackfillResult {
  status: "completed" | "paused" | "failed" | "locked";
  reason: string | null;
  requests: number;
  subjectsDone: number;
  /** Dry run only: subjects that would be processed, with the cursor they would resume from. */
  plan?: { subject: string; cursor: unknown }[];
}

/** Runs one job. Resumes each subject at its saved cursor, skips finished subjects, stops cleanly at a cap or at `maxRequests`. */
export async function runBackfill(job: BackfillJob, store: BackfillStore, ledger: UsageLedger, options: BackfillOptions = {}): Promise<BackfillResult> {
  if (options.maxRequests !== undefined && (!Number.isInteger(options.maxRequests) || options.maxRequests <= 0)) throw new Error("--max-requests needs a positive whole number");
  let subjects = await job.subjects();
  if (options.only) {
    const unknown = options.only.filter((s) => !subjects.includes(s));
    if (unknown.length) throw new Error(`Unknown subject(s) for ${job.name}: ${unknown.join(", ")}`);
    subjects = subjects.filter((s) => options.only!.includes(s));
  }
  if (options.dryRun) {
    const plan: { subject: string; cursor: unknown }[] = [];
    for (const subject of subjects) {
      const state = await store.load(job.name, subject);
      if (state?.status !== "done") plan.push({ subject, cursor: state?.cursor ?? null });
    }
    return { status: "completed", reason: null, requests: 0, subjectsDone: 0, plan };
  }
  const release = await store.lock(job.name);
  if (!release) return { status: "locked", reason: `another ${job.name} backfill is running`, requests: 0, subjectsDone: 0 };
  let requests = 0, subjectsDone = 0;
  let current: { subject: string; cursor: unknown } | null = null;
  try {
    for (const subject of subjects) {
      const state = await store.load(job.name, subject);
      if (state?.status === "done") continue;
      current = { subject, cursor: state?.cursor ?? null };
      for (;;) {
        if (options.maxRequests !== undefined && requests >= options.maxRequests) {
          const reason = `max requests ${options.maxRequests} reached`;
          await store.save(job.name, subject, { cursor: current.cursor, status: "paused", reason });
          return { status: "paused", reason, requests, subjectsDone };
        }
        try { await ledger.reserve(job.source, 1, { job: `backfill:${job.name}`, runId: options.runId ?? null }); }
        catch (error) {
          if (!(error instanceof CapReached)) throw error;
          await store.save(job.name, subject, { cursor: current.cursor, status: "paused", reason: error.message });
          return { status: "paused", reason: error.message, requests, subjectsDone };
        }
        requests++;
        const next = await job.step(subject, current.cursor);
        current = { subject, cursor: next.cursor };
        await store.save(job.name, subject, { cursor: next.cursor, status: next.done ? "done" : "running", reason: null });
        if (next.done) { subjectsDone++; break; }
      }
    }
    return { status: "completed", reason: null, requests, subjectsDone };
  } catch (error) {
    // A failed step keeps the last good cursor, so the next run retries the same request.
    if (current) await store.save(job.name, current.subject, { cursor: current.cursor, status: "failed", reason: error instanceof Error ? error.constructor.name : "error" }).catch(() => undefined);
    return { status: "failed", reason: error instanceof Error ? error.constructor.name : "error", requests, subjectsDone };
  } finally { await release(); }
}

/** Plug-in registry. Source tasks call `registerBackfillJob` from their own module and import it in `main`'s loader below. */
const registry = new Map<string, () => BackfillJob>();
export function registerBackfillJob(name: string, factory: () => BackfillJob) {
  if (registry.has(name)) throw new Error(`backfill job already registered: ${name}`);
  registry.set(name, factory);
}
export const registeredBackfillJobs = () => [...registry.keys()].sort();

export interface BackfillArgs { job: string; only?: string[]; maxRequests?: number; dryRun: boolean }
const USAGE = "Usage: node dist/jobs/backfill.js --job NAME [--only A,B] [--max-requests N] [--dry-run]";
export function parseBackfillArgs(args: string[]): BackfillArgs {
  const out: BackfillArgs = { job: "", dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--job" || arg === "--only" || arg === "--max-requests") {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(`${arg} needs a value. ${USAGE}`);
      if (arg === "--job") out.job = value;
      else if (arg === "--only") { out.only = value.split(",").map((s) => s.trim()).filter(Boolean); if (!out.only.length) throw new Error(`--only needs a subject list. ${USAGE}`); }
      else { const n = Number(value); if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`--max-requests needs a positive whole number. ${USAGE}`); out.maxRequests = n; }
    } else throw new Error(USAGE);
  }
  if (!out.job) throw new Error(USAGE);
  return out;
}

async function main() {
  const args = parseBackfillArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    if (args.job === "companyfacts") {
      const { createCompanyfactsBackfillJob } = await import("./companyfacts");
      registerBackfillJob("companyfacts", () => createCompanyfactsBackfillJob(pool));
    }
    if (args.job === "form4") {
      const { createForm4BackfillJob, guardForm4Backfill } = await import("./form4");
      guardForm4Backfill();
      registerBackfillJob("form4", () => createForm4BackfillJob(pool));
    }
    const factory = registry.get(args.job);
    if (!factory) throw new Error(`Unknown backfill job: ${args.job}. Registered: ${registeredBackfillJobs().join(", ") || "none"}`);
    const result = await runBackfill(factory(), new PostgresBackfillStore(pool), new PostgresUsageLedger(pool), { only: args.only, maxRequests: args.maxRequests, dryRun: args.dryRun });
    if (result.plan) process.stdout.write(`Backfill ${args.job} (dry run, nothing stored): ${result.plan.length} subject(s) to process\n`);
    else process.stdout.write(`Backfill ${args.job}: ${result.status}, ${result.requests} request(s), ${result.subjectsDone} subject(s) finished${result.reason ? ` (${result.reason})` : ""}\n`);
    if (result.status === "failed") process.exitCode = 1;
    return { requests: result.requests, subjectsDone: result.subjectsDone, status: result.status, failures: result.status === "failed" ? 1 : 0 };
  } finally { await pool.end(); }
}

if (/(?:^|[/\\])backfill\.(?:ts|js)$/.test(process.argv[1] ?? "")) void runLoggedJob("backfill", main);
