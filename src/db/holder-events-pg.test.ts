import pg from "pg";
import { describe, expect, it } from "vitest";
import { PostgresCollectorRepository } from "./collectors";

const dbDescribe = describe.skipIf(!process.env.TEST_DATABASE_URL);
dbDescribe("holder events (Postgres)", () => {
  it("stores an accession once", async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const repo = new PostgresCollectorRepository(client as never);
      const event = { accession: "0000000001-26-999998", ticker: "NVDA", filerName: "Test Holder", filerCik: 123, form: "SCHEDULE 13G/A", filedAt: "2026-10-02", percent: 6.25, shares: null };
      expect(await repo.upsertHolderEvent(event)).toBe(true);
      expect(await repo.upsertHolderEvent(event)).toBe(false);
      const rows = await client.query("SELECT count(*)::int AS n FROM holder_events WHERE accession=$1", [event.accession]);
      expect(rows.rows[0].n).toBe(1);
    } finally { await client.query("ROLLBACK"); client.release(); await pool.end(); }
  });
});
