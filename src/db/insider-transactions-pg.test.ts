import pg from "pg";
import { describe, expect, it } from "vitest";
import { PostgresCollectorRepository } from "./collectors";
import { parseForm4Transactions } from "../collectors/edgar";

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
});
