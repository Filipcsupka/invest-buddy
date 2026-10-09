import { describe, expect, it } from "vitest";
import { computeSignals, ratings, SIGNAL_RULES, SIZE_TIERS, TIERS_FOR_ACTION, tierFits, type SignalField, type SignalPortfolio, type SignalSymbolInput } from "./signals";
import type { Technicals } from "../data/technicals";

const tech = (over: Partial<Technicals> = {}): Technicals => ({ date: "2026-10-05", close: 100, return1dPercent: 0.5, return5dPercent: -3, return20dPercent: 2, return60dPercent: 8, vsMa20Percent: -2, vsMa50Percent: 4, vsMa200Percent: 15, belowHigh20Percent: 7, belowHigh52wPercent: 8, aboveLow52wPercent: 60, rangePosition52w: 85, rsi14: 48, avgVolume20: 1e6, volumeRatio: 1, atrPercent14: 2.5, relativeStrength20: 1.5, relativeStrength60: 3, regime: "pullback", ...over });
const f = (value: boolean | null, over: Partial<SignalField> = {}): SignalField => ({ value, agreement: "agree", verified: true, carriedFrom: null, ...over });
const sym = (symbol: string, over: Partial<SignalSymbolInput> = {}): SignalSymbolInput => ({
  symbol, held: null, score: { total: 19, state: "Setup met (>=18)" },
  fields: { revenueAccelerating: f(true), revenueDeclining: f(false), epsBeat: f(true), guidanceRaised: f(true), guidanceCut: f(false), productCatalyst: f(true) },
  expiredFields: [], technicals: tech(), ...over,
});
const portfolio = (over: Partial<SignalPortfolio> = {}): SignalPortfolio => ({ cashEur: 1000, investedEur: 3000, positions: [{ symbol: "CSPX", valueEur: 2100 }], monthlyContributionEur: 200, ...over });
const one = (s: SignalSymbolInput, p: SignalPortfolio | null = null) => computeSignals([s], p).find((x) => x.symbol === s.symbol)!;
/** Range regime, healthy RSI, no relative strength: entry Good, not Strong, no pullback. */
const flatEntry = tech({ regime: "range", rsi14: 50, relativeStrength20: null, relativeStrength60: null });
/** No fresh execution, so no conviction: a good entry gives ADD. */
const noExec = { ...sym("X").fields, epsBeat: f(null), guidanceRaised: f(null) };
/** Carried revenue data: company capped at Good, so a start stays a STARTER. */
const starterFields = { ...sym("X").fields, revenueAccelerating: f(true, { carriedFrom: "2026-09-20" }) };
const decision = (s: { action: string; sizeTier: string; ratings: unknown; unconfirmed: boolean; reasons: string[] }) => ({ action: s.action, sizeTier: s.sizeTier, ratings: s.ratings, unconfirmed: s.unconfirmed, reasons: s.reasons });

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
    expect(ratings(sym("A", { technicals: flatEntry })).ratings.entry).toBe("Good");
  });
});

