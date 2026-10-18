import { describe, expect, it } from "vitest";
import { saveBaseline } from "./portfolio-baseline";

describe("private baseline trade storage", () => {
  it("preserves recorded trades when a manual baseline omits them", async () => {
    const calls: { sql: string; values: unknown[] }[] = [];
    const pool = { query: async (sql: string, values: unknown[]) => { calls.push({ sql, values }); return { rows: [] }; } };
    const base = { asOf: "2026-09-30", source: "manual" as const, currency: "EUR" as const, cashEur: 100, positions: [] };
    await saveBaseline(pool as never, base);
    expect(calls[0].sql).toContain("CASE WHEN $7::boolean THEN EXCLUDED.trades ELSE portfolio_baseline.trades END");
    expect(calls[0].values[6]).toBe(false);
    await saveBaseline(pool as never, { ...base, trades: [{ date: "2026-09-01", symbol: "A", quantity: -1, proceedsEur: 100, feesEur: 1 }], tradeFromDate: "2025-09-30" });
    expect(calls[1].values[6]).toBe(true);
    expect(calls[1].values[7]).toBe("2025-09-30");
  });
});
