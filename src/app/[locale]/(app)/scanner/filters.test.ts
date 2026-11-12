import { expect, it } from "vitest";
import type { StoreRow } from "@/data/store";
import { ruleGroups } from "@/i18n/rules";
import { displayedState } from "@/components/view-model";
import { filterScores, hasFilters, parseFilters } from "./filters";

/** Rule hits with data on every rule; the listed ids are met. */
const hits = (...met: string[]) => ruleGroups.flatMap((group) => group.rules).map((rule) => ({ id: rule.id, points: rule.points, matched: met.includes(rule.id) }));
/** 15 of 23 core points: displayed Watch. */
const watchHits = hits("revenue-acceleration", "earnings", "above-ma", "uptrend", "green-volume");
/** 13 of 23 core points: displayed Wait. */
const waitHits = hits("revenue-acceleration", "earnings", "above-ma", "uptrend");

const rows = [
  { instrument: { ticker: "AAA", name: "Alpha", sector: "Cloud", source: "guide" }, result: { state: "Watch", total: 16, fundamentals: 7, technical: 6, macro: 3, ruleHits: watchHits } },
  { instrument: { ticker: "BBB", name: "Beta", sector: "Energy", source: "discovery" }, result: { state: "Wait", total: 12, fundamentals: 4, technical: 6, macro: 2, ruleHits: waitHits } },
  { instrument: { ticker: "CCC", name: "Gamma", sector: "Cloud", source: "sample extension" }, result: { state: "Watch", total: 15, fundamentals: 8, technical: 5, macro: 2, ruleHits: watchHits } },
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

it("filters on the displayed state, so a stored Setup shown as Watch sits in the Watch group", () => {
  // Stored: 18 of 25 with the catalyst bonus, Setup met. Displayed: 16 of 23 core points (69.6%), Watching.
  const result = { state: "Setup met (>=18)", total: 18, fundamentals: 10, technical: 8, macro: 0, ruleHits: hits("revenue-acceleration", "earnings", "catalyst", "accumulation", "above-ma", "uptrend", "green-volume") };
  const mixed = [{ instrument: { ticker: "SET", name: "Set", sector: "Cloud", source: "guide" }, result }] as unknown as StoreRow[];
  expect(displayedState(result as never)).toBe("watch");
  expect(filterScores(mixed, parseFilters({ state: "setup" }), new Set())).toEqual([]);
  expect(filterScores(mixed, parseFilters({ state: "watch" }), new Set()).map((row) => row.instrument.ticker)).toEqual(["SET"]);
  // No rule hits stored: shown as not enough data, filtered the same way.
  const bare = [{ instrument: { ticker: "OLD", name: "Old", sector: "Cloud", source: "guide" }, result: { state: "Watch", total: 15, fundamentals: 7, technical: 6, macro: 2 } }] as unknown as StoreRow[];
  expect(filterScores(bare, parseFilters({ state: "insufficient" }), new Set())).toHaveLength(1);
});
