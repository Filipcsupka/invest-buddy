import { randomUUID } from "node:crypto";
import { jobRunStoreFromEnv, type JobRunStore } from "./job-runs";

export type JobCounts = Record<string, number | boolean | string | null | undefined>;

export interface JobLogOptions {
  /** Where to store the run. Defaults to job_runs through DATABASE_URL; none when DATABASE_URL is unset. */
  store?: JobRunStore | null;
  /** Peak resident memory in MB. Defaults to process.resourceUsage().maxRSS. */
  maxRssMb?: () => number;
}

const defaultMaxRssMb = () => Math.round(process.resourceUsage().maxRSS / 1024);

/** A database failure is logged without the error message and never changes the job's outcome. */
async function store(step: "start" | "finish", job: string, runId: string, action: () => Promise<void>) {
  try { await action(); } catch (error) {
    process.stderr.write(`${JSON.stringify({ event: "job_run_store_failed", step, job, runId, reason: error instanceof Error ? error.name : "error" })}\n`);
  }
}

/** Logs a CLI job's lifecycle without including arguments, environment, request data or error messages. Also stores the run in job_runs. */
export async function runLoggedJob(name: string, run: () => Promise<JobCounts | void>, options: JobLogOptions = {}): Promise<void> {
  const runId = randomUUID();
  const startedAt = new Date();
  const start = performance.now();
  const runs = options.store === undefined ? jobRunStoreFromEnv() : options.store;
  const maxRssMb = options.maxRssMb ?? defaultMaxRssMb;
  process.stdout.write(`${JSON.stringify({ event: "job_start", job: name, runId, timestamp: startedAt.toISOString() })}\n`);
  if (runs) await store("start", name, runId, () => runs.start({ runId, job: name, startedAt }));
  const end = async (status: "ok" | "partial" | "failed", counts: NonNullable<JobCounts>, durationMs: number) => {
    // The exit code is stored (not logged) so a failed run can be told apart by code.
    const stored = process.exitCode ? { ...counts, exitCode: Number(process.exitCode) } : counts;
    if (runs) await store("finish", name, runId, () => runs.finish({ runId, job: name, startedAt, status, durationMs, counts: stored, maxRssMb: maxRssMb() }));
  };
  try {
    const counts = await run();
    const status = process.exitCode ? "failed" : counts?.failures ? "partial" : "ok";
    const durationMs = Math.round(performance.now() - start);
    process.stdout.write(`${JSON.stringify({ event: "job_end", job: name, runId, status, durationMs, counts: counts ?? {} })}\n`);
    await end(status, counts ?? {}, durationMs);
  } catch (error) {
    const stack = error instanceof Error ? error.stack?.split("\n").slice(1).filter((line) => /^\s*at\s/.test(line)).join("\n") : undefined;
    const durationMs = Math.round(performance.now() - start);
    process.stderr.write(`${JSON.stringify({ event: "job_end", job: name, runId, status: "failed", durationMs, counts: {}, failures: 1, stack })}\n`);
    process.exitCode = 1;
    await end("failed", {}, durationMs);
  } finally {
    await runs?.close?.();
  }
}
