import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { materialiseOutcomes } from "./outcomes";
import { readRecord } from "../db/track-record";

const bars = (ticker: string, closes: number[]) => closes.map((close, i) => ({ ticker, date: `2026-10-${String(7 + i).padStart(2, "0")}`, close: String(close) }));

/** In-memory stand-in for the four tables the job touches. Inserts honour ON CONFLICT DO NOTHING. */
function fakePool() {
  const outcomes = new Map<string, string[]>();
  const signals = [
    { id: "1", ticker: "WIN", as_of: "2026-10-06", source: "score", tier: "SETUP", state: "Setup met (>=18)", score: 20, reference_close: "100", spy_reference_close: "100" },
    { id: "2", ticker: "LOSE", as_of: "2026-10-06", source: "score", tier: "SETUP", state: "Setup met (>=18)", score: 19, reference_close: "100", spy_reference_close: "100" },
  ];
  const daily = [...bars("WIN", [110, 111, 112, 113, 114]), ...bars("LOSE", [90, 89, 88, 87, 86]), ...bars("SPY", [101, 102, 103, 104, 105])];
  const pool = { query: async (sql: string, params: unknown[] = []) => {
    if (sql.includes("FROM record_snapshots")) return { rows: [{ count: "1", first_date: "2026-10-06", last_date: "2026-10-06" }] };
    if (sql.includes("FROM record_signals")) return { rows: signals };
    if (sql.includes("FROM daily_bars")) return { rows: daily.map(({ ticker, date, close }) => ({ ticker, date, close })) };
    if (sql.includes("FROM record_outcomes")) return { rows: [...outcomes.entries()].map(([key, v]) => { const [id, w] = key.split(":"); return { signal_id: id, window_days: Number(w), exit_date: v[0], stock_return: v[1], spy_return: v[2], excess_return: v[3] }; }) };
    if (sql.includes("INSERT INTO record_outcomes")) {
      const key = `${params[0]}:${params[1]}`;
      if (outcomes.has(key)) return { rows: [], rowCount: 0 };
      outcomes.set(key, [params[2], params[3], params[4], params[5]].map(String));
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`unexpected sql ${sql}`);
  } };
  return { pool: pool as never, outcomes };
}

describe("materialiseOutcomes", () => {
  it("stores each completed window once, a winner and a loser", async () => {
    const { pool, outcomes } = fakePool();
    const first = await materialiseOutcomes(pool, "2026-10-20");
    expect(first).toEqual({ completed: 4, inserted: 4 });
    expect([...outcomes.keys()].sort()).toEqual(["1:1", "1:5", "2:1", "2:5"]);
    const second = await materialiseOutcomes(pool, "2026-10-20");
    expect(second).toEqual({ completed: 4, inserted: 0 });
    expect(outcomes.size).toBe(4);
  });

  it("shows a stored loser in the record, worst first", async () => {
    const { pool } = fakePool();
    await materialiseOutcomes(pool, "2026-10-20");
    const record = await readRecord(pool, "2026-10-20");
    expect(record.worst[0]).toMatchObject({ ticker: "LOSE", window: 5 });
    expect(record.worst.every((item) => item.excess < 0)).toBe(true);
    expect(record.worst.some((item) => item.ticker === "WIN")).toBe(false);
    expect(record.signals.find((s) => s.ticker === "WIN")?.windows[1]?.excess).toBeGreaterThan(0);
  });
});

describe("outcomes CronJob manifest", () => {
  const base = join(process.cwd(), "deploy/gitops/gitops/apps/invest-buddy/base");
  it("ships suspended and is listed in the kustomization", () => {
    expect(readFileSync(join(base, "outcomes-cronjob.yaml"), "utf8")).toContain("suspend: true");
    expect(readFileSync(join(base, "kustomization.yaml"), "utf8")).toContain("- outcomes-cronjob.yaml");
  });
});
