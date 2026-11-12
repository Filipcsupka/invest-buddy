import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ sql: "", params: [] as unknown[] }));
vi.mock("@/db/pool", () => ({ getPool: () => ({ query: async (sql: string, params: unknown[]) => { state.sql = sql; state.params = params; return { rows: [{ ticker: "NVDA", date: "2026-12-01", timeOfDay: null }] }; } }) }));
vi.mock("@/data/macro-calendar-store", () => ({ storedMacroEvents: async () => [{ kind: "CPI", date: "2026-11-10", label: "old" }, { kind: "CPI", date: "2026-12-10", label: "current" }] }));
import { upcomingCalendar } from "./calendar-view";

it("reads only recent stored market earnings and upcoming macro events", async () => {
  const oldMode = process.env.DATA_MODE;
  process.env.DATA_MODE = "db";
  try {
    const view = await upcomingCalendar("2026-11-12");
    expect(view.earnings).toHaveLength(1);
    expect(view.macro).toEqual([{ kind: "CPI", date: "2026-12-10", label: "current" }]);
    expect(state.sql).toContain("source_id = 'eodhd'");
    expect(state.sql).toContain("observed_on >= $1::date - 14");
    expect(state.params).toEqual(["2026-11-12"]);
  } finally { if (oldMode === undefined) delete process.env.DATA_MODE; else process.env.DATA_MODE = oldMode; }
});
