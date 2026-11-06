import { describe, expect, it } from "vitest";
import { addDays, materialiseEtfOutcomes, outcomeFor, returnPct, type CloseBar, type EtfPickForOutcome } from "./etf-outcomes";

const pick: EtfPickForOutcome = { symbol: "ETF1", exchange: "NYSE ARCA", name: "Test ETF", entry_price: "49", entry_date: "2026-01-01", benchmark_symbol: "SPY" };
const bars: Record<string, CloseBar[]> = {
  ETF1: [{ date: "2026-01-02", close: 50 }, { date: "2026-02-02", close: 60 }],
  SPY: [{ date: "2026-01-02", close: 100 }, { date: "2026-02-02", close: 110 }],
};
class FakeDb {
  outcomes = new Map<string, unknown[]>();
  pick = pick;
  async query(sql: string, args: unknown[] = []) {
    if (sql.includes("FROM etf_picks")) return { rows: [this.pick], rowCount: 1 };
    if (sql.includes("AS daily")) return { rows: [{ daily: true, discovery: false }], rowCount: 1 };
    if (sql.includes("SELECT bar_date::text")) {
      const row = bars[String(args[0])]?.find((bar) => bar.date >= String(args[1]) && bar.date <= String(args[2]));
      return { rows: row ? [{ date: row.date, close: String(row.close) }] : [], rowCount: row ? 1 : 0 };
    }
    if (sql.includes("INSERT INTO etf_outcomes")) {
      const key = `${args[0]}:${args[1]}`;
      const old = this.outcomes.get(key);
      this.outcomes.set(key, args);
      return { rows: [], rowCount: old && JSON.stringify(old) === JSON.stringify(args) ? 0 : 1 };
    }
    return { rows: [], rowCount: 0 };
  }
}

describe("ETF outcomes", () => {
  it("uses the next stored trading close and subtracts benchmark return", async () => {
    const db = new FakeDb();
    expect(addDays("2026-01-02", 30)).toBe("2026-02-01");
    expect(returnPct(50, 60)).toBe(20);
    expect(outcomeFor(pick, 30, bars.ETF1[0], bars.ETF1[1], bars.SPY[0], bars.SPY[1])).toMatchObject({
      entryPrice: 50, exitDate: "2026-02-02", returnPct: 20, benchmarkReturnPct: 10, excessPct: 10,
    });
    expect(await materialiseEtfOutcomes(db as never, "2026-02-05")).toEqual({ completed: 1, written: 1 });
    expect(await materialiseEtfOutcomes(db as never, "2026-02-05")).toEqual({ completed: 1, written: 0 });
    expect(db.outcomes.get("ETF1:30")).toEqual(["ETF1", 30, "2026-01-02", 50, "2026-02-02", 60, 20, "SPY", 10, 10]);
  });
  it("skips a fund without a series and never calls the provider", async () => {
    const db = new FakeDb();
    db.query = async (sql: string) => {
      if (sql.includes("FROM etf_picks")) return { rows: [{ ...pick, exchange: "LSE" }], rowCount: 1 };
      if (sql.includes("AS daily")) return { rows: [{ daily: false, discovery: false }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    };
    const provider = { bars: async () => { throw new Error("provider should not be called"); } };
    expect(await materialiseEtfOutcomes(db as never, "2026-08-01", provider)).toEqual({ completed: 0, written: 0 });
  });
});
