import pg from "pg";
import type { JobCounts } from "./job-log";

export type JobRunStatus = "running" | "ok" | "partial" | "failed";

export interface JobRunStart { runId: string; job: string; startedAt: Date }
export interface JobRunEnd extends JobRunStart { status: Exclude<JobRunStatus, "running">; durationMs: number; counts: JobCounts; maxRssMb: number }

export interface JobRunStore {
  start(run: JobRunStart): Promise<void>;
  finish(run: JobRunEnd): Promise<void>;
  close?(): Promise<void>;
}

/** Writes job_runs through its own small pool, so a slow or missing database cannot hold a job for long. */
export class PgJobRunStore implements JobRunStore {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 3_000, query_timeout: 5_000, idleTimeoutMillis: 1_000 });
    this.pool.on("error", () => undefined);
  }

  async start(run: JobRunStart): Promise<void> {
    await this.pool.query("INSERT INTO job_runs (run_id, job, started_at, status) VALUES ($1, $2, $3, 'running') ON CONFLICT (run_id) DO NOTHING", [run.runId, run.job, run.startedAt]);
  }

  async finish(run: JobRunEnd): Promise<void> {
    // The insert at start may have failed, so the update falls back to an insert and the row still exists.
    await this.pool.query(
      `INSERT INTO job_runs (run_id, job, started_at, ended_at, status, duration_ms, counts, max_rss_mb)
       VALUES ($1, $2, $7, now(), $3, $4, $5::jsonb, $6)
       ON CONFLICT (run_id) DO UPDATE SET ended_at = now(), status = EXCLUDED.status, duration_ms = EXCLUDED.duration_ms, counts = EXCLUDED.counts, max_rss_mb = EXCLUDED.max_rss_mb`,
      [run.runId, run.job, run.status, run.durationMs, JSON.stringify(run.counts), run.maxRssMb, run.startedAt]);
  }

  async close(): Promise<void> {
    try { await this.pool.end(); } catch { /* already closed */ }
  }
}

export function jobRunStoreFromEnv(env: Record<string, string | undefined> = process.env): JobRunStore | null {
  return env.DATABASE_URL ? new PgJobRunStore(env.DATABASE_URL) : null;
}
