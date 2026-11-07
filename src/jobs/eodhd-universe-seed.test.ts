import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { BulkLastDayBar, Fundamentals } from "../data-providers/eodhd/client";
import { parseSeedArgs, rankSeedCandidates, runUniverseSeed, seedTicker, type SeedListing } from "./eodhd-universe-seed";

const rates = new Map([
  ["ECB_EURUSD", { value: 1.2, date: "2026-11-07" }],
  ["ECB_EURGBP", { value: 0.8, date: "2026-11-07" }],
]);

const real = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "src/data-providers/eodhd/fixtures/real", name), "utf8"));
const lse = (real("lse-symbols.json").response as { Code: string; Name: string; Currency: string; Type: string }[])
  .map((row): SeedListing => ({ vendorSymbol: `${row.Code}.LSE`, code: row.Code, exchange: "LSE", name: row.Name, currency: row.Currency, type: row.Type }));
const eod = (name: string, code: string): BulkLastDayBar => ({ ...real(name).response[0], code });

describe("EU universe seeding", () => {
  it("keeps the seed schedule suspended and enables ECB rates on the macro job", () => {
    const base = join(process.cwd(), "deploy/gitops/gitops/apps/invest-buddy/base");
    const seed = readFileSync(join(base, "eodhd-universe-seed-cronjob.yaml"), "utf8");
    const macro = readFileSync(join(base, "macro-cronjob.yaml"), "utf8");
    expect(seed).toContain("suspend: true");
    expect(seed).toContain("dist/jobs/eodhd-universe-seed.js");
    expect(macro).toMatch(/name: ECB_FX_ENABLED\n\s+value: "on"/);
  });

  it("uses a USD price floor and ranks traded value in USD", () => {
    const rows = rankSeedCandidates([...lse, { ...lse[0], vendorSymbol: "FUND.LSE", code: "FUND", name: "Example ETF" }],
      [eod("lse-hsba-eod.json", "HSBA"), eod("lse-shel-eod.json", "SHEL"), eod("lse-vod-eod.json", "VOD"),
        { ...eod("lse-hsba-eod.json", "HSBA"), code: "FUND" }], 2, 5, rates, "2026-11-07");
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.vendorSymbol.endsWith(".LSE") && row.code !== "FUND")).toBe(true);
    expect(rows[0].tradedValue).toBeGreaterThanOrEqual(rows[1].tradedValue);
  });

  it("includes sub-five EUR and GBP quotes above USD 5, divides GBX by 100, and skips unavailable FX", () => {
    const stock = (code: string, currency: string): SeedListing => ({ vendorSymbol: `${code}.XETRA`, code, exchange: "XETRA", name: `${code} AG`, currency, type: "Common Stock" });
    const listings = [stock("EUR", "EUR"), stock("GBP", "GBP"), stock("PENCE", "GBX"), stock("USD", "USD"), stock("CHF", "CHF")];
    const bulk = [
      { code: "EUR", close: 4.5, volume: 1_200_000 },
      { code: "GBP", close: 4, volume: 1_200_000 },
      { code: "PENCE", close: 400, volume: 1_000_000 },
      { code: "USD", close: 6, volume: 1_500_000 },
      { code: "CHF", close: 100, volume: 1_000_000 },
    ] as BulkLastDayBar[];
    const ranked = rankSeedCandidates(listings, bulk, 5, 5, rates, "2026-11-07");
    expect(ranked.map((row) => row.code)).toEqual(["USD", "GBP", "EUR", "PENCE"]);
    expect(ranked.find((row) => row.code === "PENCE")?.tradedValue).toBeCloseTo(6_000_000);
    expect(rankSeedCandidates(listings, bulk, 5, 5, new Map(), "2026-11-07").map((row) => row.code)).toEqual(["USD"]);
  });

  it("stores history and dated fundamentals, resumes completed candidates, and survives one symbol failure", async () => {
    const ready = new Set<string>();
    const written: string[] = [];
    const store = {
      async readySymbols() { return ready; },
      async fxRates() { return rates; },
      async save(listing: SeedListing, bars: unknown[], facts: unknown[]) { written.push(`${listing.vendorSymbol}:${bars.length}:${facts.length}`); ready.add(listing.vendorSymbol); },
    };
    const client = {
      eodBulkLastDay: async () => [eod("lse-hsba-eod.json", "HSBA"), eod("lse-shel-eod.json", "SHEL")],
      eod: async (symbol: string) => symbol === "SHEL.LSE" ? Promise.reject(new Error("network")) : real("lse-hsba-eod.json").response,
      splits: async () => [],
      fundamentals: async () => real("hsba-full.json").response as Fundamentals,
      getCallCosts: () => ({ "eod-bulk-last-day": 100, eod: 1, splits: 1, fundamentals: 10 }),
    };
    const first = await runUniverseSeed(client, store, lse.slice(0, 2), { topPerExchange: 2, maxCalls: 300, minPrice: 5, today: "2026-11-07" });
    expect(first.saved).toBe(1);
    expect(first.failures).toBe(1);
    expect(written[0]).toMatch(/^HSBA.LSE:\d+:[1-9]/);
    const second = await runUniverseSeed(client, store, lse.slice(0, 1), { topPerExchange: 2, maxCalls: 300, minPrice: 5, today: "2026-11-07" });
    expect(second.saved).toBe(0);
    expect(written).toHaveLength(1);
  });

  it("caps calls before requests and makes dry runs write nothing", async () => {
    const store = { readySymbols: async () => new Set<string>(), fxRates: async () => rates, save: async () => { throw new Error("write in dry run"); } };
    const client = {
      eodBulkLastDay: async () => [eod("lse-hsba-eod.json", "HSBA")],
      eod: async () => real("lse-hsba-eod.json").response,
      splits: async () => [], fundamentals: async () => real("hsba-full.json").response as Fundamentals,
      getCallCosts: () => ({ "eod-bulk-last-day": 100, eod: 0, splits: 0, fundamentals: 0 }),
    };
    expect((await runUniverseSeed(client, store, lse.slice(0, 1), { topPerExchange: 1, maxCalls: 100, minPrice: 5 })).saved).toBe(0);
    expect((await runUniverseSeed(client, store, lse.slice(0, 1), { topPerExchange: 1, maxCalls: 200, minPrice: 5, dryRun: true })).saved).toBe(0);
  });
  it("seeds US names only when asked, under their bare code", async () => {
    expect(parseSeedArgs([]).exchanges).toBeUndefined();
    expect(parseSeedArgs(["--exchanges", "US", "--top-per-exchange", "400"])).toMatchObject({ exchanges: ["US"], topPerExchange: 400 });
    expect(() => parseSeedArgs(["--exchanges", "XX"])).toThrow();
    const us: SeedListing = { vendorSymbol: "NEWCO.US", code: "NEWCO", exchange: "US", name: "NewCo Inc", currency: "USD", type: "Common Stock" };
    expect(seedTicker(us)).toBe("NEWCO");
    expect(seedTicker(lse[0])).toBe(lse[0].vendorSymbol);
    const saved: string[] = [];
    const store = { readySymbols: async () => new Set<string>(), fxRates: async () => rates, save: async (listing: SeedListing, _bars: unknown[], facts: { ticker: string }[]) => { saved.push(`${seedTicker(listing)}:${facts[0].ticker}`); } };
    const client = {
      eodBulkLastDay: async () => [{ ...eod("lse-hsba-eod.json", "NEWCO"), close: 20, volume: 1_000_000 }],
      eod: async () => real("lse-hsba-eod.json").response,
      splits: async () => [], fundamentals: async () => real("hsba-full.json").response as Fundamentals,
      getCallCosts: () => ({ "eod-bulk-last-day": 100, eod: 1, splits: 1, fundamentals: 10 }),
    };
    const result = await runUniverseSeed(client, store, [us], { topPerExchange: 5, maxCalls: 300, minPrice: 5, today: "2026-11-07" });
    expect(result.saved).toBe(1);
    expect(saved).toEqual(["NEWCO:NEWCO"]);
  });
});
