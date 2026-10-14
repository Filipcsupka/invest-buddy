import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_TIME_ZONE, dueStart, EXPECTED_JOBS } from "./schedule";

const base = join(process.cwd(), "deploy/gitops/gitops/apps/invest-buddy/base");
const files = readFileSync(join(base, "kustomization.yaml"), "utf8").split("\n").map((line) => /^\s+-\s+(\S+\.yaml)\s*$/.exec(line)?.[1]).filter((name): name is string => !!name);
const manifest = files.flatMap((file) => readFileSync(join(base, file), "utf8").split(/^---$/m)).filter((doc) => /^kind: CronJob$/m.test(doc)).map((doc) => ({
  name: /^  name: invest-buddy-(\S+)$/m.exec(doc)?.[1] ?? "",
  schedule: /^\s+schedule: "([^"]+)"/m.exec(doc)?.[1] ?? "",
  timeZone: /^\s+timeZone: (\S+)/m.exec(doc)?.[1] ?? DEFAULT_TIME_ZONE,
  suspended: /^\s+suspend: true/m.test(doc),
  deadlineMinutes: Number(/activeDeadlineSeconds: (\d+)/.exec(doc)?.[1]) / 60,
  jobFiles: [...doc.matchAll(/dist\/jobs\/([a-z0-9-]+)\.js/g)].map((m) => m[1]),
  args: /args: \[(.*)\]/.exec(doc)?.[1] ?? "",
}));

describe("expected job schedule", () => {
  it("lists exactly the CronJobs in the manifests", () => {
    expect(EXPECTED_JOBS.map((j) => j.cronJob).sort()).toEqual(manifest.map((m) => m.name).sort());
  });

  for (const job of EXPECTED_JOBS) {
    it(`${job.cronJob} matches its manifest`, () => {
      const m = manifest.find((x) => x.name === job.cronJob);
      expect(m, "manifest entry").toBeDefined();
      expect(job.schedule).toBe(m!.schedule);
      expect(job.timeZone ?? DEFAULT_TIME_ZONE).toBe(m!.timeZone);
      expect(job.enabled).toBe(!m!.suspended);
      expect(job.graceMinutes).toBeGreaterThanOrEqual(m!.deadlineMinutes);
      if (job.runJob) {
        expect(m!.jobFiles).toEqual([job.runJob]);
        expect(m!.args).toBe("");
      } else {
        expect(job.note, "an untracked job says why").toBeTruthy();
      }
    });
  }

  it("does not map one job name to two CronJobs", () => {
    const names = EXPECTED_JOBS.map((j) => j.runJob).filter((n): n is string => !!n);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("dueStart", () => {
  const daily = EXPECTED_JOBS.find((j) => j.cronJob === "daily")!;
  it("is the last start older than the grace period", () => {
    // Daily starts 04:25 local (02:25 UTC on 2026-10-14), grace 70 minutes.
    expect(dueStart(daily, new Date("2026-10-14T03:30:00Z"))?.toISOString()).toBe("2026-10-13T02:25:00.000Z");
    expect(dueStart(daily, new Date("2026-10-14T03:40:00Z"))?.toISOString()).toBe("2026-10-14T02:25:00.000Z");
  });
});
