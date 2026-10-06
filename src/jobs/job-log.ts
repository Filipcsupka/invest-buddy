import { randomUUID } from "node:crypto";

export type JobCounts = Record<string, number | boolean | string | null | undefined>;

/** Logs a CLI job's lifecycle without including arguments, environment, request data or error messages. */
export async function runLoggedJob(name: string, run: () => Promise<JobCounts | void>): Promise<void> {
  const runId = randomUUID();
  const start = performance.now();
  process.stdout.write(`${JSON.stringify({ event: "job_start", job: name, runId, timestamp: new Date().toISOString() })}\n`);
  try {
    const counts = await run();
    process.stdout.write(`${JSON.stringify({ event: "job_end", job: name, runId, status: process.exitCode ? "failed" : counts?.failures ? "partial" : "ok", durationMs: Math.round(performance.now() - start), counts: counts ?? {} })}\n`);
  } catch (error) {
    const stack = error instanceof Error ? error.stack?.split("\n").slice(1).filter((line) => /^\s*at\s/.test(line)).join("\n") : undefined;
    process.stderr.write(`${JSON.stringify({ event: "job_end", job: name, runId, status: "failed", durationMs: Math.round(performance.now() - start), counts: {}, failures: 1, stack })}\n`);
    process.exitCode = 1;
  }
}
