import pg from "pg";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { changeUniverse, parseChange } from "./universe-change";
import { loadUniverse } from "../src/db/universe";
import universe from "../scanner/universe.json";

describe("universe change", () => {
  it("seeds the 36 fixture names and SPY on the baseline date", () => {
    const sql = readFileSync(join(process.cwd(), "migrations/043_universe_membership.sql"), "utf8");
    const seed = sql.slice(sql.indexOf("WHERE ticker IN (")).match(/'([A-Z][A-Z0-9]*)'/g) ?? [];
    expect(seed.map((value) => value.slice(1, -1)).sort()).toEqual([...universe.instruments.map((row) => row.symbol), "SPY"].sort());
    expect(sql).toContain("DATE '2026-10-09'");
  });
  it("requires an actor and reason and checks calendar dates", () => {
    expect(() => parseChange(["add", "ABC", "--date", "2026-02-30", "--reason", "Review", "--actor", "owner"])).toThrow();
    expect(() => parseChange(["remove", "ABC", "--date", "2026-10-12", "--reason", " ", "--actor", "owner"])).toThrow();
    expect(parseChange(["remove", "abc", "--date", "2026-10-12", "--reason", "No longer tracked", "--actor", "owner"]).ticker).toBe("ABC");
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("membership history in PostgreSQL", () => {
  const db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const ticker = "D11ZZ";
  afterAll(async () => db.end());
  afterEach(async () => {
    await db.query("DELETE FROM universe_membership WHERE ticker=$1", [ticker]);
    await db.query("DELETE FROM daily_bars WHERE ticker=$1", [ticker]);
    await db.query("DELETE FROM score_results WHERE ticker=$1", [ticker]);
    await db.query("DELETE FROM instruments WHERE ticker=$1", [ticker]);
  });
  it("adds and removes dated membership while keeping bars and scores", async () => {
    const add = parseChange(["add", ticker, "--date", "2026-10-11", "--name", "History test", "--sector", "Test", "--list", "extended", "--tier", "2", "--criteria-version", "v1", "--reason", "Reviewed", "--actor", "owner"]);
    await changeUniverse(db, add);
    expect((await loadUniverse(db, "2026-10-10")).some((row) => row.symbol === ticker)).toBe(false);
    expect((await loadUniverse(db, "2026-10-11")).find((row) => row.symbol === ticker)?.tier).toBe(2);
    await db.query("INSERT INTO daily_bars(ticker,bar_date,open,high,low,close,volume) VALUES ($1,'2026-10-11',10,11,9,10,100)", [ticker]);
    await db.query("INSERT INTO score_results(ticker,as_of,technical,fundamentals,macro,total,state,audit) VALUES ($1,'2026-10-11',1,1,1,3,'Wait','{}')", [ticker]);
    await changeUniverse(db, parseChange(["remove", ticker, "--date", "2026-10-12", "--reason", "Left screen", "--actor", "owner"]));
    expect((await loadUniverse(db, "2026-10-11")).some((row) => row.symbol === ticker)).toBe(true);
    expect((await loadUniverse(db, "2026-10-12")).some((row) => row.symbol === ticker)).toBe(false);
    expect((await db.query("SELECT 1 FROM daily_bars WHERE ticker=$1", [ticker])).rowCount).toBe(1);
    expect((await db.query("SELECT 1 FROM score_results WHERE ticker=$1", [ticker])).rowCount).toBe(1);
    await expect(changeUniverse(db, parseChange(["remove", ticker, "--date", "2026-10-13", "--reason", "Again", "--actor", "owner"]))).rejects.toThrow("not an active member");
  });
});
