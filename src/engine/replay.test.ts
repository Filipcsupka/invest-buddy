import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ruleGroups } from "../i18n/rules";
import { absoluteBand, evidencedMaxOf, relativeScore } from "./relative";
import { anyOf } from "./score";

/**
 * EN45 replay: the old absolute rule and the new relative rule applied to stored score audits.
 * fixtures/replay-audits.json is a read-only export of the live score_results audits (2026-10-02 to 2026-10-09), reduced to ticker, date,
 * total, stored state, the ids of matched and unknown rules, and the stored epsBeat and guidanceRaised inputs. The new rule also applies
 * the three-valued earnings rule (rules version 2026-10-11.2): EPS beat or guidance raised is unknown when neither is true and one has no
 * data. The accumulation rule of these older audits read insider data only, so its stored flags are kept as they are.
 * The test prints the band counts per date, old against new, and pins them.
 */
interface ReplayRow { ticker: string; asOf: string; total: number; state: string; matched: string[]; unknown: string[]; epsBeat: boolean | null; guidanceRaised: boolean | null }
const rows = (JSON.parse(readFileSync(join(__dirname, "fixtures", "replay-audits.json"), "utf8")) as { rows: ReplayRow[] }).rows;

const STATES = ["setup", "watch", "wait", "ignore", "broken", "insufficient"] as const;
type State = (typeof STATES)[number];
const KEY: Record<string, State> = { "Setup met (>=18)": "setup", Watch: "watch", Wait: "wait", Ignore: "ignore", "Criteria broken": "broken", "Insufficient/invalid data": "insufficient" };
const rules = ruleGroups.flatMap((group) => group.rules);

function replay(row: ReplayRow) {
  const old = KEY[row.state];
  const earningsUnknown = anyOf(row.epsBeat, row.guidanceRaised) === null;
  const hits = rules.map((rule) => ({ id: rule.id, points: rule.points, matched: row.matched.includes(rule.id), unknown: row.unknown.includes(rule.id) || (rule.id === "earnings" && earningsUnknown) }));
  const relative = relativeScore(row.total, evidencedMaxOf(hits));
  const kept = old === "broken" || old === "insufficient";
  return { old, next: kept ? old : relative.band, incomplete: !kept && relative.incompleteData, relative };
}

function counts(date: string | null) {
  const selected = rows.filter((row) => date === null || row.asOf === date);
  const old = Object.fromEntries(STATES.map((s) => [s, 0])) as Record<State, number>;
  const next = { ...old };
  let incomplete = 0;
  for (const row of selected) {
    const r = replay(row);
    old[r.old]++;
    next[r.next]++;
    if (r.incomplete) incomplete++;
  }
  return { n: selected.length, old: STATES.map((s) => old[s]), next: STATES.map((s) => next[s]), incomplete };
}

const dates = [...new Set(rows.map((row) => row.asOf))].sort();

describe("EN45 replay of stored audits, old rule against new", () => {
  it("the export is consistent with the old absolute rule", () => {
    for (const row of rows) {
      const points = rules.filter((rule) => row.matched.includes(rule.id)).reduce((sum, rule) => sum + rule.points, 0);
      expect(points, `${row.ticker} ${row.asOf}`).toBe(row.total);
      const old = KEY[row.state];
      expect(old, row.state).toBeDefined();
      if (old !== "broken" && old !== "insufficient") expect(absoluteBand(row.total), `${row.ticker} ${row.asOf}`).toBe(old);
    }
  });

  it("prints and pins the band counts per date", () => {
    const head = `| Date | Tickers | ${STATES.map((s) => `${s} old → new`).join(" | ")} | Incomplete data (new) |`;
    const line = (label: string, c: ReturnType<typeof counts>) => `| ${label} | ${c.n} | ${STATES.map((_, i) => `${c.old[i]} → ${c.next[i]}`).join(" | ")} | ${c.incomplete} |`;
    const table = [head, `|${" --- |".repeat(STATES.length + 3)}`, ...dates.map((d) => line(d, counts(d))), line("all", counts(null))].join("\n");
    console.log(`EN45 replay, band counts old → new\n${table}`);
    const pinned: Record<string, { old: number[]; next: number[]; incomplete: number }> = {
      "2026-10-02": { old: [0, 0, 0, 26, 9, 0], next: [0, 17, 0, 9, 9, 0], incomplete: 26 },
      "2026-10-05": { old: [1, 6, 3, 17, 8, 0], next: [4, 8, 4, 11, 8, 0], incomplete: 9 },
      "2026-10-06": { old: [0, 7, 5, 19, 5, 0], next: [3, 9, 6, 13, 5, 0], incomplete: 9 },
      "2026-10-07": { old: [1, 7, 8, 14, 6, 0], next: [4, 10, 9, 7, 6, 0], incomplete: 9 },
      "2026-10-08": { old: [0, 6, 5, 18, 7, 0], next: [4, 8, 5, 12, 7, 0], incomplete: 11 },
      "2026-10-09": { old: [0, 8, 6, 16, 6, 0], next: [4, 9, 8, 9, 6, 0], incomplete: 10 },
    };
    expect(dates).toEqual(Object.keys(pinned));
    for (const d of dates) {
      const c = counts(d);
      expect({ old: c.old, next: c.next, incomplete: c.incomplete }, d).toEqual(pinned[d]);
    }
  });

  it("2026-10-09: the four tickers at 17 of 23 evidenced points reach the top band", () => {
    const top = rows.filter((row) => row.asOf === "2026-10-09" && replay(row).next === "setup").map((row) => row.ticker).sort();
    expect(top).toEqual(["AMD", "DDOG", "NVDA", "SNOW"]);
    for (const row of rows.filter((r) => top.includes(r.ticker) && r.asOf === "2026-10-09")) {
      expect(replay(row).relative).toMatchObject({ evidencedMax: 23, percent: 73.9, incompleteData: false });
    }
  });

  it("never moves a ticker out of broken or insufficient, and never lowers a band except through the guard", () => {
    const order: State[] = ["ignore", "wait", "watch", "setup"];
    for (const row of rows) {
      const r = replay(row);
      if (r.old === "broken" || r.old === "insufficient") expect(r.next).toBe(r.old);
      else if (!r.relative.capped) expect(order.indexOf(r.next), `${row.ticker} ${row.asOf}`).toBeGreaterThanOrEqual(order.indexOf(r.old));
    }
  });

  it("2026-10-09: macro-data had data and was not met for every ticker (a known 0, not unknown)", () => {
    const day = rows.filter((row) => row.asOf === "2026-10-09");
    expect(day).toHaveLength(36);
    expect(day.filter((row) => row.unknown.includes("macro-data"))).toHaveLength(0);
    expect(day.filter((row) => row.matched.includes("macro-data"))).toHaveLength(0);
    expect(day.filter((row) => row.matched.includes("rotation"))).toHaveLength(36);
  });
});
