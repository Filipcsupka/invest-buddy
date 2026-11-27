import { randomUUID } from "node:crypto";

export function stopJob(exitCode, counts = {}) {
  throw Object.assign(new Error(`Job exited with code ${exitCode}`), { scannerExitCode: exitCode, counts });
}

async function record(baseUrl, token, body) {
  try {
    const response = await fetch(`${baseUrl}/api/ingest/job-runs`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ event: "job_run_store_failed", step: body.action, job: body.job, runId: body.runId, reason: error instanceof Error ? error.name : "error" })}\n`);
  }
}

export async function runScannerJob(job, options, run) {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const start = performance.now();
  const token = process.env.INGEST_TOKEN;
  const store = Boolean(token) && !options.dryRun;
  if (store) await record(options.baseUrl, token, { action: "start", job, runId, startedAt });
  let counts = {}, exitCode = 0;
  try {
    counts = await run() ?? {};
  } catch (error) {
    if (Number.isInteger(error?.scannerExitCode)) {
      exitCode = error.scannerExitCode;
      counts = error.counts ?? {};
    } else {
      console.error(`fatal: ${error?.stack || error?.message || error}`);
      exitCode = 1;
    }
  }
  exitCode ||= process.exitCode || 0;
  const status = exitCode ? "failed" : counts.failures || counts.hadHardError ? "partial" : "ok";
  if (store) await record(options.baseUrl, token, {
    action: "finish", job, runId, startedAt, status, durationMs: Math.round(performance.now() - start),
    counts: { ...counts, ...(exitCode ? { exitCode } : {}) }, maxRssMb: Math.round(process.resourceUsage().maxRSS / 1024),
  });
  if (exitCode) process.exitCode = exitCode;
}
