import { expect, it } from "vitest";
import type pg from "pg";
import { EodhdHttpError } from "../data-providers/eodhd/client";
import { parseIndexComponentsArgs, runIndexComponents } from "./eodhd-index-components";

const recordingDb = (due: string[]) => {
  const sql: string[] = [], params: unknown[][] = [];
  const db = { query: async (text: string, values: unknown[]) => {
    sql.push(text); params.push(values);
    return { rows: text.includes("FROM tracked_assets") ? due.map((vendor_symbol) => ({ vendor_symbol })) : [] };
  } } as unknown as Pick<pg.Pool, "query">;
  return { db, sql, params };
};

it("parses bounded options", () => {
  expect(parseIndexComponentsArgs([])).toEqual({ dryRun: false, staleDays: 28, maxCalls: 300 });
  expect(parseIndexComponentsArgs(["--only", "gspc.indx", "--max-calls", "20"])).toMatchObject({ only: ["GSPC.INDX"], maxCalls: 20 });
  expect(() => parseIndexComponentsArgs(["--max-calls", "5"])).toThrow();
});

it("stores lists, records empty ones, respects the cap and logs calls", async () => {
  let calls = 0;
  const filters: string[] = [];
  const api = { fundamentals: async <T>(symbol: string, filter?: string) => {
    calls += 10; filters.push(`${symbol}:${filter}`);
    return (symbol === "VIX.INDX" ? [] : { "0": { Code: "AIZ", Exchange: "US", Weight: 0.0002 } }) as T;
  }, getCallCosts: () => ({ fundamentals: calls }) };
  const { db, sql, params } = recordingDb(["GSPC.INDX", "VIX.INDX", "GDAXI.INDX"]);
  const result = await runIndexComponents(db, api, parseIndexComponentsArgs(["--max-calls", "20"]), "2026-11-08");
  expect(result).toMatchObject({ due: 3, refreshed: 1, empty: 1, capped: 1, rows: 1, calls: 20, failures: 0 });
  expect(filters).toEqual(["GSPC.INDX:Components", "VIX.INDX:Components"]);
  expect(params[0]).toEqual(["2026-10-12", null]);
  expect(params).toContainEqual(["VIX.INDX", 0, "empty"]);
  expect(sql.at(-1)).toContain("eodhd_call_log");
});

it("stops on an access error and skips requests on a dry run", async () => {
  const api = { fundamentals: async () => { throw new EodhdHttpError(401, "fundamentals"); }, getCallCosts: () => ({ fundamentals: 10 }) };
  expect(await runIndexComponents(recordingDb(["GSPC.INDX", "NDX.INDX"]).db, api, parseIndexComponentsArgs([]), "2026-11-08")).toMatchObject({ failures: 1, failedSymbols: "GSPC.INDX" });
  const dry = recordingDb(["GSPC.INDX"]);
  expect(await runIndexComponents(dry.db, null, parseIndexComponentsArgs(["--dry-run"]), "2026-11-08")).toMatchObject({ due: 1, estimatedCalls: 10, calls: 0 });
  expect(dry.sql).toHaveLength(1);
});
