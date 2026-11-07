import { describe, expect, it } from "vitest";
import { addDays, benchmarkFor, materialiseEtfOutcomes, outcomeFor, returnPct, type CloseBar, type EtfPickForOutcome } from "./etf-outcomes";

const pick: EtfPickForOutcome = {
  symbol: "ETF1", exchange: "NYSEARCA", name: "Test ETF", entry_price: "49", entry_date: "2026-01-01",
  benchmark_symbol: "SPY", listing_key: "NYSEARCA:ETF1", asset_class: "equity", region: "US", price_currency: "USD", catalog_currency: "USD",
};

class FakeDb {
  outcomes = new Map<string, unknown[]>();
  picks: EtfPickForOutcome[] = [pick];
  tracked = new Map<string, { vendor_symbol: string; currency: string | null }>();
  bars = new Map<string, CloseBar[]>([
    ["daily_bars:ETF1", [{ date: "2026-01-02", close: 50 }, { date: "2026-02-02", close: 60 }]],
    ["daily_bars:SPY", [{ date: "2026-01-02", close: 100 }, { date: "2026-02-02", close: 110 }]],
  ]);

  async query(sql: string, args: unknown[] = []) {
    if (sql.includes("FROM etf_picks")) return { rows: this.picks, rowCount: this.picks.length };
    if (sql.includes("FROM etf_tracked")) {
      const row = this.tracked.get(String(args[0]));
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (sql.includes("AS daily")) return { rows: [{ daily: this.bars.has(`daily_bars:${args[0]}`), discovery: this.bars.has(`discovery_price_bars:${args[0]}`) }], rowCount: 1 };
    if (sql.includes("AS stored")) return { rows: [{ stored: this.bars.has(`asset_bars:${args[0]}`) }], rowCount: 1 };
    if (sql.includes("SELECT bar_date::text")) {
      const table = /FROM (daily_bars|discovery_price_bars|asset_bars)/.exec(sql)?.[1];
      const row = this.bars.get(`${table}:${args[0]}`)?.find((bar) => bar.date >= String(args[1]) && bar.date <= String(args[2]));
      return { rows: row ? [{ date: row.date, close: String(row.close) }] : [], rowCount: row ? 1 : 0 };
    }
    if (sql.includes("INSERT INTO etf_outcomes")) {
      const key = `${args[0]}:${args[1]}`;
      const old = this.outcomes.get(key);
      this.outcomes.set(key, args);
      return { rows: [], rowCount: old && JSON.stringify(old) === JSON.stringify(args) ? 0 : 1 };
    }
    throw new Error(`Unexpected query: ${sql}`);
  }
}

describe("ETF outcomes", () => {
  it("uses the next stored US trading close and subtracts SPY return", async () => {
    const db = new FakeDb();
    expect(addDays("2026-01-02", 30)).toBe("2026-02-01");
    expect(returnPct(50, 60)).toBe(20);
    expect(outcomeFor(pick, 30, db.bars.get("daily_bars:ETF1")![0], db.bars.get("daily_bars:ETF1")![1],
      db.bars.get("daily_bars:SPY")![0], db.bars.get("daily_bars:SPY")![1], "SPY")).toMatchObject({
      entryPrice: 50, exitDate: "2026-02-02", returnPct: 20, benchmarkReturnPct: 10, excessPct: 10,
    });
    expect(await materialiseEtfOutcomes(db as never, "2026-02-05")).toEqual({ completed: 1, written: 1 });
    expect(await materialiseEtfOutcomes(db as never, "2026-02-05")).toEqual({ completed: 1, written: 0 });
    expect(db.outcomes.get("ETF1:30")).toEqual(["ETF1", 30, "2026-01-02", 50, "2026-02-02", 60, 20, "SPY", 10, 10]);
  });

  it("measures a EUR Xetra ETF against stored Euro Stoxx 50 index bars", async () => {
    const db = new FakeDb();
    db.picks = [{ ...pick, symbol: "EXSA", exchange: "XETR", listing_key: "IE000EXSA001", region: "Europe", price_currency: "EUR", catalog_currency: "EUR" }];
    db.tracked.set("IE000EXSA001", { vendor_symbol: "EXSA.XETRA", currency: "EUR" });
    db.bars.set("asset_bars:EXSA.XETRA", [{ date: "2026-01-02", close: 40 }, { date: "2026-02-02", close: 44 }]);
    db.bars.set("asset_bars:STOXX50E.INDX", [{ date: "2026-01-02", close: 5000 }, { date: "2026-02-02", close: 5250 }]);
    const provider = { bars: async () => { throw new Error("provider should not be called"); } };
    expect(await materialiseEtfOutcomes(db as never, "2026-02-05", provider)).toEqual({ completed: 1, written: 1 });
    expect(db.outcomes.get("EXSA:30")).toEqual(["EXSA", 30, "2026-01-02", 40, "2026-02-02", 44, 10, "STOXX50E.INDX", 5, 5]);
  });

  it("chooses a regional index only in the fund quote currency", () => {
    expect(benchmarkFor({ ...pick, region: "Germany", catalog_currency: "EUR" })).toEqual({ symbol: "GDAXI.INDX", table: "asset_bars" });
    expect(benchmarkFor({ ...pick, region: "Japan", catalog_currency: "JPY" })).toEqual({ symbol: "N225.INDX", table: "asset_bars" });
    expect(benchmarkFor({ ...pick, exchange: "XETR", region: "US", catalog_currency: "EUR" })).toEqual({ symbol: "STOXX50E.INDX", table: "asset_bars" });
    expect(benchmarkFor({ ...pick, exchange: "LSE", region: "Global", catalog_currency: "GBP" })).toBeNull();
    expect(benchmarkFor({ ...pick, asset_class: "bond", catalog_currency: "EUR" })).toBeNull();
  });

  it("keeps a fund return without inventing a benchmark when its bars are absent", async () => {
    const db = new FakeDb();
    db.picks = [{ ...pick, symbol: "EXSA", exchange: "XETR", listing_key: "IE000EXSA001", region: "Europe", price_currency: "EUR", catalog_currency: "EUR" }];
    db.tracked.set("IE000EXSA001", { vendor_symbol: "EXSA.XETRA", currency: "EUR" });
    db.bars.set("asset_bars:EXSA.XETRA", [{ date: "2026-01-02", close: 40 }, { date: "2026-02-02", close: 44 }]);
    expect(await materialiseEtfOutcomes(db as never, "2026-02-05")).toEqual({ completed: 1, written: 1 });
    expect(db.outcomes.get("EXSA:30")?.slice(7)).toEqual(["STOXX50E.INDX", null, null]);
  });

  it("uses the stored S&P 500 index when SPY has no entry bar", async () => {
    const db = new FakeDb();
    db.bars.delete("daily_bars:SPY");
    db.bars.set("asset_bars:GSPC.INDX", [{ date: "2026-01-02", close: 1000 }, { date: "2026-02-02", close: 1050 }]);
    expect(await materialiseEtfOutcomes(db as never, "2026-02-05")).toEqual({ completed: 1, written: 1 });
    expect(db.outcomes.get("ETF1:30")?.slice(7)).toEqual(["GSPC.INDX", 5, 15]);
  });

  it("records a non-equity fund return without an equity index comparison", async () => {
    const db = new FakeDb();
    db.picks = [{ ...pick, asset_class: "bond" }];
    expect(await materialiseEtfOutcomes(db as never, "2026-02-05")).toEqual({ completed: 1, written: 1 });
    expect(db.outcomes.get("ETF1:30")?.slice(7)).toEqual(["UNAVAILABLE", null, null]);
  });

  it("rejects a tracked listing priced in a different currency", async () => {
    const db = new FakeDb();
    db.picks = [{ ...pick, symbol: "EXSA", exchange: "XETR", listing_key: "IE000EXSA001", region: "Europe", price_currency: "EUR", catalog_currency: "EUR" }];
    db.tracked.set("IE000EXSA001", { vendor_symbol: "EXSA.US", currency: "USD" });
    db.bars.set("asset_bars:EXSA.US", [{ date: "2026-01-02", close: 40 }, { date: "2026-02-02", close: 44 }]);
    expect(await materialiseEtfOutcomes(db as never, "2026-02-05")).toEqual({ completed: 0, written: 0 });
  });

  it("skips a fund without a stored series and never calls the provider", async () => {
    const db = new FakeDb();
    db.picks = [{ ...pick, symbol: "MISSING", exchange: "LSE", listing_key: "IE000MISSING", price_currency: "GBP", catalog_currency: "GBP" }];
    const provider = { bars: async () => { throw new Error("provider should not be called"); } };
    expect(await materialiseEtfOutcomes(db as never, "2026-08-01", provider)).toEqual({ completed: 0, written: 0 });
  });
});
