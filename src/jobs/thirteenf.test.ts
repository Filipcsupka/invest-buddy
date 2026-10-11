import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseThirteenFArgs } from "./thirteenf";

const root = process.cwd();
const cron = readFileSync(join(root, "deploy/gitops/gitops/apps/invest-buddy/base/thirteenf-cronjob.yaml"), "utf8");

describe("13F job wiring (D22)", () => {
  it("parses dry run, zip and period and rejects anything else", () => {
    expect(parseThirteenFArgs(["--dry-run", "--zip", "/tmp/a.zip", "--period", "2026-09-30"])).toEqual({ dryRun: true, zip: "/tmp/a.zip", period: "2026-09-30" });
    expect(() => parseThirteenFArgs(["--period", "Q3"])).toThrow("Usage");
    expect(() => parseThirteenFArgs(["--force"])).toThrow("Usage");
  });
  it("is built into dist/jobs and checked in the Dockerfile", () => {
    expect(readFileSync(join(root, "package.json"), "utf8")).toContain("src/jobs/thirteenf.ts");
    expect(readFileSync(join(root, "Dockerfile"), "utf8")).toContain("test -f dist/jobs/thirteenf.js");
  });
  it("has suspended CronJobs after the 13F deadlines, listed in the kustomization", () => {
    expect(readFileSync(join(root, "deploy/gitops/gitops/apps/invest-buddy/base/kustomization.yaml"), "utf8")).toContain("thirteenf-cronjob.yaml");
    const docs = cron.split(/^---$/m);
    expect(docs).toHaveLength(2);
    for (const doc of docs) {
      expect(doc).toContain("suspend: true");
      expect(doc).toContain('command: ["node", "dist/jobs/thirteenf.js"]');
    }
    expect(docs[0]).toContain('schedule: "0 8 20 11 *"');
    expect(docs[1]).toContain('schedule: "0 8 16 2 *"');
  });
});
