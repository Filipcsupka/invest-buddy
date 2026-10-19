import pg from "pg";
import { describe, expect, it } from "vitest";
import { estimateRevisions, storedEstimateObservations, type StoredEstimateObservation } from "./estimate-revisions";
import { REVISION_LOOKBACK_DAYS } from "../data/estimate-revisions";

const asOf = "2026-10-19";
const fake = (rows: StoredEstimateObservation[]) => {
  const calls: { sql: string; params: unknown[] }[] = [];
  return { calls, db: { query: async (sql: string, params: unknown[]) => { calls.push({ sql, params }); return { rows }; } } as unknown as Pick<pg.Pool, "query"> };
};
const row = (ticker: string, observedOn: string, estimate: number | null): StoredEstimateObservation => ({ ticker, observedOn, reportDate: "2026-11-05", fiscalDateEnding: "2026-09-30", estimate });

describe("estimate revisions reader", () => {
  it("sends no query for an empty ticker list", async () => {
    const { db, calls } = fake([]);
    expect(await storedEstimateObservations(db, [], asOf)).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("reads only the lookback up to asOf and groups rows per ticker", async () => {
    const { db, calls } = fake([row("AMD", "2026-09-19", 1), row("AMD", asOf, 1.1), row("NVDA", asOf, 0.8)]);
    const facts = await estimateRevisions(db, ["AMD", "NVDA", "MU"], asOf);
    expect(calls[0].params).toEqual([["AMD", "NVDA", "MU"], asOf, REVISION_LOOKBACK_DAYS]);
    expect(calls[0].sql).toMatch(/observed_on <= \$2::date/);
    expect([...facts.keys()]).toEqual(["AMD", "NVDA"]);
    expect(facts.get("AMD")!.windows[0]).toMatchObject({ change: 0.1, changePct: 10, direction: "up" });
    expect(facts.get("NVDA")!.windows[0].change).toBeNull();
  });
});

/** Needs a migrated TEST_DATABASE_URL; everything runs inside one rolled-back transaction. */
async function inRollback(fn: (client: pg.Client) => Promise<void>) {
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  try { await client.query("BEGIN"); await fn(client); } finally { try { await client.query("ROLLBACK"); } finally { await client.end(); } }
}

describe("estimate revisions reader (Postgres)", () => {
  it.skipIf(!process.env.TEST_DATABASE_URL)("computes the fact from stored calendar rows and skips later pulls", () => inRollback(async (client) => {
    await client.query("INSERT INTO instruments (ticker,name,sector,source) VALUES ('ERTEST','Revision test','Test','guide') ON CONFLICT DO NOTHING");
    const insert = `INSERT INTO earnings_calendar_snapshots (observed_on, ticker, report_date, fiscal_date_ending, estimate, currency, time_of_day, source_id)
      VALUES ($1::date,'ERTEST',$2::date,'2026-09-30',$3,'USD','post-market','alphavantage')`;
    await client.query(insert, ["2026-06-01", "2026-11-05", 0.5]);
    await client.query(insert, ["2026-09-19", "2026-11-03", 1]);
    await client.query(insert, [asOf, "2026-11-05", 1.2]);
    await client.query(insert, ["2026-10-25", "2026-11-05", 9]);
    const rows = await storedEstimateObservations(client, ["ERTEST"], asOf);
    expect(rows.map((r) => r.observedOn)).toEqual(["2026-09-19", asOf]);
    const fact = (await estimateRevisions(client, ["ERTEST"], asOf)).get("ERTEST")!;
    expect(fact).toMatchObject({ reportDate: "2026-11-05", currentEstimate: 1.2, points: 0 });
    expect(fact.windows[0]).toMatchObject({ fromObservedOn: "2026-09-19", change: 0.2, changePct: 20, direction: "up" });
  }));
});
