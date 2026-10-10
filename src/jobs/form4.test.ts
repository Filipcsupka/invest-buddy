import { describe, expect, it } from "vitest";
import { createForm4BackfillJob } from "./form4";
import { MemoryBackfillStore, runBackfill } from "./backfill";

const row = (accession: string) => ({ form: ["4"], accessionNumber: [accession], primaryDocument: ["xslF345X05/ownership.xml"], filingDate: ["2026-10-02"] });
const xml = `<ownershipDocument><nonDerivativeTable><nonDerivativeTransaction><transactionDate><value>2026-10-02</value></transactionDate><transactionCoding><transactionCode>P</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>10</value></transactionShares><transactionPricePerShare><value>2</value></transactionPricePerShare></transactionAmounts></nonDerivativeTransaction></nonDerivativeTable></ownershipDocument>`;

describe("Form 4 backfill", () => {
  it("resumes after the request cap and inserts each filing once", async () => {
    const urls: string[] = [], inserts = new Set<string>();
    const db = { async query(sql: string, args: unknown[]) {
      if (sql.includes("INSERT INTO insider_transactions")) inserts.add(`${args[0]}:${args[1]}`);
      return { rows: [], rowCount: 1 };
    } };
    const get = async (url: string) => {
      urls.push(url);
      if (url.endsWith("CIK0000000123.json")) return JSON.stringify({ filings: { recent: row("0000000123-26-000001"), files: [{ name: "CIK0000000123-submissions-001.json", filingFrom: "2023-10-01", filingTo: "2023-12-31" }] } });
      if (url.endsWith("CIK0000000123-submissions-001.json")) return JSON.stringify(row("0000000123-23-000001"));
      return xml;
    };
    const job = createForm4BackfillJob(db as never, get, async () => [{ ticker: "NVDA", cik: 123 }]);
    const store = new MemoryBackfillStore();
    const ledger = { async reserve() { return { allowed: true }; } } as never;
    expect((await runBackfill(job, store, ledger, { maxRequests: 2 })).status).toBe("paused");
    expect(urls).toHaveLength(2);
    expect((await runBackfill(job, store, ledger)).status).toBe("completed");
    expect(urls).toHaveLength(4);
    expect(inserts.size).toBe(2);
    await runBackfill(job, store, ledger);
    expect(urls).toHaveLength(4);
  });
});
