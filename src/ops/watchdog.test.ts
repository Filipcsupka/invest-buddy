import { describe, expect, it } from "vitest";
import { ConsoleNotifier, type AlertNotifier } from "../notify/notifier";
import { MemoryAlertState } from "./alert-state";
import { deliver, evaluate, type WatchdogInput } from "./watchdog";
import { databaseSize, expiringCertificates, missedJobs, staleHealth } from "./watchdog-rules";
import { EXPECTED_JOBS } from "./schedule";

const GB = 1_073_741_824;
const d = (iso: string) => new Date(iso);
// Wed 2026-10-14 08:00 local (06:00 UTC). Tue-Sat jobs have started today.
const NOW = d("2026-10-14T06:00:00Z");

/** Every enabled tracked job ran at its latest scheduled start. */
function allGood(now: Date) {
  return new Map(EXPECTED_JOBS.filter((j) => j.enabled && j.runJob).map((j) => [j.runJob!, new Date(now.getTime() - 60_000)]));
}
/** Every tracked job has run once. */
const allKnown = () => new Set(EXPECTED_JOBS.flatMap((j) => (j.runJob ? [j.runJob] : [])));

describe("missed jobs", () => {
  it("is quiet when every enabled tracked job has a recent good run", () => {
    expect(missedJobs(NOW, allGood(NOW), allKnown())).toEqual([]);
  });

  it("reports a job with no good run since its due start", () => {
    const good = allGood(NOW);
    good.set("daily", d("2026-10-13T02:30:00Z")); // yesterday's run; today's 04:25 local start (02:25Z) is due after 70 min grace
    const findings = missedJobs(NOW, good, allKnown());
    expect(findings.map((f) => f.key)).toEqual(["job-missed:daily"]);
    expect(findings[0].body).toContain("2026-10-14T02:25Z");
  });

  it("reports a job with no run at all", () => {
    const good = allGood(NOW);
    good.delete("prices");
    expect(missedJobs(NOW, good, allKnown())[0].body).toContain("none recorded");
  });

  it("does not report a job inside its grace period", () => {
    const good = allGood(NOW);
    good.set("daily", d("2026-10-13T02:30:00Z"));
    // 03:00Z is 35 minutes after the 02:25Z start; grace is 70 minutes.
    expect(missedJobs(d("2026-10-14T03:00:00Z"), good, allKnown()).map((f) => f.key)).not.toContain("job-missed:daily");
  });

  it("ignores suspended jobs and jobs not tracked in job_runs", () => {
    const keys = missedJobs(NOW, new Map(), allKnown()).map((f) => f.key);
    expect(keys).not.toContain("job-missed:retention"); // suspended
    expect(keys).not.toContain("job-missed:extract"); // not in job_runs
    expect(keys).toContain("job-missed:collect");
  });

  it("expects the Monday collect, the daily earnings calendar and the Sunday promotion on a Monday morning", () => {
    const monday = d("2026-10-12T06:00:00Z");
    const good = new Map([...allGood(monday)].map(([k]) => [k, d("2026-10-10T10:00:00Z")]));
    expect(missedJobs(monday, good, allKnown()).map((f) => f.key).sort()).toEqual(["job-missed:collect", "job-missed:earnings-calendar", "job-missed:universe-promote"]);
    good.set("collect", d("2026-10-11T23:20:00Z")); // Monday 01:20 local
    good.set("earnings-calendar", d("2026-10-12T04:50:00Z")); // Monday 06:50 local
    good.set("universe-promote", d("2026-10-11T13:05:00Z")); // Sunday 15:05 local
    expect(missedJobs(monday, good, allKnown())).toEqual([]);
  });
});

describe("stale health dates", () => {
  it("accepts dates within four days and reports older or missing ones", () => {
    expect(staleHealth(NOW, { lastScoreDate: "2026-10-13", lastScanAsOf: "2026-10-10" })).toEqual([]);
    const stale = staleHealth(NOW, { lastScoreDate: "2026-10-08", lastScanAsOf: null });
    expect(stale.map((f) => f.key)).toEqual(["health-stale:score", "health-stale:scan"]);
    expect(stale[0].body).toContain("6 days old");
  });
});

