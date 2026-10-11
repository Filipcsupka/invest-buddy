import pg from "pg";
import { describe, expect, it } from "vitest";
import { PostgresInstitutionalStore } from "./institutional";

const dbDescribe = describe.skipIf(!process.env.TEST_DATABASE_URL);
dbDescribe("institutional holdings (Postgres)", () => {
  it("stores a filing once and reads the previous quarter back", async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const store = new PostgresInstitutionalStore(client as never);
      const filing = { period: "2026-03-31", filerCik: 9001, filerName: "Test Filer", accession: "0000009001-26-000001" };
      const rows = [{ period: "2026-03-31", filerCik: 9001, filerName: "Test Filer", ticker: "NVDA", shares: 100, valueUsd: 1000, changeShares: null, priorPeriod: null }];
      expect(await store.addFiling(filing, rows)).toBe(1);
      expect(await store.addFiling(filing, rows)).toBe(0);
      expect(await store.hasFiling("2026-03-31", 9001)).toBe(true);
      const prior = (await store.priorFilings("2026-06-30", [9001])).get(9001);
      expect(prior?.period).toBe("2026-03-31");
      expect(prior?.shares.get("NVDA")).toBe(100);
    } finally { await client.query("ROLLBACK"); client.release(); await pool.end(); }
  });
});
