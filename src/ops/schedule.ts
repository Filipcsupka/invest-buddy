import { lastScheduledAt } from "./cron";

/** One CronJob in deploy/gitops/gitops/apps/invest-buddy/base. src/ops/schedule.test.ts compares this list with the manifests, so a CronJob added, renamed, rescheduled, suspended or enabled without an edit here fails the test. */
export interface ExpectedJob {
  /** CronJob name without the "invest-buddy-" prefix. */
  cronJob: string;
  schedule: string;
  /** Defaults to Europe/Bratislava, the zone most manifests set. */
  timeZone?: string;
  /** False while the manifest has suspend: true. */
  enabled: boolean;
  /** The name runLoggedJob stores in job_runs.job. Null when the job is not logged there or shares a name with another CronJob. */
  runJob: string | null;
  /** Minutes after a scheduled start before a missing run is reported. At least the CronJob's activeDeadlineSeconds. The values are guesses until a week of job_runs data exists. */
  graceMinutes: number;
  note?: string;
}

export const EXPECTED_JOBS: ExpectedJob[] = [
  { cronJob: "backup", schedule: "30 2 * * *", enabled: false, runJob: null, graceMinutes: 70, note: "shell script, not logged to job_runs (PL23 prints a JSON line)" },
  { cronJob: "collect", schedule: "0 1 * * 1-6", enabled: true, runJob: "collect", graceMinutes: 40, note: "Monday run stores documents only; detect and extract stay Tue-Sat" },
  { cronJob: "collect-alphavantage", schedule: "0 8 * * 6", enabled: true, runJob: null, graceMinutes: 25, note: "shares the job name collect with the nightly collect" },
  { cronJob: "collect-gdelt", schedule: "5 1 * * 2-6", enabled: false, runJob: null, graceMinutes: 35, note: "shares the job name collect" },
  { cronJob: "detect", schedule: "35 1 * * 2-6", enabled: true, runJob: "detect", graceMinutes: 20 },
  { cronJob: "retention", schedule: "0 3 * * *", enabled: false, runJob: "retention", graceMinutes: 20 },
  { cronJob: "discovery", schedule: "30 9 * * 6", enabled: true, runJob: "discovery", graceMinutes: 40 },
  { cronJob: "watch", schedule: "45 0 * * 2-6", enabled: true, runJob: "watch", graceMinutes: 20 },
  { cronJob: "prices", schedule: "10 0 * * 2-6", enabled: true, runJob: "prices", graceMinutes: 40 },
  { cronJob: "reconcile", schedule: "10 4 * * 2-6", enabled: true, runJob: "reconcile", graceMinutes: 20 },
  { cronJob: "daily", schedule: "25 4 * * 2-6", enabled: true, runJob: "daily", graceMinutes: 70 },
  { cronJob: "portfolio", schedule: "0 6 * * 2-6", timeZone: "UTC", enabled: true, runJob: "portfolio", graceMinutes: 40 },
  { cronJob: "digest", schedule: "30 7 * * 2-6", enabled: true, runJob: "digest", graceMinutes: 40 },
  { cronJob: "dq-corporate-actions", schedule: "15 6 * * 2-6", enabled: false, runJob: "dq-corporate-actions", graceMinutes: 15 },
  { cronJob: "earnings-calendar", schedule: "45 6 * * 0-6", enabled: false, runJob: "earnings-calendar", graceMinutes: 15 },
  { cronJob: "extract", schedule: "50 1 * * 2-6", enabled: true, runJob: null, graceMinutes: 130, note: "scanner script outside runLoggedJob, not in job_runs" },
  { cronJob: "judge", schedule: "30 5 * * 2-6", enabled: true, runJob: null, graceMinutes: 70, note: "scanner script outside runLoggedJob, not in job_runs" },
  { cronJob: "holder-events", schedule: "45 7 * * 2-6", enabled: false, runJob: null, graceMinutes: 25, note: "shares the job name collect" },
  { cronJob: "macro", schedule: "0 4 * * 2-6", enabled: true, runJob: "macro", graceMinutes: 15 },
  { cronJob: "master-refresh", schedule: "0 5 * * 0", enabled: false, runJob: "master-refresh", graceMinutes: 25 },
  { cronJob: "pool-bars", schedule: "30 12 * * 0-6", enabled: true, runJob: null, graceMinutes: 100, note: "not logged to job_runs; writes discovery_price_bars only" },
  { cronJob: "universe-promote", schedule: "0 15 * * 0", enabled: false, runJob: "universe-promote", graceMinutes: 15 },
  { cronJob: "outcomes", schedule: "30 6 * * 2-6", enabled: false, runJob: "outcomes", graceMinutes: 15 },
  { cronJob: "horizon-labels", schedule: "45 6 * * 2-6", enabled: true, runJob: "horizon-labels", graceMinutes: 15 },
  { cronJob: "research-weekly", schedule: "0 1 * * 0", enabled: false, runJob: null, graceMinutes: 50, note: "shell script, not in job_runs" },
  { cronJob: "research-daily", schedule: "40 2 * * 2-6", enabled: false, runJob: null, graceMinutes: 50, note: "shell script, not in job_runs" },
  { cronJob: "research-verify", schedule: "30 3 * * 0-6", enabled: false, runJob: "research-verify", graceMinutes: 25 },
  { cronJob: "research-pipeline-early", schedule: "50 3 * * 0-6", enabled: false, runJob: null, graceMinutes: 30, note: "shares the job name research-pipeline" },
  { cronJob: "research-pipeline", schedule: "40 4 * * 2-6", enabled: false, runJob: null, graceMinutes: 30, note: "shares the job name research-pipeline" },
  { cronJob: "research-notify", schedule: "20 7 * * 2-6", enabled: false, runJob: "research-notify", graceMinutes: 15 },
  { cronJob: "research-deepdive", schedule: "0 0 1 1 *", enabled: false, runJob: null, graceMinutes: 50, note: "shell script, not in job_runs" },
  { cronJob: "review-calendar", schedule: "0 11 * * 6", enabled: true, runJob: null, graceMinutes: 110, note: "several containers, not one job name" },
  { cronJob: "thirteenf-q3", schedule: "0 8 20 11 *", enabled: false, runJob: null, graceMinutes: 70, note: "yearly, shares the job name thirteenf" },
  { cronJob: "thirteenf-q4", schedule: "0 8 16 2 *", enabled: false, runJob: null, graceMinutes: 70, note: "yearly, shares the job name thirteenf" },
  { cronJob: "weekly", schedule: "0 18 * * 0", enabled: false, runJob: "weekly", graceMinutes: 20 },
  { cronJob: "watchdog", schedule: "45 7 * * 1-5", enabled: false, runJob: null, graceMinutes: 15, note: "the watchdog does not watch itself; PL28 adds a dead-man check" },
  { cronJob: "watchdog-noon", schedule: "0 12 * * *", enabled: false, runJob: null, graceMinutes: 15, note: "the watchdog does not watch itself; PL28 adds a dead-man check" },
];

export const DEFAULT_TIME_ZONE = "Europe/Bratislava";

/** The scheduled start a job should already have completed by `now`: the latest start at least graceMinutes ago. */
export function dueStart(job: ExpectedJob, now: Date): Date | null {
  return lastScheduledAt(job.schedule, job.timeZone ?? DEFAULT_TIME_ZONE, new Date(now.getTime() - job.graceMinutes * 60_000));
}
