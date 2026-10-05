import { describe, expect, it } from "vitest";
import { computeSignals, ratings, SIGNAL_RULES, type SignalField, type SignalPortfolio, type SignalSymbolInput } from "./signals";
import type { Technicals } from "../data/technicals";

const tech = (over: Partial<Technicals> = {}): Technicals => ({ date: "2026-10-05", close: 100, return1dPercent: 0.5, return5dPercent: -3, return20dPercent: 2, return60dPercent: 8, vsMa20Percent: -2, vsMa50Percent: 4, vsMa200Percent: 15, belowHigh20Percent: 7, belowHigh52wPercent: 8, aboveLow52wPercent: 60, rangePosition52w: 85, rsi14: 48, avgVolume20: 1e6, volumeRatio: 1, atrPercent14: 2.5, relativeStrength20: 1.5, relativeStrength60: 3, regime: "pullback", ...over });
const f = (value: boolean | null, over: Partial<SignalField> = {}): SignalField => ({ value, agreement: "agree", verified: true, carriedFrom: null, ...over });
const sym = (symbol: string, over: Partial<SignalSymbolInput> = {}): SignalSymbolInput => ({
  symbol, held: null, score: { total: 19, state: "Setup met (>=18)" },
  fields: { revenueAccelerating: f(true), revenueDeclining: f(false), epsBeat: f(true), guidanceRaised: f(true), guidanceCut: f(false), productCatalyst: f(true) },
  expiredFields: [], technicals: tech(), ...over,
});
const portfolio = (over: Partial<SignalPortfolio> = {}): SignalPortfolio => ({ cashEur: 1000, investedEur: 3000, positions: [{ symbol: "CSPX", valueEur: 2100 }], monthlyContributionEur: 200, ...over });
const one = (s: SignalSymbolInput, p: SignalPortfolio | null = portfolio()) => computeSignals([s], p).find((x) => x.symbol === s.symbol)!;

describe("ratings", () => {
  it("company comes from confirmed fundamentals only", () => {
    expect(ratings(sym("A")).ratings.company).toBe("Very strong");
    expect(ratings(sym("A", { fields: { revenueAccelerating: f(true) } })).ratings.company).toBe("Good");
    expect(ratings(sym("A", { fields: { revenueAccelerating: f(true, { agreement: "disputed" }) } })).ratings.company).toBe("Neutral");
    expect(ratings(sym("A", { fields: { revenueAccelerating: f(true, { verified: false }) } })).points.company).toBe(0);
    expect(ratings(sym("A", { fields: { guidanceCut: f(true) } })).ratings.company).toBe("Weak");
  });
  it("carried data caps the company rating at Good and weakens the catalyst", () => {
    const carried = sym("A", { fields: { ...sym("A").fields, productCatalyst: f(true, { carriedFrom: "2026-09-20" }), epsBeat: f(true, { carriedFrom: "2026-09-20" }) } });
    expect(ratings(carried).ratings.company).toBe("Good");
    expect(ratings(carried).points.catalyst).toBe(1 + 1);
  });
  it("entry comes from the technicals", () => {
    expect(ratings(sym("A")).ratings.entry).toBe("Very strong");
    expect(ratings(sym("A", { technicals: tech({ regime: "downtrend", relativeStrength20: -1, relativeStrength60: -1, rsi14: 35 }) })).ratings.entry).toBe("Weak");
    expect(ratings(sym("A", { technicals: tech({ regime: "uptrend", rsi14: 80, vsMa50Percent: 20, relativeStrength20: null, relativeStrength60: null }) })).ratings.entry).toBe("Weak");
    expect(ratings(sym("A", { technicals: null })).ratings.entry).toBe("Neutral");
  });
});

