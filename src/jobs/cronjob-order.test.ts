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
  it("schedules holder events on weekdays after watch, pending owner approval", () => {
    const holder = minutes("holder-events");
    expect(holder.days).toBe("2-6");
    expect(holder.at).toBeGreaterThan(minutes("watch").at);
    expect(job("holder-events")).toContain("suspend: true");
    expect(job("holder-events")).toContain('args: ["--source", "getcurrent"]');
  });
  it("keeps the weekly master refresh suspended, on Sunday, outside the nightly chain", () => {
    const doc = job("master-refresh");
    expect(minutes("master-refresh").days).toBe("0");
    expect(doc).toContain("suspend: true");
    expect(doc).toContain('command: ["node", "dist/jobs/master-refresh.js"]');
    expect(doc).toContain("name: DATABASE_URL");
    expect(doc).toContain("name: SEC_USER_AGENT");
    expect(doc).toContain("activeDeadlineSeconds:");
    for (const text of ["runAsNonRoot: true", "automountServiceAccountToken: false", "allowPrivilegeEscalation: false", "readOnlyRootFilesystem: true", 'drop: ["ALL"]', "type: RuntimeDefault", "concurrencyPolicy: Forbid"]) expect(doc).toContain(text);
    expect(readFileSync(join(base, "kustomization.yaml"), "utf8")).toContain("- master-refresh-cronjob.yaml");
  });
  it("runs pool-bars daily outside every other Twelve Data job's window, within the ledger share", () => {
    const doc = job("pool-bars");
    expect(minutes("pool-bars").days).toBe("0-6");
    expect(doc).toContain("suspend: false");
    expect(doc).toContain('command: ["node", "dist/jobs/pool-bars.js", "--limit", "500", "--size", "3200"]');
    for (const name of ["DATABASE_URL", "SEC_USER_AGENT", "TWELVE_DATA_API_KEY"]) expect(doc).toContain(`name: ${name}`);
    const window = (name: string) => ({ from: minutes(name).at, to: minutes(name).at + startWindow(name) + deadline(name) });
    const pool = window("pool-bars");
    const others = docs.filter((other) => other.includes("TWELVE_DATA_API_KEY")).map((other) => /name: invest-buddy-([\w-]+)\n/.exec(other)![1]).filter((name) => name !== "pool-bars");
    expect(others).toEqual(expect.arrayContaining(["prices", "discovery"]));
    for (const name of others) {
      const other = window(name);
      expect(pool.to <= other.from || pool.from >= other.to, `pool-bars overlaps ${name}`).toBe(true);
    }
    // The run limit at 7 a minute fits the deadline, and with discovery's 60 on Saturday stays inside the 700 a day jobs other than prices may use.
    const limit = Number(/"--limit", "(\d+)"/.exec(doc)?.[1]);
    expect(deadline("pool-bars")).toBeGreaterThanOrEqual(limit / 7);
    expect(limit + 60).toBeLessThanOrEqual(700);
    expect(pool.to).toBeLessThanOrEqual(24 * 60);
    expect(readFileSync(join(base, "kustomization.yaml"), "utf8")).toContain("- pool-bars-cronjob.yaml");
  });
  it("runs the weekly universe promotion on Sunday after pool-bars, database only", () => {
    const doc = job("universe-promote");
    expect(minutes("universe-promote")).toEqual({ at: 15 * 60, days: "0" });
    expect(doc).toContain("suspend: false");
    expect(doc).toContain('command: ["node", "dist/jobs/universe-promote.js"]');
    expect(doc).toContain("name: DATABASE_URL");
    for (const key of ["TWELVE_DATA_API_KEY", "INGEST_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"]) expect(doc).not.toContain(key);
    expect(minutes("pool-bars").at + startWindow("pool-bars") + deadline("pool-bars")).toBeLessThanOrEqual(minutes("universe-promote").at);
    expect(minutes("universe-promote").at + startWindow("universe-promote") + deadline("universe-promote")).toBeLessThanOrEqual(minutes("weekly").at);
    for (const text of ["runAsNonRoot: true", "automountServiceAccountToken: false", "allowPrivilegeEscalation: false", "readOnlyRootFilesystem: true", 'drop: ["ALL"]', "type: RuntimeDefault", "concurrencyPolicy: Forbid"]) expect(doc).toContain(text);
    expect(readFileSync(join(base, "kustomization.yaml"), "utf8")).toContain("- universe-promote-cronjob.yaml");
  });
  it("keeps the weekly Telegram summary suspended, Sunday 18:00 Bratislava, after the Sunday master refresh", () => {
    const doc = job("weekly");
    expect(minutes("weekly")).toEqual({ at: 18 * 60, days: "0" });
    expect(minutes("weekly").at).toBeGreaterThanOrEqual(minutes("master-refresh").at + startWindow("master-refresh") + deadline("master-refresh"));
    expect(doc).toContain("suspend: true");
    expect(doc).toContain("timeZone: Europe/Bratislava");
    expect(doc).toContain('command: ["node", "dist/jobs/weekly.js"]');
    expect(doc).toContain("ghcr.io/filipcsupka/invest-buddy:latest");
    expect(doc).toContain("activeDeadlineSeconds:");
    expect(deadline("weekly")).toBeLessThanOrEqual(15);
    for (const name of ["DATABASE_URL", "DIGEST_LOCALE", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]) expect(doc).toContain(`name: ${name}`);
    expect(doc).toContain("name: invest-buddy-telegram");
    for (const text of ["runAsNonRoot: true", "automountServiceAccountToken: false", "allowPrivilegeEscalation: false", "readOnlyRootFilesystem: true", 'drop: ["ALL"]', "type: RuntimeDefault", "concurrencyPolicy: Forbid"]) expect(doc).toContain(text);
    expect(readFileSync(join(base, "kustomization.yaml"), "utf8")).toContain("- weekly-cronjob.yaml");
  });
  const chain = ["prices", "collect", "detect", "extract", "macro", "reconcile", "daily", "judge"];
  it("uses the night schedule in Bratislava", () => {
    const expected = ["00:10", "01:00", "01:35", "01:50", "04:00", "04:10", "04:25", "05:30"];
    for (const [index, name] of chain.entries()) {
      const [hour, minute] = expected[index].split(":").map(Number);
      expect(minutes(name).at, name).toBe(hour * 60 + minute);
      expect(job(name), name).toContain("timeZone: Europe/Bratislava");
    }
    expect(minutes("digest")).toEqual({ at: 7 * 60 + 30, days: "2-6" });
  });
  it("runs the scheduled chain in order on the same weekdays, with collect also on Monday", () => {
    const times = chain.map((name) => minutes(name));
    for (let i = 1; i < chain.length; i++) expect(times[i].at, `${chain[i]} after ${chain[i - 1]}`).toBeGreaterThan(times[i - 1].at);
    expect(minutes("collect").days).toBe("1-6");
    expect(new Set(chain.filter((name) => name !== "collect").map((name) => minutes(name).days))).toEqual(new Set(["2-6"]));
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
    expect(minutes("discovery")).toEqual({ at: 9 * 60 + 30, days: "0-6" });
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

describe("Monday catch-up", () => {
  const days = (spec: string) => spec === "*" ? [0, 1, 2, 3, 4, 5, 6] : spec.split(",").flatMap((part) => {
    const [from, to] = part.split("-").map(Number);
    return Array.from({ length: (to ?? from) - from + 1 }, (_, i) => from + i);
  });
  const scheduled = docs.flatMap((doc) => {
    const name = /name: invest-buddy-([\w-]+)\n/.exec(doc)?.[1];
    const m = /schedule: "\d+ \d+ \* \* ([\d,*-]+)"/.exec(doc);
    return name && m ? [{ name, days: days(m[1]), active: !/^\s{2}suspend: true\b/m.test(doc) }] : [];
  });
  it("runs only the store-only collect on Monday, apart from daily jobs that open no gate", () => {
    // Detect writes a gate per date and extract reads one pending gate per run, so a Monday gate would push Tuesday's gate to Wednesday.
    // A Monday extract is judged on Tuesday against Friday's scores, and Tuesday's detect skips filings already extracted.
    // These run daily and open no gate: pool-bars (discovery_price_bars), earnings-calendar (one Alpha Vantage request), retention,
    // research-verify (checks stored findings), research-pipeline-early (candidate rows) and discovery-auto-promote (universe rows, from 2026-10-20). None of them calls a model.
    const daily = ["pool-bars", "earnings-calendar", "retention", "research-verify", "research-pipeline-early", "discovery-auto-promote", "discovery", "research-weekly", "research-scout", "research-verify-pm", "research-pipeline-pm"];
    expect(scheduled.filter((job) => job.active && job.days.includes(1) && !daily.includes(job.name)).map((job) => job.name)).toEqual(["collect"]);
    for (const name of ["prices", "watch", "detect", "extract", "macro", "reconcile", "daily", "judge", "digest"]) expect(days(minutes(name).days), name).not.toContain(1);
  });
  it("ends Monday's collect before any later Monday job and keeps it free of AI and price keys", () => {
    const end = minutes("collect").at + startWindow("collect") + deadline("collect");
    expect(end).toBeLessThanOrEqual(minutes("detect").at);
    const doc = job("collect");
    expect(doc).toContain('command: ["node", "dist/jobs/collect.js"]');
    expect(doc).not.toContain("args:");
    for (const key of ["TWELVE_DATA_API_KEY", "INGEST_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"]) expect(doc).not.toContain(key);
  });
});

describe("earnings calendar", () => {
  it("runs daily after the judge and before the digest, hardened like collect", () => {
    const doc = job("earnings-calendar");
    expect(doc).toMatch(/^\s{2}suspend: false$/m);
    expect(minutes("earnings-calendar").days).toBe("0-6");
    expect(minutes("judge").at + startWindow("judge") + deadline("judge")).toBeLessThanOrEqual(minutes("earnings-calendar").at);
    expect(minutes("earnings-calendar").at + startWindow("earnings-calendar") + deadline("earnings-calendar")).toBeLessThanOrEqual(minutes("digest").at);
    expect(doc).toContain('command: ["node", "dist/jobs/earnings-calendar.js"]');
    expect(doc).toContain("name: ALPHA_VANTAGE_API_KEY");
    expect(doc).toContain("backoffLimit: 0");
    for (const text of ["runAsNonRoot: true", "automountServiceAccountToken: false", "allowPrivilegeEscalation: false", "readOnlyRootFilesystem: true", 'drop: ["ALL"]', "type: RuntimeDefault", "concurrencyPolicy: Forbid"]) expect(doc).toContain(text);
  });
});

describe("macro calendar", () => {
  it("runs on weekdays before the judge that reads it, with the contact User-Agent and no metered key", () => {
    const doc = job("macro-calendar");
    expect(doc).toMatch(/^\s{2}suspend: false$/m);
    expect(minutes("macro-calendar").days).toBe("2-6");
    expect(minutes("macro-calendar").at + startWindow("macro-calendar") + deadline("macro-calendar")).toBeLessThanOrEqual(minutes("judge").at);
    expect(doc).toContain('command: ["node", "dist/jobs/macro-calendar.js"]');
    for (const name of ["DATABASE_URL", "SEC_USER_AGENT"]) expect(doc).toContain(`name: ${name}`);
    for (const key of ["TWELVE_DATA_API_KEY", "ALPHA_VANTAGE_API_KEY", "INGEST_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"]) expect(doc).not.toContain(key);
    expect(doc).toContain("backoffLimit: 0");
    for (const text of ["runAsNonRoot: true", "automountServiceAccountToken: false", "allowPrivilegeEscalation: false", "readOnlyRootFilesystem: true", 'drop: ["ALL"]', "type: RuntimeDefault", "concurrencyPolicy: Forbid", "timeZone: Europe/Bratislava"]) expect(doc).toContain(text);
    expect(readFileSync(join(base, "kustomization.yaml"), "utf8")).toContain("- macro-calendar-cronjob.yaml");
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

describe("RS5 research schedule", () => {
  const names = ["weekly", "daily", "verify", "pipeline-early", "pipeline", "notify", "deepdive"];
  it("runs the research CronJobs including notify, except the manual deepdive, with bounded jobs", () => {
    for (const name of names) {
      const doc = job(`research-${name}`);
      expect(doc, name).toContain(["deepdive"].includes(name) ? "suspend: true" : "suspend: false");
      expect(doc, name).toContain("concurrencyPolicy: Forbid");
      expect(doc, name).toContain("backoffLimit: 1");
      expect(deadline(`research-${name}`), name).toBeLessThanOrEqual(["weekly", "daily", "deepdive"].includes(name) ? 40 : 20);
      expect(doc, name).toContain("timeZone: Europe/Bratislava");
    }
  });
  it("passes the kill switch to each model runner", () => {
    for (const name of ["weekly", "daily", "deepdive"]) {
      const doc = job(`research-${name}`);
      expect(doc).toContain("run-research.mjs");
      expect(doc).toContain("name: RESEARCH_ENABLED");
      expect(doc).toContain("key: RESEARCH_ENABLED");
      expect(doc).toContain("key: AI_DAILY_TOKEN_CEILING");
    }
    expect(job("research-weekly")).toContain("--timeout-s 700");
  });
  it("orders the research work around daily score, judge and digest", () => {
    const order = ["research-daily", "research-verify", "research-pipeline-early", "daily", "research-pipeline", "judge", "research-notify", "digest"];
    for (let i = 1; i < order.length; i++) expect(minutes(order[i]).at, order[i]).toBeGreaterThan(minutes(order[i - 1]).at);
    expect(minutes("research-weekly")).toEqual({ at: 60, days: "0-6" });
    expect(minutes("research-daily")).toEqual({ at: 160, days: "2-6" });
    expect(minutes("research-verify").days).toBe("0-6");
    expect(job("research-deepdive")).toContain('schedule: "0 0 1 1 *"');
  });
  it("limits the verifier policy to the verifier pod", () => {
    const policy = readFileSync(join(base, "research-verify-networkpolicy.yaml"), "utf8");
    expect(policy).toContain("kind: NetworkPolicy");
    expect(policy).toContain("app.kubernetes.io/component: research-verify");
    expect(policy).toContain("app: invest-buddy-postgres");
    expect(policy).toContain("port: 5432");
    expect(job("research-verify")).toContain("app.kubernetes.io/component: research-verify");
    for (const name of names.filter((name) => name !== "verify")) expect(job(`research-${name}`)).not.toContain("app.kubernetes.io/component: research-verify");
  });
  it("uses the owner chat for the suspended notify template", () => {
    const doc = job("research-notify");
    expect(doc).toContain("name: TELEGRAM_OWNER_CHAT_ID");
    expect(doc).toContain("name: invest-buddy-telegram-owner");
    expect(doc).toContain("name: TELEGRAM_CARD_MODE");
    expect(doc).toContain("value: owner");
    expect(doc).toContain("name: RESEARCH_PUBLIC_CARDS");
    expect(doc).not.toContain("name: TELEGRAM_CHAT_ID");
  });
});

describe("corporate actions job", () => {
  it("is suspended and reads stored data only", () => {
    const doc = job("dq-corporate-actions");
    expect(doc).toContain("suspend: true");
    expect(doc).toContain('command: ["node", "dist/jobs/dq-corporate-actions.js"]');
    expect(minutes("dq-corporate-actions").at).toBeGreaterThan(minutes("daily").at);
  });
});
