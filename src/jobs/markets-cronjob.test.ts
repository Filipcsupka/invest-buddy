import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const base = join(process.cwd(), "deploy/gitops/gitops/apps/invest-buddy/base");
const docs = readFileSync(join(base, "markets-cronjob.yaml"), "utf8").split(/^---$/m);
const job = (name: string) => docs.find((doc) => new RegExp(`name: invest-buddy-${name}\\n`).test(doc)) ?? "";
const schedule = (doc: string) => {
  const m = /schedule: "(\d+) (\d+) \* \* ([\d*,-]+)"/.exec(doc);
  if (!m) throw new Error("no schedule");
  return { at: Number(m[2]) * 60 + Number(m[1]), days: m[3] };
};
const seconds = (doc: string, key: string) => Number(new RegExp(`${key}: (\\d+)`).exec(doc)?.[1]);
const names = ["eodhd-market-bars-index", "eodhd-market-bars-fx", "eodhd-market-bars-crypto", "eodhd-index-components", "eodhd-market-cap", "eodhd-screener"];

describe("market view CronJobs", () => {
  it("lists every job once, suspended, in the kustomization", () => {
    expect(docs).toHaveLength(names.length);
    expect(readFileSync(join(base, "kustomization.yaml"), "utf8")).toContain("- markets-cronjob.yaml");
    for (const name of names) {
      const doc = job(name);
      expect(doc, name).toMatch(/^\s{2}suspend: true$/m);
      for (const text of ["timeZone: Europe/Bratislava", "concurrencyPolicy: Forbid", "backoffLimit: 0", "runAsNonRoot: true", "automountServiceAccountToken: false", "allowPrivilegeEscalation: false",
        "readOnlyRootFilesystem: true", 'drop: ["ALL"]', "type: RuntimeDefault", "name: invest-buddy-eodhd", "key: api-key", "key: DATABASE_URL"]) expect(doc, `${name}: ${text}`).toContain(text);
      const script = /dist\/jobs\/([\w-]+)\.js/.exec(doc)?.[1];
      expect(existsSync(join(process.cwd(), "src/jobs", `${script}.ts`)), name).toBe(true);
    }
  });
  it("runs inside 00:15-03:30 or 05:50-06:30 Bratislava, clear of the 04:00-04:25 scoring chain", () => {
    for (const name of names) {
      const doc = job(name);
      const { at } = schedule(doc);
      const end = at + seconds(doc, "startingDeadlineSeconds") / 60 + seconds(doc, "activeDeadlineSeconds") / 60;
      const night = at >= 15 && end <= 3 * 60 + 30;
      const morning = at >= 5 * 60 + 50 && end <= 6 * 60 + 30;
      expect(night || morning, `${name} ${at}-${end}`).toBe(true);
    }
  });
  it("fetches fx and crypto every day and index bars after each US session", () => {
    expect(schedule(job("eodhd-market-bars-fx")).days).toBe("*");
    expect(schedule(job("eodhd-market-bars-crypto")).days).toBe("*");
    expect(schedule(job("eodhd-market-bars-index")).days).toBe("2-6");
    for (const [name, cls] of [["eodhd-market-bars-index", "index"], ["eodhd-market-bars-fx", "fx"], ["eodhd-market-bars-crypto", "crypto"]]) expect(job(name)).toContain(`"--class", "${cls}"`);
  });
  it("keeps the two Sunday jobs apart and the weekly market cap batch bounded", () => {
    const components = job("eodhd-index-components"), marketCap = job("eodhd-market-cap");
    expect(schedule(components).days).toBe("0");
    expect(schedule(marketCap).days).toBe("0");
    expect(schedule(components).at + seconds(components, "startingDeadlineSeconds") / 60 + seconds(components, "activeDeadlineSeconds") / 60).toBeLessThanOrEqual(schedule(marketCap).at);
    expect(marketCap).toContain('"--max-symbols", "80"');
  });
});