describe("actions", () => {
  it("starts a new name small and never jumps to conviction on the first buy", () => {
    const s = one(sym("NEW"));
    expect(s.action).toBe("START_POSITION");
    expect([s.amountMinEur, s.amountMaxEur]).toEqual([50, 100]);
    expect(s.ruleConfigVersion).toBe(SIGNAL_RULES.version);
  });
  it("adds with conviction to a held name only when every conviction condition holds", () => {
    const held = sym("H", { held: { valueEur: 300 } });
    expect(one(held)).toMatchObject({ action: "HIGH_CONVICTION_ADD", amountMinEur: 150, amountMaxEur: 300 });
    expect(one({ ...held, score: { total: 17, state: "Watch" } }).action).toBe("ADD");
    expect(one({ ...held, fields: { ...held.fields, epsBeat: f(null), guidanceRaised: f(null) } }).action).toBe("ADD");
    expect(one({ ...held, fields: { ...held.fields, productCatalyst: f(true, { carriedFrom: "2026-09-01" }) } }).action).not.toBe("HIGH_CONVICTION_ADD");
  });
  it("insufficient evidence is WATCH EUR 0 and unconfirmed", () => {
    const s = one(sym("T", { fields: { revenueAccelerating: f(true) } }));
    expect(s).toMatchObject({ action: "WATCH", amountMinEur: 0, amountMaxEur: 0, unconfirmed: true });
    expect(s.reasons[0]).toMatch(/Insufficient evidence/);
  });
  it("a rejection rule breaks the thesis of a held name and only watches a new one", () => {
    const bad = { fields: { ...sym("X").fields, revenueDeclining: f(true) } };
    expect(one(sym("X", { ...bad, held: { valueEur: 400 } })).action).toBe("THESIS_BROKEN");
    expect(one(sym("X", bad)).action).toBe("WATCH");
    expect(one(sym("X", { score: { total: 0, state: "Criteria broken" }, held: { valueEur: 400 } })).action).toBe("THESIS_BROKEN");
  });
  it("reduces a held name with a Weak company rating in a downtrend", () => {
    const s = one(sym("R", { held: { valueEur: 400 }, fields: { narrativeChanged: f(true), revenueAccelerating: f(null), epsBeat: f(false), guidanceRaised: f(null), productCatalyst: f(false), insiderOrInstitutionalBuying: f(null) }, technicals: tech({ regime: "downtrend" }), score: { total: 6, state: "Ignore" } }));
    expect(s).toMatchObject({ action: "REDUCE", amountMinEur: 100, amountMaxEur: 200 });
  });
  it("never adds in a downtrend, whatever the position is worth against its cost", () => {
    const s = one(sym("D", { held: { valueEur: 100 }, technicals: tech({ regime: "downtrend" }) }));
    expect(["HOLD", "WATCH"]).toContain(s.action);
    expect(s.amountMaxEur).toBe(0);
  });
  it("holds a held name with a good company and an average entry", () => {
    expect(one(sym("H", { held: { valueEur: 300 }, technicals: tech({ regime: "range", rsi14: 50, relativeStrength20: null, relativeStrength60: null }) })).action).toBe("HOLD");
  });
  it("no baseline means WATCH EUR 0 for every symbol", () => {
    expect(one(sym("A"), null)).toMatchObject({ action: "WATCH", amountMaxEur: 0 });
  });
  it("band under the minimum becomes WATCH, and the position limit caps an add", () => {
    expect(one(sym("A"), portfolio({ cashEur: 150 })).action).toBe("WATCH");
    const capped = one(sym("H", { held: { valueEur: 740 } }), portfolio({ investedEur: 3000 }));
    expect(capped.amountMaxEur).toBeLessThanOrEqual(Math.floor((0.25 * 3000 - 740) / 0.75));
    expect(capped.reasons.join()).toMatch(/Position limit/);
  });
  it("deploy limit: total of the maxima stays within the share of cash, best names first", () => {
    const all = computeSignals(["A", "B", "C", "D", "E", "F", "G", "H"].map((n) => sym(n)), portfolio());
    const buys = all.filter((s) => s.amountMaxEur > 0 && s.action !== "CSPX_ALLOCATION");
    expect(buys.reduce((n, s) => n + s.amountMaxEur, 0)).toBeLessThanOrEqual(600);
    expect(all.filter((s) => s.action === "WATCH").map((s) => s.symbol)).toEqual(["G", "H"]);
  });
  it("CSPX allocation only when nothing else is bought and cash is idle", () => {
    const quiet = computeSignals([sym("Q", { score: { total: 5, state: "Ignore" } })], portfolio());
    expect(quiet.find((s) => s.symbol === "CSPX")).toMatchObject({ action: "CSPX_ALLOCATION", amountMinEur: 100, amountMaxEur: 200 });
    expect(computeSignals([sym("A")], portfolio()).some((s) => s.symbol === "CSPX")).toBe(false);
    expect(computeSignals([], portfolio({ cashEur: 50 })).length).toBe(0);
  });
});

describe("determinism", () => {
  const universe = ["NVDA", "AMD", "MSFT", "CRWD", "NET"].map((n, i) => sym(n, { held: i % 2 ? { valueEur: 200 + i * 50 } : null, score: { total: 14 + i, state: "Watch" }, technicals: tech({ regime: i === 2 ? "downtrend" : "pullback", rsi14: 40 + i * 6 }) }));
  it("the same input twice gives identical output", () => {
    const a = computeSignals(universe, portfolio());
    expect(computeSignals(universe, portfolio())).toEqual(a);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });
  it("symbol order does not matter", () => {
    const base = computeSignals(universe, portfolio());
    for (let seed = 1; seed <= 20; seed++) {
      const shuffled = [...universe].sort((a, b) => ((a.symbol.charCodeAt(0) * seed) % 7) - ((b.symbol.charCodeAt(1) * seed) % 7) || a.symbol.localeCompare(b.symbol) * (seed % 2 ? 1 : -1));
      expect(computeSignals(shuffled, portfolio())).toEqual(base);
    }
    expect(computeSignals([...universe].reverse(), portfolio())).toEqual(base);
  });
  it("does not change its input", () => {
    const copy = JSON.stringify(universe);
    computeSignals(universe, portfolio());
    expect(JSON.stringify(universe)).toBe(copy);
  });
  it("cost basis is not an input: signals ignore it", () => {
    const p = portfolio();
    const withCost = universe.map((s) => (s.held ? { ...s, held: { ...s.held, costEur: 1 } } : s));
    expect(computeSignals(withCost as never, p)).toEqual(computeSignals(universe, p));
  });
});
