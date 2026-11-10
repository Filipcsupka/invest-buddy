import { expect, it } from "vitest";
import type { StoreRow } from "@/data/store";
import { filterScores, hasFilters, parseFilters } from "./filters";

const rows = [
  { instrument: { ticker: "AAA", name: "Alpha", sector: "Cloud", source: "guide" }, result: { state: "Watch", total: 16, fundamentals: 7, technical: 6, macro: 3 } },
  { instrument: { ticker: "BBB", name: "Beta", sector: "Energy", source: "discovery" }, result: { state: "Wait", total: 12, fundamentals: 4, technical: 6, macro: 2 } },
  { instrument: { ticker: "CCC", name: "Gamma", sector: "Cloud", source: "sample extension" }, result: { state: "Watch", total: 15, fundamentals: 8, technical: 5, macro: 2 } },
] as unknown as StoreRow[];

it("filters score bounds, sector, F/T/M, state, source, held and search", () => {
  const held = new Set(["AAA"]);
  for (const query of [{ min: "16" }, { max: "16", min: "16" }, { sector: "Cloud", f: "7", t: "6" }, { t: "6", m: "3" }, { state: "watch", source: "guide" }, { held: "yes" }, { q: "alp" }]) {
    expect(filterScores(rows, parseFilters(query), held).map((row) => row.instrument.ticker)).toEqual(["AAA"]);
  }
  expect(filterScores(rows, parseFilters({ min: "15", sector: "Cloud", state: "watch", source: "sample extension" }), held).map((row) => row.instrument.ticker)).toEqual(["CCC"]);
  const localized = [{ instrument: { ticker: "XYZ", name: "Example", sector: "Cybersecurity", source: "guide" }, result: { state: "Watch", total: 15, fundamentals: 7, technical: 6, macro: 2 } }] as unknown as StoreRow[];
  expect(filterScores(localized, parseFilters({ q: "kybernetická" }), held, "sk")).toHaveLength(1);
});

it("round trips URL query values and ignores invalid ranges", () => {
  const original = parseFilters({ state: "watch", min: "12", f: "5", held: "yes", source: "guide" });
  const query = new URLSearchParams(Object.entries(original).filter(([, value]) => value !== null && value !== "" && value !== false).map(([key, value]) => [key, value === true ? "yes" : String(value)]));
  expect(parseFilters(Object.fromEntries(query))).toEqual(original);
  expect(parseFilters({ min: "-1", f: "11", m: "6", state: "bad", source: "other" })).toMatchObject({ min: null, f: null, m: null, state: "", source: "" });
  expect(hasFilters(parseFilters({}))).toBe(false);
  expect(hasFilters(original)).toBe(true);
});
