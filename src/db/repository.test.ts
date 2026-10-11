import pg from "pg";
import { describe, expect, it } from "vitest";
import { score } from "../engine";
import { fixtureBars, fixtureFundamentals, fixtureMacro, instruments } from "../data/fixtures";
import { MemoryScoreRepository } from "./memory";
import { PostgresScoreRepository } from "./postgres";
import { stateChange } from "./types";

const instrument = instruments[0];
function result(asOf: string, state: ReturnType<typeof score>["state"]) {
  const base = score({ ticker: instrument.ticker, bars: fixtureBars(instrument.ticker), fundamentals: fixtureFundamentals(instrument.ticker), macro: fixtureMacro(instrument.ticker) });
  return { ...base, asOf, state };
}

describe("state change alerts", () => {
  it("ignores initial and unchanged states, then records a transition", () => {
    const first = result("2025-08-08", "Watch");
    const next = result("2025-08-09", "Setup met (>=18)");
    expect(stateChange(null, first)).toBeNull();
    expect(stateChange(first, { ...next, state: "Watch" })).toBeNull();
    expect(stateChange(first, next)).toMatchObject({ previousState: "Watch", currentState: "Setup met (>=18)" });
  });

  it("stores a date once and compares with the latest earlier score", async () => {
    const repository = new MemoryScoreRepository();
    const first = result("2025-08-08", "Watch");
    const second = result("2025-08-09", "Wait");
    expect((await repository.saveDaily(first.asOf, "fixture", [{ instrument, result: first }])).alerts).toHaveLength(0);
    const saved = await repository.saveDaily(second.asOf, "fixture", [{ instrument, result: second }]);
    expect(saved.alerts).toMatchObject([{ previousState: "Watch", currentState: "Wait" }]);
    expect(await repository.saveDaily(second.asOf, "fixture", [{ instrument, result: second }])).toMatchObject({ inserted: false, alerts: [] });
    expect(await repository.alerts(second.asOf)).toHaveLength(1);
    expect(await repository.scores(second.asOf)).toHaveLength(1);
  });
});

it("replaces a changed daily score and updates its alert without duplication", async () => {
  const repository = new MemoryScoreRepository();
  const first = result("2025-08-08", "Watch");
  const next = result("2025-08-09", "Wait");
  await repository.saveDaily(first.asOf, "fixture", [{ instrument, result: first, fingerprint: "a" }]);
  await repository.saveDaily(next.asOf, "fixture", [{ instrument, result: next, fingerprint: "b" }]);
  expect((await repository.saveDaily(next.asOf, "fixture", [{ instrument, result: next, fingerprint: "b" }])).inserted).toBe(false);
  const changed = { ...next, state: "Setup met (>=18)" as const };
  expect((await repository.saveDaily(next.asOf, "fixture", [{ instrument, result: changed, fingerprint: "c" }])).inserted).toBe(true);
  expect(await repository.alerts(next.asOf)).toMatchObject([{ previousState: "Watch", currentState: "Setup met (>=18)" }]);
  expect(await repository.scores(next.asOf)).toMatchObject([{ state: "Setup met (>=18)" }]);
});

it.skipIf(!process.env.TEST_DATABASE_URL)("stores a scored instrument with its sector in Postgres", async () => {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const repository = new PostgresScoreRepository(pool);
  const ticker = "C1DBTEST";
  const asOf = "2025-08-08";
  const dbInstrument = { ...instrument, ticker };
  const dbResult = { ...result(asOf, "Watch"), ticker };
  try {
    expect(await repository.saveDaily(asOf, "fixture", [{ instrument: dbInstrument, result: dbResult }])).toMatchObject({ inserted: true, instrumentCount: 1 });
    expect((await pool.query<{ sector: string }>("SELECT sector FROM instruments WHERE ticker=$1", [ticker])).rows[0].sector).toBe(dbInstrument.sector);
    expect((await repository.scores(asOf)).filter((row) => row.ticker === ticker)).toEqual([dbResult]);
    expect(await repository.saveDaily(asOf, "fixture", [{ instrument: dbInstrument, result: dbResult }])).toMatchObject({ inserted: false, instrumentCount: 0 });
  } finally {
    await pool.query("DELETE FROM alerts WHERE ticker=$1", [ticker]);
    await pool.query("DELETE FROM score_results WHERE ticker=$1", [ticker]);
    await pool.query("DELETE FROM fundamentals_snapshots WHERE ticker=$1", [ticker]);
    await pool.query("DELETE FROM macro_snapshots WHERE ticker=$1", [ticker]);
    await pool.query("DELETE FROM daily_bars WHERE ticker=$1", [ticker]);
    await pool.query("DELETE FROM ingest_runs WHERE as_of=$1", [asOf]);
    await pool.query("DELETE FROM instruments WHERE ticker=$1", [ticker]);
    await pool.end();
  }
});
