import { expect, it } from "vitest";
import { drawdownHit, gateSymbols, insiderCluster, parseArgs, relevantFiling, valuationHit } from "./detect";

it("gates 8-K items, 10-Q, 10-K and amendments, ignoring other forms", () => {
  for (const form of ["10-Q", "10-K", "10-Q/A", "10-K/A"]) expect(relevantFiling({ form, items: "" })).toBe(true);
  for (const item of ["2.02", "4.02", "5.02"]) expect(relevantFiling({ form: "8-K", items: `1.01,${item},9.01` })).toBe(true);
  expect(relevantFiling({ form: "8-K/A", items: "5.02" })).toBe(true);
  expect(relevantFiling({ form: "8-K", items: "1.01,9.01" })).toBe(false);
  expect(relevantFiling({ form: "4", items: "" })).toBe(false);
});

const buy = (accession: string, ownerCik: string, date = "2026-10-01", isNew = true) => ({ symbol: "NVDA", accession, date, ownerCik, trades: [{ code: "P", date }], isNew });
it("requires three opportunistic Form 4 buys in 30 days, one still new", () => {
  const rows = [buy("a", "1"), buy("b", "2"), buy("c", "3")];
  expect(insiderCluster(rows, "2026-10-06")).toEqual(["NVDA"]);
  expect(insiderCluster(rows.map((r) => ({ ...r, isNew: false })), "2026-10-06")).toEqual([]);
  expect(insiderCluster(rows.slice(0, 2), "2026-10-06")).toEqual([]);
  expect(insiderCluster([buy("old", "1", "2025-10-05"), ...rows], "2026-10-06")).toEqual([]);
});

it("marks only band crossings and an empty day produces no symbols", () => {
  expect(drawdownHit({ symbol: "NVDA", previous: -19, current: -21 })).toBe(true);
  expect(drawdownHit({ symbol: "NVDA", previous: -21, current: -22 })).toBe(false);
  expect(valuationHit({ symbol: "NVDA", previous: 26, current: 24 })).toBe(true);
  expect(valuationHit({ symbol: "NVDA", previous: 24, current: 23 })).toBe(false);
  const empty = { filings: [{ symbol: "NVDA", accession: "a", form: "8-K", items: "1.01" }], insiders: [], drawdowns: [], valuations: [], today: "2026-10-06" };
  expect(gateSymbols(empty, ["NVDA", "AMD"])).toEqual({ symbols: [], reasons: {} });
  expect(gateSymbols({ ...empty, filings: [{ symbol: "AMD", accession: "b", form: "10-Q", items: "" }] }, ["NVDA", "AMD"]).symbols).toEqual(["AMD"]);
});

it("validates detect arguments", () => {
  expect(parseArgs(["--output", "/tmp/gate.json", "--since", "2026-10-01"])).toEqual({ out: "/tmp/gate.json", since: "2026-10-01" });
  expect(() => parseArgs(["--since", "2026-02-30"])).toThrow();
  expect(() => parseArgs(["--bogus"])).toThrow();
});
