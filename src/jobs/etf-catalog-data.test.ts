import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { discoverXetraCsv, parseNasdaqDirectory, parseXetraCsv } from "./etf-catalog-data";
import { rankShortlist, upsertCatalog, type ShortlistRow } from "../db/etf-catalog-ingest";

const fixture = readFileSync("scanner/test/etf-xetra-fixture.csv", "utf8");
describe("ETF catalog sources", () => {
  it("parses the real semicolon header after metadata and collapses duplicate ISIN listings", () => {
    const rows = parseXetraCsv(fixture.replace(/\n/g, "\r\n"));
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.instrumentType)).toEqual(["ETF", "ETC", "ETN"]);
    expect(rows[0].listingKey).toBe(rows[0].isin);
    expect(rows[0].listingRegion).toBe("EU");
    expect(rows[0].tradingCurrency).toBe("EUR");
  });
  it("discovers a moved Xetra link on the official page", () => {
    expect(discoverXetraCsv('<a href="/resource/blob/1/new/data/t7-xetr-allTradableInstruments.csv">CSV</a>')).toMatch(/new\/data\/t7-xetr/);
    expect(() => discoverXetraCsv("no link")).toThrow(/not found/);
  });
  it("keeps only non-test US ETFs and ignores the file footer", () => {
    const nasdaq = "Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares\r\nAAAP|Test ETF|G|N|N|100|Y|N\r\nBAD|Test issue|G|Y|N|100|Y|N\r\nSTOCK|A share|G|N|N|100|N|N\r\nFile Creation Time: 1021202607:00|||||||";
    const other = "ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol\r\nSPY|SPDR ETF|P|SPY|Y|100|N|SPY\r\nFile Creation Time: 1021202607:00||||||";
    expect(parseNasdaqDirectory(nasdaq,"nasdaqlisted").map((row) => row.listingKey)).toEqual(["NASDAQ:AAAP"]);
    expect(parseNasdaqDirectory(other,"otherlisted")[0]).toMatchObject({ listingKey: "NYSEARCA:SPY", exchange: "NYSEARCA", isin: null, listingRegion: "US" });
  });
});

describe("catalog storage and shortlist", () => {
  it("upserts by stable listing key and leaves first_seen out of conflict updates", async () => {
    const queries: { sql: string; args: unknown[] }[] = [];
    const db = { connect: async () => ({ query: async (sql: string, args: unknown[] = []) => { queries.push({ sql, args }); return { rowCount: 1 }; }, release() {} }) };
    const row = parseXetraCsv(fixture)[0];
    await upsertCatalog(db as never, [row], "2026-10-21");
    await upsertCatalog(db as never, [row], "2026-10-22");
    const inserts = queries.filter(({ sql }) => sql.includes("INSERT INTO etf_catalog"));
    expect(inserts).toHaveLength(2);
    expect(inserts[0].sql).toContain("ON CONFLICT (listing_key)");
    expect(inserts[0].sql.split("DO UPDATE SET")[1]).not.toContain("first_seen");
    expect(inserts[0].args[0]).toBe(row.listingKey);
    expect(inserts[1].args.at(-1)).toBe("2026-10-22");
  });
  it("ranks US and EU funds by group without a UCITS filter", () => {
    const base: ShortlistRow = { listing_key: "NYSEARCA:SPY", mnemonic: "SPY", asset_class: "equity", region: "US", tracked_index: "S&P 500", aum_usd_m: 600000, ter_pct: 0.09, distribution: "dist", instrument_type: "ETF", enrichment_status: "ok", last_seen: "2026-10-21" };
    const rows = [base, { ...base, listing_key: "IE0000000001", mnemonic: "EUA", aum_usd_m: 100, distribution: "acc" }, { ...base, listing_key: "NASDAQ:BND", mnemonic: "BND", asset_class: "bond", region: "Global", tracked_index: "Bond index", aum_usd_m: 1000 }];
    expect(rankShortlist(rows,"2026-10-21",3)).toEqual(["NASDAQ:BND","IE0000000001","NYSEARCA:SPY"]);
    expect(rankShortlist([{ ...base, tracked_index: "A", aum_usd_m: null, ter_pct: 0.2 }, { ...base, listing_key: "NASDAQ:LOW", mnemonic: "LOW", tracked_index: "B", aum_usd_m: null, ter_pct: 0.1 }],"2026-10-21",2)).toEqual(["NASDAQ:LOW","NYSEARCA:SPY"]);
    expect(rankShortlist([{ ...base, last_seen: "2026-08-01" }],"2026-10-21")).toEqual([]);
  });
});
