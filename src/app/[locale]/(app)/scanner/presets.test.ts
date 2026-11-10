import { describe, expect, it } from "vitest";
import type { StoreRow } from "@/data/store";
import { getMessages } from "@/i18n";
import { ruleGroups } from "@/i18n/rules";
import type { RuleStreak } from "@/db/rules-streak";
import { filterScores, hasFilters, parseFilters } from "./filters";
import { dayLabel, ruleCountLabel, streakText } from "./format";
import { matchesPreset, presetById, presets } from "./presets";

const hit = (id: string, matched: boolean, unknown = false) => ({ id, matched, unknown });
const row = (ticker: string, hits: ReturnType<typeof hit>[]) => ({ instrument: { ticker, name: ticker, sector: "Cloud", source: "guide" }, result: { ticker, state: "Watch", total: 10, fundamentals: 5, technical: 3, macro: 2, ruleHits: hits } }) as unknown as StoreRow;
const rows = [
  row("AAA", [hit("revenue-acceleration", true), hit("earnings", true), hit("uptrend", true), hit("dip", false)]),
  row("BBB", [hit("revenue-acceleration", true), hit("earnings", false), hit("uptrend", true), hit("dip", true)]),
  row("CCC", [hit("revenue-acceleration", true), hit("earnings", true, true)]),
];
const streak = (over: Partial<RuleStreak>): RuleStreak => ({ met: [], sinceDays: 0, atLeast: false, gained: [], lost: [], ...over });
const tickers = (list: StoreRow[]) => list.map((r) => r.instrument.ticker);

describe("presets", () => {
  const known = new Set(ruleGroups.flatMap((group) => group.rules.map((rule) => rule.id)));
  it("define rule and profile presets from real rule ids", () => {
    expect(presets.length).toBeGreaterThanOrEqual(5);
    expect(presets.length).toBe(9);
    for (const preset of presets) for (const id of preset.rules) expect(known.has(id)).toBe(true);
    expect(new Set(presets.map((preset) => preset.id)).size).toBe(presets.length);
  });

  it("filter by every rule met today and treat unknown as not met", () => {
    const query = parseFilters({ preset: "growth-earnings" });
    expect(query.preset).toBe("growth-earnings");
    expect(tickers(filterScores(rows, query, new Set()))).toEqual(["AAA"]);
    expect(tickers(filterScores(rows, parseFilters({ preset: "pullback-uptrend" }), new Set()))).toEqual(["BBB"]);
  });

  it("filter by gained and lost rules from the streak data", () => {
    const streaks = { AAA: streak({ gained: ["earnings"] }), BBB: streak({ lost: ["earnings"] }) };
    expect(tickers(filterScores(rows, parseFilters({ preset: "newly-meeting" }), new Set(), "en", streaks))).toEqual(["AAA"]);
    expect(tickers(filterScores(rows, parseFilters({ preset: "rules-lost" }), new Set(), "en", streaks))).toEqual(["BBB"]);
    expect(filterScores(rows, parseFilters({ preset: "rules-lost" }), new Set())).toEqual([]);
  });

  it("combine with other filters and read from the URL query", () => {
    expect(filterScores(rows, parseFilters({ preset: "growth-earnings", sector: "Energy" }), new Set())).toEqual([]);
    expect(hasFilters(parseFilters({ preset: "trend-volume" }))).toBe(true);
    expect(parseFilters({ preset: "nonsense" }).preset).toBe("");
    expect(presetById("rules-lost")?.kind).toBe("lost");
    expect(matchesPreset(presets[0], [], undefined)).toBe(false);
  });

  it("filters stored profiles without inferring one from score hits", () => {
    const horizon = { ticker: "AAA", profile: "sustained" as const, values: {} };
    const query = parseFilters({ preset: "sustained-growers" });
    expect(filterScores(rows, query, new Set(), "en", {}, {}, { AAA: horizon })).toEqual([rows[0]]);
    expect(filterScores(rows, query, new Set())).toEqual([]);
  });
});

describe("labels", () => {
  it("pluralize English and Slovak", () => {
    expect(dayLabel("en", 1)).toBe("1 day");
    expect(dayLabel("en", 12)).toBe("12 days");
    expect([1, 3, 12].map((n) => dayLabel("sk", n))).toEqual(["1 deň", "3 dni", "12 dní"]);
    expect([1, 2, 5].map((n) => ruleCountLabel("sk", n))).toEqual(["1 pravidlo", "2 pravidlá", "5 pravidiel"]);
  });

  it("give the same figures in both languages", () => {
    for (const s of [{ sinceDays: 12, atLeast: false }, { sinceDays: 90, atLeast: true }, { sinceDays: 0, atLeast: false }]) {
      expect(streakText("en", s).match(/\d+/g)).toEqual(streakText("sk", s).match(/\d+/g));
    }
  });

  it("keep banned advice wording out of the new strings", () => {
    const banned = /\b(buy|sell|recommend\w*|best stocks?|picks?|opportunit\w*)\b|(kúp|nákup|predaj|predať|odporúč|najlepšie akcie|príležitos)/i;
    for (const locale of ["en", "sk"] as const) {
      const s = getMessages(locale).scanner;
      const text = Object.entries(s).filter(([key]) => /^(rulesMet|streak|day|ruleCount|preset)/.test(key)).flatMap(([, value]) => typeof value === "string" ? [value] : Object.values(value as Record<string, { name: string; note: string }>).flatMap((p) => [p.name, p.note]));
      expect(text.length).toBeGreaterThan(20);
      for (const line of text) expect(line).not.toMatch(banned);
    }
  });
});
