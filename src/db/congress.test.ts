import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assignTradeKeys, parseCongressTrades } from "./congress";

const live = JSON.parse(readFileSync(join(process.cwd(), "src/jobs/fixtures/eodhd-flow/congress.json"), "utf8")) as unknown;
const pr0 = JSON.parse(readFileSync(join(process.cwd(), "src/data-providers/eodhd/fixtures/markets/congress.json"), "utf8")) as unknown;

describe("congressional trades parser", () => {
  it("reads the live page shape with member, asset, transaction and source blocks", () => {
    const page = parseCongressTrades(live);
    expect(page).toMatchObject({ skipped: 0, total: 85, hasNext: true });
    expect(page.rows[0]).toMatchObject({ chamber: "house", bioguideId: "S000250", memberName: "Pete Sessions", state: "TX", district: 17, party: null,
      symbol: "DIS", assetDescription: "Walt Disney Company", assetType: "Stock", txType: "sale", owner: "Self", txDate: "2026-10-28", disclosureDate: "2026-10-27",
      amountRange: "$1,001 - $15,000", amountLow: 1001, amountHigh: 15000, daysToDisclose: 1, isLate: false, filingId: "20035563",
      filingUrl: "https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20035563.pdf" });
  });

  it("leaves a mistyped trade year empty and keeps it in raw", () => {
    const [row] = parseCongressTrades(pr0).rows;
    expect(row.txDate).toBeNull();
    expect((row.raw.transaction as Record<string, unknown>).transaction_date).toBe("3031-04-30");
  });

  it("skips rows without required fields and ignores unknown ones", () => {
    const base = { chamber: "senate", member: { full_name: "A B" }, transaction: { disclosure_date: "2026-11-02" }, source: { filing_identifier: "F1" }, newField: 1 };
    const page = parseCongressTrades({ data: [base, { ...base, chamber: "joint" }, { ...base, member: {} }, { ...base, transaction: {} }, { ...base, source: { filing_url: "http://x" } }, null] });
    expect(page.rows).toHaveLength(1);
    expect(page.skipped).toBe(5);
    expect(page.hasNext).toBe(false);
    expect(parseCongressTrades([])).toMatchObject({ rows: [], skipped: 1 });
  });

  it("gives identical trades in one filing distinct, stable keys", () => {
    const rows = parseCongressTrades(live).rows;
    const twice = [...rows, rows[1]];
    const keys = assignTradeKeys(twice).map((row) => row.key);
    expect(new Set(keys).size).toBe(4);
    expect(assignTradeKeys(twice).map((row) => row.key)).toEqual(keys);
    expect(assignTradeKeys(rows).map((row) => row.key)).toEqual(keys.slice(0, 3));
  });
});