describe("actions from data only, no portfolio", () => {
  it("HIGH_CONVICTION_ADD with tier ADD_HALF when every conviction condition holds", () => {
    expect(one(sym("C"))).toMatchObject({ action: "HIGH_CONVICTION_ADD", sizeTier: "ADD_HALF", amountMinEur: 0, amountMaxEur: 0, ruleConfigVersion: SIGNAL_RULES.version });
    expect(one(sym("C", { fields: { ...sym("C").fields, productCatalyst: f(true, { carriedFrom: "2026-09-01" }) } })).action).not.toBe("HIGH_CONVICTION_ADD");
  });
  it("ADD with tier ADD_THIRD on a good entry without conviction", () => {
    expect(one(sym("A", { fields: noExec, score: { total: 18, state: "Setup met (>=18)" } }))).toMatchObject({ action: "ADD", sizeTier: "ADD_THIRD" });
    expect(one(sym("A", { fields: { ...sym("A").fields, epsBeat: f(null), guidanceRaised: f(null) } }))).toMatchObject({ action: "ADD", sizeTier: "ADD_THIRD" });
  });
  it("START_POSITION on an average entry, with the tier by strength", () => {
    expect(one(sym("S", { technicals: flatEntry }))).toMatchObject({ action: "START_POSITION", sizeTier: "FULL" });
    const noExecution = { ...sym("S").fields, epsBeat: f(null), guidanceRaised: f(null), insiderOrInstitutionalBuying: f(true) };
    expect(one(sym("S", { technicals: flatEntry, fields: noExecution }))).toMatchObject({ action: "START_POSITION", sizeTier: "STANDARD" });
    expect(one(sym("S", { technicals: flatEntry, fields: starterFields, score: { total: 18, state: "Setup met (>=18)" } }))).toMatchObject({ action: "START_POSITION", sizeTier: "STARTER" });
  });
  it("score boundary: 18 buys, 14, 15 and 17 are WATCH (Guide s6, s8)", () => {
    expect(SIGNAL_RULES.minScoreForBuy).toBe(18);
    const at = (total: number, over: Partial<SignalSymbolInput> = {}) => one(sym("B", { score: { total, state: "x" }, ...over }));
    for (const total of [14, 15, 17]) {
      for (const over of [{}, { technicals: flatEntry }]) expect(at(total, over)).toMatchObject({ action: "WATCH", sizeTier: "NONE" });
    }
    expect(at(17).reasons.join()).toMatch(/Score 17 is below the buy threshold of 18; 15 to 17 is WATCH/);
    expect(at(14).reasons.join()).toMatch(/Score 14 is below the buy threshold of 18\.$/);
    expect(at(18, { technicals: flatEntry })).toMatchObject({ action: "START_POSITION" });
    expect(at(18, { fields: { ...sym("B").fields, epsBeat: f(null), guidanceRaised: f(null) } })).toMatchObject({ action: "ADD", sizeTier: "ADD_THIRD" });
    expect(at(18)).toMatchObject({ action: "HIGH_CONVICTION_ADD" });
    expect(at(15, { held: { valueEur: 100 } })).toMatchObject({ action: "HOLD", sizeTier: "NONE" });
  });
  it("unconfirmed or carried data keeps a start to a starter", () => {
    const carried = sym("S", { technicals: flatEntry, fields: { ...sym("S").fields, revenueAccelerating: f(true, { carriedFrom: "2026-09-20" }) } });
    expect(one(carried)).toMatchObject({ action: "START_POSITION", sizeTier: "STARTER", unconfirmed: true });
  });
  it("insufficient evidence is WATCH with no size and unconfirmed", () => {
    const s = one(sym("T", { fields: { revenueAccelerating: f(true) } }));
    expect(s).toMatchObject({ action: "WATCH", sizeTier: "NONE", amountMinEur: 0, amountMaxEur: 0, unconfirmed: true });
    expect(s.reasons[0]).toMatch(/Insufficient evidence/);
  });
  it("a rejection breaks the thesis of a held name and only watches a name that is not held", () => {
    const bad = { fields: { ...sym("X").fields, revenueDeclining: f(true) } };
    expect(one(sym("X", { ...bad, held: { valueEur: 400 } }))).toMatchObject({ action: "THESIS_BROKEN", sizeTier: "NONE" });
    expect(one(sym("X", bad))).toMatchObject({ action: "WATCH", sizeTier: "NONE" });
    expect(one(sym("X", { score: { total: 0, state: "Criteria broken" }, held: { valueEur: 400 } })).action).toBe("THESIS_BROKEN");
  });
  it("REDUCE for a held name with a Weak company rating in a downtrend, WATCH when not held", () => {
    const weak = { fields: { narrativeChanged: f(true), revenueAccelerating: f(null), epsBeat: f(false), guidanceRaised: f(null), productCatalyst: f(false), insiderOrInstitutionalBuying: f(null) }, technicals: tech({ regime: "downtrend" }), score: { total: 6, state: "Ignore" } };
    expect(one(sym("R", { ...weak, held: { valueEur: 400 } }))).toMatchObject({ action: "REDUCE", sizeTier: "NONE", amountMaxEur: 0 });
    expect(one(sym("R", weak))).toMatchObject({ action: "WATCH", sizeTier: "NONE" });
  });
  it("never buys in a downtrend, whatever the position is worth against its cost", () => {
    expect(one(sym("D", { held: { valueEur: 100 }, technicals: tech({ regime: "downtrend" }) }))).toMatchObject({ action: "HOLD", sizeTier: "NONE" });
    expect(one(sym("D", { technicals: tech({ regime: "downtrend" }) }))).toMatchObject({ action: "WATCH", sizeTier: "NONE" });
  });
  it("held never changes a buy action or tier", () => {
    for (const s of [sym("C"), sym("A", { fields: noExec, score: { total: 18, state: "Setup met (>=18)" } }), sym("S", { technicals: flatEntry })]) {
      expect(decision(one({ ...s, held: { valueEur: 300 } }))).toEqual(decision(one(s)));
    }
  });
  it("every action carries a tier that fits it, and CSPX_ALLOCATION is never produced", () => {
    const all = computeSignals(["A", "B", "C", "D", "E"].map((n, i) => sym(n, { score: { total: 14 + i * 2, state: "Watch" }, technicals: tech({ regime: (["pullback", "range", "uptrend", "downtrend", "pullback"] as const)[i] }) })), portfolio({ cashEur: 50 }));
    for (const s of all) expect(tierFits(s.action, s.sizeTier), `${s.symbol} ${s.action} ${s.sizeTier}`).toBe(true);
    expect(all.some((s) => s.action === "CSPX_ALLOCATION" || s.symbol === "CSPX")).toBe(false);
    expect(computeSignals([], portfolio()).length).toBe(0);
    expect(Object.values(TIERS_FOR_ACTION).flat().every((t) => (SIZE_TIERS as readonly string[]).includes(t))).toBe(true);
  });
});