describe("database size", () => {
  it("alerts above 70 percent of the volume", () => {
    expect(databaseSize(3.4 * GB, 5 * GB)).toEqual([]);
    expect(databaseSize(3.6 * GB, 5 * GB)[0].body).toContain("72%");
  });
  it("stays quiet when the volume size is unknown", () => { expect(databaseSize(10 * GB, 0)).toEqual([]); });
});

describe("certificate expiry", () => {
  it("alerts within 14 days, and when the certificate cannot be read", () => {
    expect(expiringCertificates(NOW, [{ host: "a:443", validTo: d("2026-11-14T00:00:00Z") }])).toEqual([]);
    expect(expiringCertificates(NOW, [{ host: "a:443", validTo: d("2026-10-27T00:00:00Z") }])[0].body).toContain("12 days left");
    expect(expiringCertificates(NOW, [{ host: "a:443", validTo: null }])[0].subject).toContain("Cannot read");
  });
});

describe("delivery with duplicate suppression", () => {
  const input = (now: Date, lastGood = allGood(now)): WatchdogInput => ({ now, lastGood, health: { lastScoreDate: "2026-10-13", lastScanAsOf: "2026-10-13" }, dbSizeBytes: 1 * GB, volumeBytes: 5 * GB, certs: [], knownJobs: allKnown() });

  it("sends one alert for a stopped job, none on the next run within 23 hours, one again after", async () => {
    const good = allGood(NOW);
    good.delete("macro");
    const notifier = new ConsoleNotifier();
    const state = new MemoryAlertState();
    const first = await deliver(evaluate(input(NOW, good)), notifier, state, NOW);
    expect(first).toEqual({ findings: 1, sent: 1, suppressed: 0, failures: 0 });
    const noon = d("2026-10-14T10:00:00Z");
    const goodNoon = allGood(noon); goodNoon.delete("macro");
    const second = await deliver(evaluate(input(noon, goodNoon)), notifier, state, noon);
    expect(second).toEqual({ findings: 1, sent: 0, suppressed: 1, failures: 0 });
    const nextDay = d("2026-10-15T06:00:00Z");
    const goodNext = allGood(nextDay); goodNext.delete("macro");
    const third = await deliver(evaluate(input(nextDay, goodNext)), notifier, state, nextDay);
    expect(third.sent).toBe(1);
    expect(notifier.sent).toHaveLength(2);
    expect(notifier.sent[0]).toMatchObject({ channel: "telegram", subject: "Job macro did not complete" });
  });

  it("allows the same alert again after 23 hours, so a daily run a few minutes late is not skipped", async () => {
    const finding = [{ key: "k", subject: "s", body: "b" }];
    const notifier = new ConsoleNotifier();
    const state = new MemoryAlertState();
    await deliver(finding, notifier, state, d("2026-10-14T06:00:00Z"));
    expect((await deliver(finding, notifier, state, d("2026-10-15T04:59:00Z"))).suppressed).toBe(1);
    expect((await deliver(finding, notifier, state, d("2026-10-15T05:00:00Z"))).sent).toBe(1);
  });

  it("releases the claim when the send fails, so the next run tries again", async () => {
    const failing: AlertNotifier = { async send() { throw new Error("down"); } };
    const state = new MemoryAlertState();
    const finding = [{ key: "k", subject: "s", body: "b" }];
    const lines: string[] = [];
    expect(await deliver(finding, failing, state, NOW, (l) => lines.push(l))).toMatchObject({ sent: 0, failures: 1 });
    expect(state.sent.size).toBe(0);
    const ok = new ConsoleNotifier();
    expect(await deliver(finding, ok, state, NOW)).toMatchObject({ sent: 1, failures: 0 });
  });

  it("sends nothing when all is well", async () => {
    const notifier = new ConsoleNotifier();
    expect(await deliver(evaluate(input(NOW)), notifier, new MemoryAlertState(), NOW)).toEqual({ findings: 0, sent: 0, suppressed: 0, failures: 0 });
    expect(notifier.sent).toEqual([]);
  });
});
