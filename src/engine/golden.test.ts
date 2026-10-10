import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { computeSignals, SIGNAL_RULES } from "./signals";
import { score, SCORE_RULES_VERSION } from "./score";
import { goldenInput, expectedFrom, type GoldenFixture } from "./golden";
import type { Fundamentals, Macro, OHLCV } from "./types";

/**
 * Golden tests. A fixture file freezes the data-only signal for each ticker on one date. When a rule or rating table changes, the tests below fail per
 * ticker with a diff of action, tier, ratings, points and reasons. To accept an intended change: bump SIGNAL_RULES.version or SCORE_RULES_VERSION,
 * regenerate the fixtures (docs/data.md, "Golden fixtures") and review the fixture diff in the same PR.
 */
const dir = join(__dirname, "fixtures");
const files = readdirSync(dir).filter((f) => /^golden-.+\.json$/.test(f)).sort();
const fixtures = files.map((file) => ({ file, text: readFileSync(join(dir, file), "utf8"), data: JSON.parse(readFileSync(join(dir, file), "utf8")) as GoldenFixture }));

describe("golden fixtures", () => {
  it("at least the hand-built edge set is present", () => {
    expect(files).toContain("golden-edges.json");
  });
  it("hold no private data", () => {
    for (const { file, text } of fixtures) {
      for (const word of ["costEur", "valueEur", "cashEur", "amountMinEur", "amountMaxEur", "positions", "held", "quantity"]) expect(text, `${file} contains ${word}`).not.toContain(word);
    }
  });
  for (const { file, data } of fixtures) {
    describe(file, () => {
      it("was built with the current rule versions", () => {
        expect({ signal: data.signalRulesVersion, score: data.scoreRulesVersion }).toEqual({ signal: SIGNAL_RULES.version, score: SCORE_RULES_VERSION });
      });
      const signals = computeSignals(data.symbols.map(goldenInput), null);
      it("covers every symbol once, sorted", () => {
        expect(signals.map((s) => s.symbol)).toEqual(data.symbols.map((s) => s.symbol));
        expect(new Set(data.symbols.map((s) => s.symbol)).size).toBe(data.symbols.length);
      });
      it.each(data.symbols.map((s) => [s.symbol, s] as const))("%s keeps action, tier, ratings, points and reasons", (symbol, golden) => {
        const actual = signals.find((s) => s.symbol === symbol)!;
        expect(expectedFrom(actual)).toEqual(golden.expected);
        expect(actual.amountMinEur).toBe(0);
        expect(actual.amountMaxEur).toBe(0);
      });
    });
  }
});

describe("golden threshold edges", () => {
  const edges = fixtures.find((f) => f.file === "golden-edges.json")!.data;
  const by = (symbol: string) => edges.symbols.find((s) => s.symbol === symbol)!;
  it("has six names at 15 to 17 and one at 18", () => {
    const totals = edges.symbols.map((s) => s.score.total).sort();
    expect(totals).toEqual([15, 15, 16, 16, 17, 17, 18]);
  });
  it("pins the Guide thresholds: START needs 18, ADD from 15, conviction at 18", () => {
    expect(by("EDGE15A").expected).toMatchObject({ action: "WATCH", sizeTier: "NONE" });
    expect(by("EDGE16A").expected).toMatchObject({ action: "ADD", sizeTier: "ADD_THIRD" });
    expect(by("EDGE17A").expected.action).toBe("WATCH");
    expect(by("EDGE18A").expected).toMatchObject({ action: "HIGH_CONVICTION_ADD", sizeTier: "ADD_HALF" });
  });
});

/** A fixed 260 bar series: steady climb with a wobble, green days on higher volume. Built from the index only, so it is the same on every run. */
const bars = (n = 260, drift = 0.3): OHLCV[] => Array.from({ length: n }, (_, i) => {
  const close = 100 + i * drift + Math.sin(i / 3) * 1.5;
  const open = close - (i % 2 === 0 ? 0.4 : -0.4);
  const date = new Date(Date.UTC(2025, 9, 1) + i * 86400000).toISOString().slice(0, 10);
  return { date, open, high: Math.max(open, close) + 0.5, low: Math.min(open, close) - 0.5, close, volume: close >= open ? 2_000_000 : 1_000_000 };
});
const allKnown: Fundamentals = { revenueGrowthCurrent: 30, revenueGrowthPrior: 20, revenueAccelerating: true, revenueDeclining: false, epsBeat: true, guidanceRaised: true, earningsMissAndGuidanceCut: false, productCatalyst: true, insiderOrInstitutionalAccumulation: true, noRevenue: false, memePump: false };
const macroOn: Macro = { growthSectorRotation: true, dataTailwind: true };

const GOLDEN_UP = { total: 23, fundamentals: 10, technical: 8, macro: 5, state: "Setup met (>=18)", matched: ["revenue-acceleration:4", "earnings:3", "catalyst:2", "accumulation:1", "above-ma:3", "uptrend:3", "green-volume:2", "rotation:2", "macro-data:3"] };
const GOLDEN_UNKNOWN = { total: 13, state: "Wait", unknown: ["revenue-acceleration", "earnings", "catalyst", "rotation", "macro-data"] };
const GOLDEN_DOWN = { total: 17, state: "Criteria broken", rejections: ["Long-term downtrend: close below MA200", "Long-term downtrend: MA50 below MA200"] };
const GOLDEN_VOLUME_ONLY = { total: 18, state: "Setup met (>=18)" };

describe("golden score", () => {
  it("freezes the rule table: ids, points and states for fixed inputs", () => {
    const up = score({ ticker: "UP", bars: bars(), fundamentals: allKnown, macro: macroOn });
    expect({ total: up.total, fundamentals: up.fundamentals, technical: up.technical, macro: up.macro, state: up.state, matched: up.ruleHits.filter((h) => h.matched).map((h) => `${h.id}:${h.points}`) }).toEqual(GOLDEN_UP);
    const unknown = score({ ticker: "UNK", bars: bars(), fundamentals: { ...allKnown, epsBeat: null, guidanceRaised: null, productCatalyst: null, insiderOrInstitutionalAccumulation: null, revenueAccelerating: null }, macro: { growthSectorRotation: null, dataTailwind: null } });
    expect({ total: unknown.total, state: unknown.state, unknown: unknown.ruleHits.filter((h) => h.unknown).map((h) => h.id) }).toEqual(GOLDEN_UNKNOWN);
    const down = score({ ticker: "DN", bars: bars(260, -0.3), fundamentals: allKnown, macro: macroOn });
    expect({ total: down.total, state: down.state, rejections: down.rejectionReasons }).toEqual(GOLDEN_DOWN);
  });
  it("freezes the state thresholds 18, 15 and 12", () => {
    const at = (revenue: boolean | null, total: Partial<Fundamentals>) => score({ ticker: "T", bars: bars(), fundamentals: { ...allKnown, revenueAccelerating: revenue, ...total }, macro: macroOn });
    expect(at(true, {}).state).toBe(GOLDEN_UP.state);
    expect(at(true, { epsBeat: false, guidanceRaised: false, productCatalyst: false, insiderOrInstitutionalAccumulation: false }).total).toBe(GOLDEN_VOLUME_ONLY.total);
    expect(at(true, { epsBeat: false, guidanceRaised: false, productCatalyst: false, insiderOrInstitutionalAccumulation: false }).state).toBe(GOLDEN_VOLUME_ONLY.state);
  });
});
