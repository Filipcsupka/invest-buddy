import pg from "pg";
import { describe, expect, it } from "vitest";
import { PostgresCollectorRepository } from "./collectors";
import { parseForm4Transactions } from "../collectors/edgar";
import { runEodhdInsider } from "../jobs/eodhd-insider";
import form4 from "../data-providers/eodhd/fixtures/form4.json";

const dbDescribe = describe.skipIf(!process.env.TEST_DATABASE_URL);
dbDescribe("insider transactions (Postgres)", () => {
  it("matches the existing NVDA 90-day fact and ignores exercises", async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const accession = "0000000001-26-999999";
      const xml = `<ownershipDocument><nonDerivativeTable>${[["P",100,10],["S",40,12],["M",200,5]].map(([code,shares,price]) => `<nonDerivativeTransaction><transactionDate><value>2026-10-02</value></transactionDate><transactionCoding><transactionCode>${code}</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>${shares}</value></transactionShares><transactionPricePerShare><value>${price}</value></transactionPricePerShare></transactionAmounts></nonDerivativeTransaction>`).join("")}</nonDerivativeTable></ownershipDocument>`;
      const repo = new PostgresCollectorRepository(client as never);
      const rows = parseForm4Transactions(xml);
      await repo.upsertInsiderTransactions(accession, "NVDA", "2026-10-02", rows);
      await repo.upsertInsiderTransactions(accession, "NVDA", "2026-10-02", rows);
      const count = await client.query<{ n: number }>("SELECT count(*)::int AS n FROM insider_transactions WHERE accession=$1", [accession]);
      expect(count.rows[0].n).toBe(3);
      const net = await client.query<{ net_shares: string; net_dollars: string; dollars_complete: boolean }>("SELECT * FROM insider_net_buy($1,$2,$3)", ["NVDA", "2026-10-05", 90]);
      expect(net.rows[0]).toEqual({ net_shares: "60", net_dollars: "520", dollars_complete: true });
    } finally { await client.query("ROLLBACK"); client.release(); await pool.end(); }
  });

  it("counts one filing once when EDGAR and EODHD both carry it", async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const accession = form4.data[0].accession_number;
      await client.query("INSERT INTO instruments (ticker,name,sector,source) VALUES ('ZZDUP','Dup','Tech','sample extension') ON CONFLICT DO NOTHING");
      const subject = { ticker: "ZZDUP", vendorSymbol: "ZZDUP.US", secCheckedAt: null, vendorCheckedAt: null, secFailed: true };
      const api = { async form4() { return { data: form4.data, links: { next: null } }; }, getCallCosts: () => ({}) };
      const count = async (source: string) => (await client.query<{ n: number }>("SELECT count(*)::int AS n FROM insider_transactions WHERE accession=$1 AND source_id=$2", [accession, source])).rows[0].n;
      // EODHD first, then EDGAR for the same accession: EDGAR replaces the vendor rows
      await runEodhdInsider(client as never, api, { subjects: [subject], today: "2026-05-16" });
      expect(await count("eodhd")).toBe(1);
      const repo = new PostgresCollectorRepository(client as never);
      const sec = [{ lineNo: 1, ownerCik: null, ownerName: null, reportingOwners: [], isDirector: null, isOfficer: null, isTenPercentOwner: null, isOther: null,
        transactionDate: "2026-05-13", code: "S", shares: 3000, price: 450, acquiredDisposed: "D", derivative: false, sharesAfter: null, plan10b5: "unknown" }];
      await repo.upsertInsiderTransactions(accession, "ZZDUP", "2026-05-15", sec as never);
      expect(await count("eodhd")).toBe(0);
      expect(await count("sec")).toBe(1);
      // EODHD again: SEC holds the accession, so the vendor line is skipped
      await runEodhdInsider(client as never, api, { subjects: [subject], today: "2026-05-16" });
      expect(await count("eodhd")).toBe(0);
      const net = await client.query<{ net_shares: string }>("SELECT * FROM insider_net_buy('ZZDUP','2026-05-16',90)");
      expect(net.rows[0].net_shares).toBe("-3000");
    } finally { await client.query("ROLLBACK"); client.release(); await pool.end(); }
  });
});
