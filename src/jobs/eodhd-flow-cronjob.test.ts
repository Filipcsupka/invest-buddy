import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const docs = readFileSync(join(process.cwd(), "deploy/gitops/flow-cronjob.yaml"), "utf8").split(/^---$/m).filter((doc) => /kind: CronJob/.test(doc));
const name = (doc: string) => /name: invest-buddy-([\w-]+)\n/.exec(doc)![1];

/** Minutes after midnight for each start time of a "M H[,H] * * D" schedule. */
const starts = (doc: string) => {
  const m = /schedule: "(\d+) ([\d,]+) [\d*]+ \* [\d,*-]+"/.exec(doc);
  if (!m) throw new Error(`no schedule for ${name(doc)}`);
  return m[2].split(",").map((hour) => Number(hour) * 60 + Number(m[1]));
};

describe("flow CronJob proposal", () => {
  it("defines the economy, congress, news and sentiment jobs, all suspended", () => {
    expect(docs.map(name)).toEqual(["eodhd-economy-events", "eodhd-economy-ust", "eodhd-economy-indicators", "eodhd-congress", "eodhd-news", "eodhd-sentiment"]);
    for (const doc of docs) expect(doc, name(doc)).toContain("suspend: true");
  });

  it("runs in Europe/Bratislava inside the allowed windows, clear of daily scoring", () => {
    for (const doc of docs) {
      expect(doc).toContain("timeZone: Europe/Bratislava");
      for (const at of starts(doc)) {
        const inNight = at >= 15 && at <= 210, inMorning = at >= 350 && at <= 390;
        expect(inNight || inMorning, `${name(doc)} starts at ${at}`).toBe(true);
      }
    }
  });

  it("runs a built EODHD job with the hardened pod settings and only the two secrets it needs", () => {
    for (const doc of docs) {
      const job = /command: \["node", "dist\/jobs\/(eodhd-[\w-]+)\.js"/.exec(doc)?.[1];
      expect(job && existsSync(join(process.cwd(), "src/jobs", `${job}.ts`)), name(doc)).toBe(true);
      for (const text of ["runAsNonRoot: true", "automountServiceAccountToken: false", "allowPrivilegeEscalation: false", "readOnlyRootFilesystem: true", 'drop: ["ALL"]',
        "type: RuntimeDefault", "concurrencyPolicy: Forbid", "backoffLimit: 0", "name: invest-buddy-eodhd", "key: api-key", "key: DATABASE_URL"]) expect(doc, name(doc)).toContain(text);
      expect(doc).not.toMatch(/value: ["']?[A-Za-z0-9]{20,}/);
    }
  });
});
