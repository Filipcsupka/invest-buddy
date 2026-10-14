import { dueStart, EXPECTED_JOBS, type ExpectedJob } from "./schedule";

/** One thing the owner should hear about. `key` is the duplicate-suppression key. */
export interface Finding { key: string; subject: string; body: string }

const fmt = (d: Date) => d.toISOString().replace(/:\d\d\.\d{3}Z$/, "Z");
const DAY = 86_400_000;

/** Latest ok or partial run start per job_runs.job. */
export type LastGoodRuns = ReadonlyMap<string, Date>;

/** A tracked, enabled job has no ok or partial run since the start it should already have completed. */
export function missedJobs(now: Date, lastGood: LastGoodRuns, jobs: readonly ExpectedJob[] = EXPECTED_JOBS): Finding[] {
  const out: Finding[] = [];
  for (const job of jobs) {
    if (!job.enabled || !job.runJob) continue;
    const due = dueStart(job, now);
    if (!due) continue;
    const last = lastGood.get(job.runJob);
    if (last && last.getTime() >= due.getTime()) continue;
    out.push({
      key: `job-missed:${job.cronJob}`,
      subject: `Job ${job.cronJob} did not complete`,
      body: `No ok or partial run since the scheduled start ${fmt(due)}. Last good run: ${last ? fmt(last) : "none recorded"}.`,
    });
  }
  return out;
}

export interface HealthDates { lastScoreDate: string | null; lastScanAsOf: string | null }

/** Freshness dates from the same queries as /api/health. A date older than maxAgeDays calendar days is stale. The limit covers the Sunday and Monday gap. */
export function staleHealth(now: Date, dates: HealthDates, maxAgeDays = 4): Finding[] {
  const out: Finding[] = [];
  for (const [label, key, value] of [["score", "health-stale:score", dates.lastScoreDate], ["scan", "health-stale:scan", dates.lastScanAsOf]] as const) {
    const ageDays = value ? Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.parse(`${value}T00:00:00Z`)) / DAY) : null;
    if (ageDays !== null && ageDays <= maxAgeDays) continue;
    out.push({ key, subject: `Data is stale: ${label}`, body: value ? `Latest ${label} date is ${value}, ${ageDays} days old (limit ${maxAgeDays}).` : `No ${label} date stored.` });
  }
  return out;
}

/** Database size over a share of the volume. */
export function databaseSize(sizeBytes: number, volumeBytes: number, share = 0.7): Finding[] {
  if (!(volumeBytes > 0) || sizeBytes <= volumeBytes * share) return [];
  const mb = (n: number) => Math.round(n / 1_048_576);
  return [{ key: "db-size", subject: "Database volume is filling up", body: `Database is ${mb(sizeBytes)} MB of ${mb(volumeBytes)} MB (${Math.round((sizeBytes / volumeBytes) * 100)}%, limit ${Math.round(share * 100)}%).` }];
}

export interface CertResult { host: string; validTo: Date | null }

/** A certificate that expires within `days` days, or that could not be read. */
export function expiringCertificates(now: Date, certs: readonly CertResult[], days = 14): Finding[] {
  const out: Finding[] = [];
  for (const cert of certs) {
    if (!cert.validTo) { out.push({ key: `tls:${cert.host}`, subject: `Cannot read the certificate of ${cert.host}`, body: "The TLS handshake failed or returned no certificate." }); continue; }
    const left = (cert.validTo.getTime() - now.getTime()) / DAY;
    if (left <= days) out.push({ key: `tls:${cert.host}`, subject: `Certificate of ${cert.host} expires soon`, body: `Valid until ${fmt(cert.validTo)}, ${Math.floor(left)} days left (limit ${days}).` });
  }
  return out;
}

/** Jobs that ended with exit code 5, the AI token ceiling stop. */
export function aiCeilingStops(jobs: readonly { job: string; startedAt: Date }[]): Finding[] {
  return jobs.map((run) => ({ key: `ai-ceiling:${run.job}`, subject: `Job ${run.job} stopped at the AI token ceiling`, body: `Exit code 5 in the run started ${fmt(run.startedAt)}. Remaining work stays pending.` }));
}
