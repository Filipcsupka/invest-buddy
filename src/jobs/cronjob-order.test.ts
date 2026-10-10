import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const base = join(process.cwd(), "deploy/gitops/gitops/apps/invest-buddy/base");
const kustomized = readFileSync(join(base, "kustomization.yaml"), "utf8").split("\n").map((line) => /^\s+-\s+(\S+\.yaml)\s*$/.exec(line)?.[1]).filter((name): name is string => !!name);
const files = kustomized;
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
  const chain = ["prices", "collect", "detect", "extract", "macro", "reconcile", "daily", "judge"];
  it("uses the night schedule in Bratislava", () => {
    const expected = ["00:30", "01:00", "01:35", "01:50", "04:00", "04:10", "04:25", "05:30"];
    for (const [index, name] of chain.entries()) {
      const [hour, minute] = expected[index].split(":").map(Number);
      expect(minutes(name).at, name).toBe(hour * 60 + minute);
      expect(job(name), name).toContain("timeZone: Europe/Bratislava");
    }
    expect(minutes("digest")).toEqual({ at: 7 * 60 + 30, days: "2-6" });
  });
  it("runs the scheduled chain in order on the same weekdays", () => {
    const times = chain.map((name) => minutes(name));
    for (let i = 1; i < chain.length; i++) expect(times[i].at, `${chain[i]} after ${chain[i - 1]}`).toBeGreaterThan(times[i - 1].at);
    expect(new Set(times.map((t) => t.days))).toEqual(new Set(["2-6"]));
  });
  it("starts each step after the previous step's job deadline", () => {
    for (let i = 1; i < chain.length; i++) {
      expect(minutes(chain[i]).at, `${chain[i]} after ${chain[i - 1]} deadline`).toBeGreaterThanOrEqual(minutes(chain[i - 1]).at + deadline(chain[i - 1]));
    }
  });
  it("caps the start window so a late start plus the job deadline ends before the next step", () => {
    for (let i = 0; i < chain.length - 1; i++) {
      const [name, next] = [chain[i], chain[i + 1]];
      expect(startWindow(name), `${name} start window`).toBeLessThanOrEqual(5);
      expect(minutes(name).at + startWindow(name) + deadline(name), `${name} latest end vs ${next}`).toBeLessThanOrEqual(minutes(next).at);
    }
    expect(startWindow("judge")).toBeLessThanOrEqual(5);
  });
  it("keeps both AI jobs inside the 00:00 to 07:00 window", () => {
    for (const name of ["extract", "judge"]) {
      expect(minutes(name).at, `${name} starts after midnight`).toBeGreaterThanOrEqual(0);
      expect(minutes(name).at + startWindow(name) + deadline(name), `${name} ends by 07:00`).toBeLessThanOrEqual(7 * 60);
    }
  });
  it("passes the documented models", () => {
    expect(job("extract")).toContain('args: ["--agent", "claude", "--model", "haiku", "--gate-from-db"]');
    expect(job("judge")).toContain('args: ["--model", "sonnet", "--gate-from-db"]');
  });
  it("runs the weekday chain and no longer defines the old scan jobs", () => {
    for (const name of chain) expect(job(name), name).not.toMatch(/^\s{2}suspend: true$/m);
    for (const name of ["scan-claude", "scan-codex"]) expect(job(name), name).toBe("");
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
  it("runs macro after collect and ends it before reconcile starts, hardened like collect", () => {
    const macro = minutes("macro");
    expect(macro.days).toBe("2-6");
    expect(macro.at).toBeGreaterThanOrEqual(minutes("collect").at + deadline("collect"));
    expect(macro.at + startWindow("macro") + deadline("macro")).toBeLessThanOrEqual(minutes("reconcile").at);
    expect(deadline("macro")).toBeLessThanOrEqual(5);
    const doc = job("macro");
    expect(doc).not.toMatch(/^\s{2}suspend: true$/m);
    expect(doc).toContain('command: ["node", "dist/jobs/macro.js"]');
    expect(doc).toContain("name: DATABASE_URL");
    for (const text of ["runAsNonRoot: true", "automountServiceAccountToken: false", "allowPrivilegeEscalation: false", "readOnlyRootFilesystem: true", 'drop: ["ALL"]', "type: RuntimeDefault", "concurrencyPolicy: Forbid"]) expect(doc).toContain(text);
  });
  it("runs the portfolio job and gives it the ingest settings", () => {
    const doc = job("portfolio");
    expect(doc).not.toMatch(/^\s{2}suspend: true$/m);
    expect(doc).toContain("value: http://web.invest.svc.cluster.local:3000");
    expect(doc).toMatch(/name: INGEST_TOKEN\s+valueFrom:\s+secretKeyRef:\s+name: invest-buddy-secrets\s+key: INGEST_TOKEN/);
  });
  it("keeps Saturday's weekly jobs after the weekday chain without overlap", () => {
    expect(minutes("collect-alphavantage")).toEqual({ at: 8 * 60, days: "6" });
    expect(minutes("discovery")).toEqual({ at: 9 * 60 + 30, days: "6" });
    expect(minutes("collect-alphavantage").at + startWindow("collect-alphavantage") + deadline("collect-alphavantage")).toBeLessThanOrEqual(minutes("discovery").at);
    expect(minutes("judge").at + startWindow("judge") + deadline("judge")).toBeLessThanOrEqual(minutes("collect-alphavantage").at);
  });
  it("runs the fixed review after Saturday discovery and caps its work", () => {
    expect(minutes("review-calendar")).toEqual({ at: 11 * 60, days: "6" });
    expect(minutes("discovery").at + startWindow("discovery") + deadline("discovery")).toBeLessThanOrEqual(minutes("review-calendar").at);
    const doc = job("review-calendar");
    expect(doc).toContain("suspend: false");
    expect(doc).toContain("name: AI_DAILY_TOKEN_CEILING");
    expect(doc).toContain('args: ["--agent", "claude", "--model", "haiku", "--review-calendar", "/tmp/review-symbols.json", "--force"]');
    expect(doc).toContain('args: ["--model", "sonnet", "--symbols-file", "/tmp/review-symbols.json", "--force", "--max-symbols", "6"]');
    expect(doc.indexOf("name: extract")).toBeLessThan(doc.indexOf("name: reconcile"));
    expect(doc.indexOf("name: reconcile")).toBeLessThan(doc.indexOf("name: daily"));
    expect(doc.indexOf("name: daily")).toBeLessThan(doc.indexOf("name: judge"));
    for (const text of ["runAsNonRoot: true", "automountServiceAccountToken: false", "allowPrivilegeEscalation: false", "readOnlyRootFilesystem: true", 'drop: ["ALL"]', "type: RuntimeDefault", "concurrencyPolicy: Forbid"]) expect(doc).toContain(text);
  });
  it("runs the digest now that the Telegram secret is set", () => {
    expect(job("digest")).toContain("suspend: false");
    expect(minutes("daily").at + startWindow("daily") + deadline("daily")).toBeLessThanOrEqual(minutes("judge").at);
  });
});

