import { expect, it } from "vitest";
import { storeWatchRows, submissionRows } from "./watch";
import { form4OwnerCik } from "../collectors/edgar";

it("deduplicates submissions by CIK and accession on a second poll", async () => {
  const rows = submissionRows("NVDA", 1045810, { form: ["8-K", "10-Q/A"], accessionNumber: ["0001045810-26-000001", "0001045810-26-000002"], filingDate: ["2026-10-01", "2026-10-02"], items: ["2.02", ""] });
  const seen = new Set<string>();
  const db = { query: async (_sql: string, params: unknown[]) => ({ rows: (JSON.parse(params[0] as string) as typeof rows).filter((r) => {
    const key = `${r.cik}:${r.accession}`; if (seen.has(key)) return false; seen.add(key); return true;
  }).map((r) => ({ cik: String(r.cik), accession: r.accession })) }) } as never;
  expect(await storeWatchRows(db, rows)).toEqual(rows);
  expect(await storeWatchRows(db, rows)).toEqual([]);
});

it("reads the Form 4 reporting owner for routine-trader checks", () => {
  expect(form4OwnerCik("<ownershipDocument><reportingOwner><reportingOwnerId><rptOwnerCik>12345</rptOwnerCik></reportingOwnerId></reportingOwner></ownershipDocument>")).toBe("12345");
});
