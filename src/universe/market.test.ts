import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { knownUsdPerUnit, normalizeCurrency, suffixExchange, UNIVERSE_EXCHANGES } from "./market";

describe("market helpers", () => {
  it("keeps the migration 099 exchange CHECK equal to UNIVERSE_EXCHANGES", () => {
    const sql = readFileSync(join(process.cwd(), "migrations/099_universe_exchange.sql"), "utf8");
    const list = /exchange IN \(([^)]*)\)/.exec(sql)?.[1];
    expect(list?.split(",").map((item) => item.trim().replace(/^'|'$/g, ""))).toEqual([...UNIVERSE_EXCHANGES]);
  });
  it("never turns an unknown currency into a 1:1 conversion", () => {
    expect(knownUsdPerUnit({})).toBe(1);
    expect(knownUsdPerUnit({ exchange: "US" })).toBe(1);
    expect(knownUsdPerUnit({ currency: "USD", exchange: "XETRA" })).toBe(1);
    expect(knownUsdPerUnit({ currency: "", exchange: "XETRA" })).toBeNull();
    expect(knownUsdPerUnit({ currency: "", exchange: "US" })).toBeNull();
    expect(knownUsdPerUnit({ exchange: "XETRA" })).toBeNull();
    expect(knownUsdPerUnit({ currency: "EUR", usdPerUnit: null })).toBeNull();
    expect(knownUsdPerUnit({ currency: "EUR", usdPerUnit: Number.NaN })).toBeNull();
    expect(knownUsdPerUnit({ currency: "EUR", usdPerUnit: 1.16 })).toBe(1.16);
  });
  it("reads pence markers and exchange suffixes", () => {
    expect([normalizeCurrency("GBp"), normalizeCurrency("gbx"), normalizeCurrency("GBP"), normalizeCurrency(null)]).toEqual(["GBX", "GBX", "GBP", null]);
    expect([suffixExchange("SAP.XETRA"), suffixExchange("BRK.B"), suffixExchange("ABC.US"), suffixExchange("AAPL")]).toEqual(["XETRA", null, null, null]);
  });
});
