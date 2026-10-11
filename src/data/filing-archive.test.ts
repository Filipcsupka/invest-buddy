import { randomBytes } from "node:crypto";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { archiveFiling, archivedAccessions } from "./filing-archive";
import { getSnapshot } from "./raw-store";

const TICKER = "FILARC", ACCESSION = "0000999999-26-000001";
/** Needs a migrated TEST_DATABASE_URL (migration 051). Uses a test-only ticker and accession; cleans up after itself. */
describe("filing archive (Postgres)", () => {
  it.skipIf(!process.env.TEST_DATABASE_URL)("stores the body whole once, with provenance, and a rerun adds nothing", async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
    const clean = async () => {
      await pool.query("DELETE FROM filings WHERE ticker=$1", [TICKER]);
      await pool.query("DELETE FROM raw_snapshots WHERE key LIKE $1", [`filing:${ACCESSION}:%`]);
      await pool.query("DELETE FROM instruments WHERE ticker=$1", [TICKER]);
    };
    try {
      await clean();
      await pool.query("INSERT INTO instruments (ticker,name,sector,source) VALUES ($1,'Archive test','Test','guide')", [TICKER]);
      const body = `<html>${randomBytes(300_000).toString("hex")}</html>`;
      const file = { ticker: TICKER, cik: 999999, accession: ACCESSION, form: "10-K", docType: "10-K", name: "annual.htm", url: "https://www.sec.gov/Archives/edgar/data/999999/x/annual.htm", filedAt: "2026-02-20", items: "", body };
      expect((await archiveFiling(pool, file)).stored).toBe(true);
      expect((await archiveFiling(pool, file)).stored).toBe(false);
      const rows = (await pool.query("SELECT * FROM filings WHERE ticker=$1", [TICKER])).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ source_id: "sec", licence_class: "public_gov", form: "10-K", size_bytes: String(Buffer.byteLength(body)) });
      expect((await getSnapshot(pool, Number(rows[0].snapshot_id)))!.body.toString("utf8")).toBe(body);
      expect([...(await archivedAccessions(pool, [ACCESSION, "0000999999-26-000002"]))]).toEqual([ACCESSION]);
    } finally { await clean(); await pool.end(); }
  });
});