describe("earnings calendar", () => {
  it("is suspended, daily after the judge and before the digest, hardened like collect", () => {
    const doc = job("earnings-calendar");
    expect(doc).toMatch(/^\s{2}suspend: true$/m);
    expect(minutes("earnings-calendar").days).toBe("0-6");
    expect(minutes("judge").at + startWindow("judge") + deadline("judge")).toBeLessThanOrEqual(minutes("earnings-calendar").at);
    expect(minutes("earnings-calendar").at + startWindow("earnings-calendar") + deadline("earnings-calendar")).toBeLessThanOrEqual(minutes("digest").at);
    expect(doc).toContain('command: ["node", "dist/jobs/earnings-calendar.js"]');
    expect(doc).toContain("name: ALPHA_VANTAGE_API_KEY");
    expect(doc).toContain("backoffLimit: 0");
    for (const text of ["runAsNonRoot: true", "automountServiceAccountToken: false", "allowPrivilegeEscalation: false", "readOnlyRootFilesystem: true", 'drop: ["ALL"]', "type: RuntimeDefault", "concurrencyPolicy: Forbid"]) expect(doc).toContain(text);
  });
});

describe("watch step", () => {
  it("polls SEC before collect and long before detect, with no AI and no source keys", () => {
    const watch = minutes("watch");
    expect(watch.days).toBe("2-6");
    expect(watch.at + startWindow("watch") + deadline("watch")).toBeLessThanOrEqual(minutes("collect").at);
    expect(watch.at).toBeLessThan(minutes("detect").at);
    const doc = job("watch");
    expect(doc).not.toMatch(/^\s{2}suspend: true$/m);
    expect(doc).toContain('command: ["node", "dist/jobs/watch.js"]');
    expect(doc).toContain("name: SEC_USER_AGENT");
    expect(doc).not.toContain("FRED_API_KEY");
    for (const text of ["runAsNonRoot: true", "automountServiceAccountToken: false", "allowPrivilegeEscalation: false", "readOnlyRootFilesystem: true", 'drop: ["ALL"]', "type: RuntimeDefault", "concurrencyPolicy: Forbid"]) expect(doc).toContain(text);
  });
});

describe("GDELT collector proposal", () => {
  it("runs before detect and stays suspended for owner review", () => {
    const name = "collect-gdelt";
    expect(minutes(name)).toEqual({ at: 65, days: "2-6" });
    expect(minutes(name).at + startWindow(name) + deadline(name)).toBeLessThanOrEqual(minutes("detect").at);
    const doc = job(name);
    expect(doc).toContain("suspend: true");
    expect(doc).toContain('args: ["--source", "gdelt"]');
    expect(doc).toContain('command: ["node", "dist/jobs/collect.js"]');
    expect(doc).toContain("name: DATABASE_URL");
    expect(doc).not.toContain("name: INGEST_TOKEN");
    for (const text of ["runAsNonRoot: true", "automountServiceAccountToken: false", "allowPrivilegeEscalation: false", "readOnlyRootFilesystem: true", 'drop: ["ALL"]', "type: RuntimeDefault", "concurrencyPolicy: Forbid"]) expect(doc).toContain(text);
  });
});
