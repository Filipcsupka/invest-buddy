import { describe, expect, it } from "vitest";
import type pg from "pg";
import { latestScreenerRuns, mapScreenerRows, saveScreenerRun, screenerResults } from "./screener";
import { SCREENER_PRESETS, presetById } from "./screener-presets";

// Trimmed from a live /screener response on 2026-11-06 (filters exchange=us, market cap over 100 bn, limit 2).
const live = { data: [
  { code: "AAPL", name: "Apple Inc.", last_day_data_date: "2026-11-06", adjusted_close: 342.37, refund_1d: -1.8, refund_1d_p: -0.52, refund_5d: -2.26, refund_5d_p: -0.66, exchange: "US", currency_symbol: "$",
    market_capitalization: 5001541320704, earnings_share: 8.84, dividend_yield: 0.003, sector: "Technology", industry: "Consumer Electronics", avgvol_1d: 42788337, avgvol_200d: 48709834.66 },
  { code: "NVDA", name: "NVIDIA Corporation", last_day_data_date: "2026-11-06", adjusted_close: 186.64, refund_1d: 5.04, refund_1d_p: 2.78, refund_5d: -18, refund_5d_p: -8.8, exchange: "US", currency_symbol: "$",
    market_capitalization: 4385095286784, earnings_share: 7.91, dividend_yield: 0.0014, sector: "Technology", industry: "Semiconductors", avgvol_1d: 178082701, avgvol_200d: 147828000.16 },
] };

describe("screener presets", () => {
  it("defines ten fact-only presets with unique ids and bounded size", () => {
    expect(SCREENER_PRESETS).toHaveLength(10);
    expect(new Set(SCREENER_PRESETS.map((preset) => preset.id)).size).toBe(10);
    for (const preset of SCREENER_PRESETS) {
      expect(preset.limit).toBeLessThanOrEqual(500);
      expect(preset.filters.some(([field]) => field === "exchange")).toBe(true);
      expect(JSON.stringify(preset)).not.toMatch(/score|buy|sell|signal_strength/i);
    }
    expect(presetById("us-200d-high")?.signals).toBe("200d_new_hi");
    expect(presetById("nope")).toBeUndefined();
  });
});

describe("screener rows", () => {
  it("maps the live response fields and drops repeats and rows without a code", () => {
    const rows = mapScreenerRows([...live.data, live.data[0], { code: "", exchange: "US" }]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ rank: 1, code: "AAPL", exchange: "US", name: "Apple Inc.", sector: "Technology", industry: "Consumer Electronics", currencySymbol: "$", lastDay: "2026-11-06",
      close: 342.37, change1d: -0.52, change5d: -0.66, marketCap: 5001541320704, dividendYield: 0.003, avgVolume200d: 48709834.66 });
    expect(rows[1].rank).toBe(2);
  });
  it("replaces the day's run and its rows", async () => {
    const sql: string[] = [], params: unknown[][] = [];
    const db = { query: async (text: string, values: unknown[]) => { sql.push(text); params.push(values); return { rows: text.includes("RETURNING id") ? [{ id: "7" }] : [] }; } } as unknown as Pick<pg.Pool, "query">;
    expect(await saveScreenerRun(db, SCREENER_PRESETS[0], "2026-11-07", mapScreenerRows(live.data))).toBe(2);
    expect(sql[0]).toContain("ON CONFLICT (preset,as_of) DO UPDATE");
    expect(params[0][0]).toBe("us-mega-cap");
    expect(params[0].at(-1)).toBe(false);
    expect(sql[1]).toContain("DELETE FROM screener_rows");
    expect(params[2].slice(0, 3)).toEqual(["7", 1, "AAPL"]);
  });
  it("reads nothing without a database and the latest run otherwise", async () => {
    expect(await latestScreenerRuns(null)).toEqual([]);
    expect(await screenerResults("us-mega-cap", null)).toEqual({ asOf: null, rows: [] });
    const replies = [[{ id: "7", as_of: "2026-11-07" }], [{ rank: 1, code: "AAPL", exchange: "US", name: "Apple Inc.", sector: "Technology", industry: null, currency_symbol: "$", last_day: "2026-11-06", adjusted_close: "342.37", change_1d_pct: "-0.52", change_5d_pct: null, market_cap: "5001541320704", dividend_yield: "0.003", avgvol_200d: null }]];
    const db = { query: async () => ({ rows: replies.shift() ?? [] }) } as unknown as Pick<pg.Pool, "query">;
    const result = await screenerResults("us-mega-cap", db);
    expect(result.asOf).toBe("2026-11-07");
    expect(result.rows[0]).toMatchObject({ close: 342.37, change1d: -0.52, change5d: null, marketCap: 5001541320704 });
  });
});
