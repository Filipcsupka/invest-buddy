import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const base = join(process.cwd(), "deploy/gitops/gitops/apps/invest-buddy/base");
const files = ["scan-cronjob.yaml", "cronjobs.yaml", "collector-cronjobs.yaml", "extract-judge-cronjobs.yaml", "macro-cronjob.yaml"];
const docs = files.flatMap((file) => readFileSync(join(base, file), "utf8").split(/^---$/m)).filter((doc) => /kind: CronJob/.test(doc));
const job = (name: string) => docs.find((doc) => new RegExp(`name: invest-buddy-${name}\\n`).test(doc)) ?? "";
const minutes = (name: string) => {
  const m = /schedule: "(\d+) (\d+) \* \* ([\d,-]+)"/.exec(job(name));
  if (!m) throw new Error(`no schedule for ${name}`);
  return { at: Number(m[2]) * 60 + Number(m[1]), days: m[3] };
};
const deadline = (name: string) => Number(/activeDeadlineSeconds: (\d+)/.exec(job(name))?.[1]) / 60;
const startWindow = (name: string) => Number(/startingDeadlineSeconds: (\d+)/.exec(job(name))?.[1]) / 60;

describe("daily pipeline order", () => {
  const chain = ["collect", "detect", "extract", "macro", "reconcile", "daily", "judge"];
  it("runs the scheduled chain in order on the same weekdays", () => {
    const times = chain.map((name) => minutes(name));
    for (let i = 1; i < chain.length; i++) expect(times[i].at, `${chain[i]} after ${chain[i - 1]}`).toBeGreaterThan(times[i - 1].at);
    expect(new Set(times.map((t) => t.days))).toEqual(new Set(["2-6"]));
  });
  it("starts each step after the previous step's job deadline", () => {
    for (let i = 1; i < chain.length - 1; i++) {
      expect(minutes(chain[i]).at, `${chain[i]} after ${chain[i - 1]} deadline`).toBeGreaterThanOrEqual(minutes(chain[i - 1]).at + deadline(chain[i - 1]));
    }
  });
  it("caps the start window so a late start plus the job deadline ends before the next step", () => {
    for (const [name, next] of [["collect", "detect"], ["detect", "extract"], ["extract", "macro"], ["macro", "reconcile"], ["reconcile", "daily"], ["daily", "judge"]]) {
      expect(startWindow(name), `${name} start window`).toBeLessThanOrEqual(5);
      expect(minutes(name).at + startWindow(name) + deadline(name), `${name} latest end vs ${next}`).toBeLessThanOrEqual(minutes(next).at);
    }
    expect(startWindow("judge")).toBeLessThanOrEqual(5);
  });
  it("keeps reconcile and daily suspended until SEC_USER_AGENT is set and extract runs", () => {
    for (const name of ["reconcile", "daily"]) expect(job(name), name).toMatch(/^\s{2}suspend: true$/m);
  });
  it("passes the documented models", () => {
    expect(job("extract")).toContain('args: ["--agent", "claude", "--model", "haiku", "--gate-from-db"]');
    expect(job("judge")).toContain('args: ["--model", "sonnet", "--gate-from-db"]');
  });
  it("keeps the new and unfinished steps suspended, and the old web-search scans too", () => {
    for (const name of ["collect", "detect", "extract", "judge", "scan-claude", "scan-codex"]) expect(job(name), name).toMatch(/^\s{2}suspend: true$/m);
  });
  it("hardens extract and judge like the scan job", () => {
    for (const name of ["extract", "judge"]) {
      const doc = job(name);
      expect(doc).toContain("runAsNonRoot: true");
      expect(doc).toContain("runAsUser: 10001");
      expect(doc).toContain("automountServiceAccountToken: false");
      expect(doc).toContain("allowPrivilegeEscalation: false");
      expect(doc).toContain("readOnlyRootFilesystem: true");
      for (const mount of ["/tmp", "/home/scanner", "/app/scanner/out"]) expect(doc).toContain(`mountPath: ${mount}`);
      expect(doc).toContain('drop: ["ALL"]');
      expect(doc).toContain("type: RuntimeDefault");
      expect(doc).toContain("concurrencyPolicy: Forbid");
      expect(doc).toContain("name: INGEST_TOKEN");
      expect(doc).toContain("ghcr.io/filipcsupka/invest-buddy-scanner:latest");
    }
    expect(job("extract")).toContain('command: ["node", "/app/scanner/run-extract.mjs"]');
    expect(job("judge")).toContain('command: ["node", "/app/scanner/run-judge.mjs"]');
  });
  it("lists the new files in the kustomization", () => {
    const kustomization = readFileSync(join(base, "kustomization.yaml"), "utf8");
    expect(kustomization).toContain("- extract-judge-cronjobs.yaml");
    expect(kustomization).toContain("- macro-cronjob.yaml");
  });
  it("runs macro after collect and ends it before reconcile starts, suspended and hardened like collect", () => {
    const macro = minutes("macro");
    expect(macro.days).toBe("2-6");
    expect(macro.at).toBeGreaterThanOrEqual(minutes("collect").at + deadline("collect"));
    expect(macro.at + startWindow("macro") + deadline("macro")).toBeLessThanOrEqual(minutes("reconcile").at);
    expect(deadline("macro")).toBeLessThanOrEqual(5);
    const doc = job("macro");
    expect(doc).toMatch(/^\s{2}suspend: true$/m);
    expect(doc).toContain('command: ["node", "dist/jobs/macro.js"]');
    expect(doc).toContain("name: DATABASE_URL");
    for (const text of ["runAsNonRoot: true", "automountServiceAccountToken: false", "allowPrivilegeEscalation: false", "readOnlyRootFilesystem: true", 'drop: ["ALL"]', "type: RuntimeDefault", "concurrencyPolicy: Forbid"]) expect(doc).toContain(text);
  });
  it("keeps the portfolio job suspended and gives it the ingest settings", () => {
    const doc = job("portfolio");
    expect(doc).toMatch(/^\s{2}suspend: true$/m);
    expect(doc).toContain("value: http://web.invest.svc.cluster.local:3000");
    expect(doc).toMatch(/name: INGEST_TOKEN\s+valueFrom:\s+secretKeyRef:\s+name: invest-buddy-secrets\s+key: INGEST_TOKEN/);
  });
});
