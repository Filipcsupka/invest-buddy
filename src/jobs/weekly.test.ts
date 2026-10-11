import { describe, expect, it } from "vitest";
import { deliverWeekly, loadWeeklyRows } from "./weekly";
import { MemoryDeliveryLog } from "../db/notifications";
import type { WeeklyRow } from "../notify/weekly";

const rows: WeeklyRow[] = [{ ticker: "NVDA", state: "Setup met (>=18)", points: 19, previous: { state: "Watch", points: 16 } }];

describe("deliverWeekly", () => {
  const sent: string[] = [];
  const notifier = { send: async (text: string) => { sent.push(text); } };
  const base = { rows, locale: "sk" as const, notifier, target: "@invest_test", adviceOutput: false, site: "https://x.test" };

  it("posts once per ISO week and language, even on another day of the same week", async () => {
    sent.length = 0;
    const log = new MemoryDeliveryLog();
    expect(await deliverWeekly({ ...base, asOf: "2026-10-09", log })).toEqual({ sent: 1, duplicates: 0 });
    expect(await deliverWeekly({ ...base, asOf: "2026-10-09", log })).toEqual({ sent: 0, duplicates: 1 });
    expect(await deliverWeekly({ ...base, asOf: "2026-10-11", log })).toEqual({ sent: 0, duplicates: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("https://x.test/sk/company/NVDA");
    expect([...log.keys]).toEqual(["telegram|@invest_test|2026-10-05|weekly:sk"]);
  });

  it("posts again next week and in the other language", async () => {
    sent.length = 0;
    const log = new MemoryDeliveryLog();
    await deliverWeekly({ ...base, asOf: "2026-10-09", log });
    expect((await deliverWeekly({ ...base, asOf: "2026-10-16", log })).sent).toBe(1);
    expect((await deliverWeekly({ ...base, locale: "en", asOf: "2026-10-16", log })).sent).toBe(1);
    expect(sent).toHaveLength(3);
  });

  it("releases the claim when the send fails, so the next run retries", async () => {
    const log = new MemoryDeliveryLog();
    const failing = { send: async () => { throw new Error("telegram down"); } };
    await expect(deliverWeekly({ ...base, notifier: failing, asOf: "2026-10-09", log })).rejects.toThrow("telegram down");
    expect(log.keys.size).toBe(0);
    sent.length = 0;
    expect((await deliverWeekly({ ...base, asOf: "2026-10-09", log })).sent).toBe(1);
  });
});

describe("loadWeeklyRows", () => {
  it("reads the latest score and the score at least 7 days earlier from score_results", async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const pool = { query: async (sql: string, params: unknown[]) => { calls.push({ sql, params }); return { rows: [
      { ticker: "NVDA", state: "Setup met (>=18)", total: 19, prev_state: "Watch", prev_total: 16 },
      { ticker: "NEW", state: "Watch", total: 15, prev_state: null, prev_total: null },
    ] }; } } as never;
    expect(await loadWeeklyRows(pool, "2026-10-09")).toEqual([
      { ticker: "NVDA", state: "Setup met (>=18)", points: 19, previous: { state: "Watch", points: 16 } },
      { ticker: "NEW", state: "Watch", points: 15, previous: null },
    ]);
    expect(calls[0].params).toEqual(["2026-10-09"]);
    expect(calls[0].sql).toContain("FROM score_results");
    expect(calls[0].sql).toContain("$1::date - 7");
  });
});