describe("the portfolio is private context only", () => {
  const universe = [sym("C"), sym("A", { fields: noExec, score: { total: 18, state: "Setup met (>=18)" } }), sym("S", { technicals: flatEntry }), sym("T", { fields: { revenueAccelerating: f(true) } }), sym("D", { technicals: tech({ regime: "downtrend" }) })];
  it("the same inputs give the same action, tier, ratings and reasons with or without a baseline, whatever the cash", () => {
    const bare = computeSignals(universe, null).map(decision);
    expect(computeSignals(universe, portfolio()).map(decision)).toEqual(bare);
    expect(computeSignals(universe, portfolio({ cashEur: 0 })).map(decision)).toEqual(bare);
    expect(computeSignals(universe, portfolio({ cashEur: 1e6 })).map(decision)).toEqual(bare);
  });
  it("without a baseline every owner amount is 0", () => {
    for (const s of computeSignals(universe, null)) expect([s.amountMinEur, s.amountMaxEur]).toEqual([0, 0]);
  });
  it("with a baseline the owner band follows the tier as a share of cash", () => {
    expect(one(sym("C"), portfolio())).toMatchObject({ action: "HIGH_CONVICTION_ADD", amountMinEur: 150, amountMaxEur: 300 });
    expect(one(sym("S", { technicals: flatEntry, fields: starterFields, score: { total: 18, state: "Setup met (>=18)" } }), portfolio())).toMatchObject({ sizeTier: "STARTER", amountMinEur: 50, amountMaxEur: 100 });
    expect(one(sym("R", { held: { valueEur: 400 }, fields: { narrativeChanged: f(true), epsBeat: f(false), productCatalyst: f(false) }, technicals: tech({ regime: "downtrend" }), score: { total: 6, state: "Ignore" } }), portfolio())).toMatchObject({ action: "REDUCE", amountMinEur: 100, amountMaxEur: 200 });
  });
  it("a band under the minimum is EUR 0 but keeps the action and tier", () => {
    expect(one(sym("A", { fields: noExec, score: { total: 18, state: "Setup met (>=18)" } }), portfolio({ cashEur: 100 }))).toMatchObject({ action: "ADD", sizeTier: "ADD_THIRD", amountMaxEur: 0 });
  });
  it("the position limit caps an owner band and notes it privately", () => {
    const capped = one(sym("H", { held: { valueEur: 740 } }), portfolio({ investedEur: 3000 }));
    expect(capped.action).toBe("HIGH_CONVICTION_ADD");
    expect(capped.amountMaxEur).toBeLessThanOrEqual(Math.floor((0.25 * 3000 - 740) / 0.75));
    expect(capped.ownerNotes.join()).toMatch(/Position limit/);
    expect(capped.reasons.join()).not.toMatch(/Position limit|EUR/);
  });
  it("deploy limit: owner bands stay within the share of cash, best signals first, and no action changes", () => {
    const all = computeSignals(["A", "B", "C", "D", "E", "F", "G", "H"].map((n) => sym(n, { technicals: flatEntry, fields: starterFields, score: { total: 18, state: "Setup met (>=18)" } })), portfolio());
    expect(all.reduce((n, s) => n + s.amountMaxEur, 0)).toBeLessThanOrEqual(600);
    expect(all.every((s) => s.action === "START_POSITION" && s.sizeTier === "STARTER")).toBe(true);
    expect(all.filter((s) => s.amountMaxEur === 0).map((s) => s.symbol)).toEqual(["G", "H"]);
  });
});

describe("determinism", () => {
  const universe = ["NVDA", "AMD", "MSFT", "CRWD", "NET"].map((n, i) => sym(n, { held: i % 2 ? { valueEur: 200 + i * 50 } : null, score: { total: 16 + i, state: "Watch" }, technicals: tech({ regime: i === 2 ? "downtrend" : "pullback", rsi14: 40 + i * 6 }) }));
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
