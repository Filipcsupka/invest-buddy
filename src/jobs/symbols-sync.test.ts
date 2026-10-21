import { describe, expect, it } from "vitest";
import type pg from "pg";
import { syncExchange, syncSymbols } from "./symbols-sync";
import symbols from "../data-providers/eodhd/fixtures/war-symbols.json";
import exchanges from "../data-providers/eodhd/fixtures/exchanges-list.json";

describe("symbols sync", () => {
  it("upserts documented listing rows and delists absent codes in one transaction", async () => {
    const queries: Array<{ sql: string; params?: unknown[] }> = [];
    const db = { query: async (sql: string, params?: unknown[]) => { queries.push({ sql, params }); return { rows: [] }; } };
    expect(await syncExchange(db as never, "WAR", symbols, "2026-10-21")).toBe(2);
    expect(queries.map(({ sql }) => sql.split(" ")[0])).toEqual(["BEGIN", "INSERT", "UPDATE", "COMMIT"]);
    expect(queries[1].params?.slice(0, 4)).toEqual(["CDR.WAR", "CDR", "WAR", "CD PROJEKT SA"]);
    expect(queries[2].params).toEqual(["WAR", ["CDR", "PKN"]]);
  });

  it("does not change rows after an empty response", async () => {
    let queries = 0;
    const db = { query: async () => { queries++; return { rows: [] }; } };
    await expect(syncExchange(db as never, "WAR", [], "2026-10-21")).rejects.toThrow("empty or invalid");
    expect(queries).toBe(0);
  });

  it("skips exchange codes absent from the exchange list", async () => {
    const requested: string[] = [];
    const db = { connect: async () => ({ query: async () => ({ rows: [] }), release: () => undefined }) } as unknown as pg.Pool;
    const eodhd = {
      exchangesList: async () => exchanges,
      exchangeSymbolList: async (exchange: string) => { requested.push(exchange); return symbols; },
      getCallCosts: () => ({ "exchanges-list": 1, "exchange-symbol-list": requested.length }),
    } as never;
    const result = await syncSymbols(db, eodhd, "2026-10-21");
    expect(requested).toEqual(["US", "LSE"]);
    expect(result.skippedCount).toBe(15);
  });
});
