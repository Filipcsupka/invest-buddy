import { describe, expect, it } from "vitest";
import { graduation } from "./graduation";
import { ratings, SIGNAL_RULES, signalFor, type SignalField, type SignalRuleHit, type SignalSymbolInput } from "./signals";
import type { Technicals } from "../data/technicals";

const tech = (over: Partial<Technicals> = {}): Technicals => ({ date: "2026-10-05", close: 100, return1dPercent: 0.5, return5dPercent: -3, return20dPercent: 2, return60dPercent: 8, vsMa20Percent: -2, vsMa50Percent: 4, vsMa200Percent: 15, belowHigh20Percent: 7, belowHigh52wPercent: 8, aboveLow52wPercent: 60, rangePosition52w: 85, rsi14: 48, avgVolume20: 1e6, volumeRatio: 1, atrPercent14: 2.5, relativeStrength20: 1.5, relativeStrength60: 3, regime: "pullback", ...over });
/** Range regime, healthy RSI, no relative strength: entry Good, so a buy is a START_POSITION, not an ADD. */
const flatEntry = tech({ regime: "range", rsi14: 50, relativeStrength20: null, relativeStrength60: null });
const f = (value: boolean | null, over: Partial<SignalField> = {}): SignalField => ({ value, agreement: "agree", verified: true, carriedFrom: null, ...over });
const WEIGHTS: [string, number][] = [["revenue-acceleration", 4], ["earnings", 3], ["catalyst", 2], ["accumulation", 1], ["above-ma", 3], ["uptrend", 3], ["green-volume", 2], ["dip", 2], ["rotation", 2], ["macro-data", 3]];
/** Rule hits as score() would give them for these fields and a range regime: a fixture helper. */
const hitsFor = (fields: Record<string, SignalField>): SignalRuleHit[] => {
  const v = (n: string) => fields[n]?.value === true;
  const matched = new Set<string>([
    ...(v("revenueAccelerating") ? ["revenue-acceleration"] : []), ...(v("epsBeat") || v("guidanceRaised") ? ["earnings"] : []),
    ...(v("productCatalyst") ? ["catalyst"] : []), ...(v("insiderOrInstitutionalBuying") ? ["accumulation"] : []), "above-ma", "green-volume",
  ]);
  return WEIGHTS.map(([id, points]) => ({ id, points, matched: matched.has(id) }));
};
const ALL = { revenueAccelerating: f(true), revenueDeclining: f(false), epsBeat: f(true), guidanceRaised: f(true), guidanceCut: f(false), productCatalyst: f(true) };
const sym = (fields: Record<string, SignalField>, over: Partial<SignalSymbolInput> = {}): SignalSymbolInput => ({
  symbol: "X", held: null, score: { total: 19, state: "Setup met (>=18)" }, fields, expiredFields: [], technicals: flatEntry, ruleHits: hitsFor(fields), ...over,
});
/** Company Good (revenue acceleration only), three confirmed key fields: STARTER. */
const goodCompany = { ...ALL, epsBeat: f(false), guidanceRaised: f(false), productCatalyst: f(false) };
/** Company Strong (revenue 4 + earnings 3), catalyst Good (earnings 3): STANDARD. */
const strongCompany = { ...ALL, productCatalyst: f(false) };
/** Revenue acceleration carried: unconfirmed caps the start at STARTER and Company at Good. */
const carriedRevenue = { ...ALL, revenueAccelerating: f(true, { carriedFrom: "2026-09-20" }) };
const cond = (g: ReturnType<typeof graduation>, tier: string, id: string) => g.steps.find((s) => s.tier === tier)!.conditions.find((c) => c.id === id)!;

describe("graduation (P6)", () => {
  it("fixtures give the tiers the tests assume", () => {
    expect(signalFor(sym(ALL))).toMatchObject({ action: "START_POSITION", sizeTier: "FULL" });
    expect(signalFor(sym(strongCompany))).toMatchObject({ action: "START_POSITION", sizeTier: "STANDARD" });
    expect(signalFor(sym(goodCompany))).toMatchObject({ action: "START_POSITION", sizeTier: "STARTER" });
    expect(signalFor(sym(carriedRevenue))).toMatchObject({ action: "START_POSITION", sizeTier: "STARTER", unconfirmed: true });
  });

  it("has no next tier for FULL or for any action that is not START_POSITION", () => {
    expect(graduation(sym(ALL))).toMatchObject({ tier: "FULL", next: null, steps: [], line: null });
    const add = graduation(sym(ALL, { technicals: tech() }));
    expect(add).toMatchObject({ next: null, steps: [], line: null });
    expect(signalFor(sym(ALL, { technicals: tech() })).action).not.toBe("START_POSITION");
    const watch = graduation(sym(ALL, { score: { total: 10, state: "Wait" } }));
    expect(watch).toMatchObject({ tier: "NONE", next: null, line: null });
    const broken = graduation(sym({ ...ALL, guidanceCut: f(true) }, { held: { valueEur: 100 } }));
    expect(broken).toMatchObject({ next: null, line: null });
  });

  it("STARTER with a Good company: STANDARD needs Company Strong and names the open rules", () => {
    const g = graduation(sym(goodCompany));
    expect(g.next).toBe("STANDARD");
    expect(g.steps.map((s) => [s.tier, s.met])).toEqual([["STANDARD", false], ["FULL", false]]);
    const company = cond(g, "STANDARD", "company");
    expect(company).toMatchObject({ met: false, pointsShort: 2 });
    expect(company.missingRules).toEqual([
      { id: "earnings", points: 3, carried: false }, { id: "catalyst", points: 2, carried: false }, { id: "accumulation", points: 1, carried: false },
    ]);
    expect(cond(g, "STANDARD", "score").met).toBe(true);
    expect(cond(g, "STANDARD", "freshData").met).toBe(true);
    expect(g.line).toBe("STANDARD needs: company Strong (now Good, 4 of 10 points, 2 short; open: EPS beat or guidance raise +3, product catalyst +2, insider or institutional buying +1).");
  });

  it("unmet conditions carry structured values for localised rendering (P7)", () => {
    const g = graduation(sym(goodCompany));
    expect(cond(g, "STANDARD", "company").rating).toEqual({ need: "Strong", have: "Good", points: 4, max: 10, narrativeLowers: false });
    expect(cond(g, "STANDARD", "score").score).toBeUndefined();
    const rules = { ...SIGNAL_RULES, startTiers: { ...SIGNAL_RULES.startTiers, standard: { minScore: 20, company: "Good" } } } as unknown as typeof SIGNAL_RULES;
    expect(cond(graduation(sym(goodCompany), rules), "STANDARD", "score").score).toEqual({ needed: 20, evidenced: 25, total: 19 });
  });

  it("FULL step lists catalyst and execution for a STARTER", () => {
    const g = graduation(sym(goodCompany));
    expect(cond(g, "FULL", "company")).toMatchObject({ met: false, pointsShort: 4 });
    expect(cond(g, "FULL", "catalyst")).toMatchObject({ met: false, pointsShort: 4 });
    expect(cond(g, "FULL", "catalyst").missingRules!.map((m) => m.id)).toEqual(["earnings", "catalyst", "accumulation"]);
    expect(cond(g, "FULL", "execution")).toMatchObject({ met: false, text: "a fresh confirmed EPS beat or guidance raise" });
  });

  it("STANDARD: FULL needs Company Very strong and Catalyst Strong", () => {
    const g = graduation(sym(strongCompany));
    expect(g).toMatchObject({ tier: "STANDARD", next: "FULL" });
    expect(g.steps.map((s) => s.tier)).toEqual(["FULL"]);
    expect(cond(g, "FULL", "execution").met).toBe(true);
    expect(cond(g, "FULL", "company")).toMatchObject({ met: false, pointsShort: 1 });
    expect(cond(g, "FULL", "catalyst")).toMatchObject({ met: false, pointsShort: 1 });
    expect(g.line).toBe("FULL needs: company Very strong (now Strong, 7 of 10 points, 1 short; open: product catalyst +2, insider or institutional buying +1); catalyst Strong (now Good, 3 of 6 points, 1 short; open: product catalyst +2, insider or institutional buying +1).");
  });

  it("carried data: fresh data is a condition and the carried rule is named", () => {
    const g = graduation(sym(carriedRevenue));
    expect(g.next).toBe("STANDARD");
    const fresh = cond(g, "STANDARD", "freshData");
    expect(fresh).toMatchObject({ met: false, carriedFields: [{ field: "revenueAccelerating", carriedFrom: "2026-09-20" }] });
    const company = cond(g, "STANDARD", "company");
    // 9 points reach Strong, but the carried hit caps Company at Good.
    expect(company).toMatchObject({ met: false, pointsShort: 0, missingRules: [{ id: "revenue-acceleration", points: 4, carried: true }, { id: "accumulation", points: 1, carried: false }] });
    expect(g.line).toBe("STANDARD needs: company Strong (now Good, 9 of 10 points; open: revenue acceleration on fresh data, insider or institutional buying +1); fresh data for revenueAccelerating (carried from 2026-09-20).");
  });

  it("score condition uses the evidenced share (EN45)", () => {
    const rules = { ...SIGNAL_RULES, startTiers: { ...SIGNAL_RULES.startTiers, standard: { minScore: 20, company: "Good" } } } as unknown as typeof SIGNAL_RULES;
    const full = graduation(sym(goodCompany), rules);
    expect(full.next).toBe("STANDARD");
    expect(cond(full, "STANDARD", "score")).toMatchObject({ met: false, text: "score 20 of 25 (now 19)" });
    const partial = graduation(sym(goodCompany, { score: { total: 16, state: "Setup met (>=18)", evidencedMax: 21 } }), rules);
    expect(cond(partial, "STANDARD", "score")).toMatchObject({ met: false, text: "score 17 of 21 (now 16)" });
    expect(partial.line).toBe("STANDARD needs: score 17 of 21 (now 16).");
  });

  it("matching the open rules reaches the needed rating (mirrors the rule groups in signals.ts)", () => {
    for (const fields of [goodCompany, strongCompany]) {
      const input = sym(fields);
      const g = graduation(input);
      for (const step of g.steps) for (const c of step.conditions) {
        if (c.met || !c.missingRules || (c.id !== "company" && c.id !== "catalyst")) continue;
        const ids = new Set(c.missingRules.map((m) => m.id));
        const ruleHits = input.ruleHits.map((h) => (ids.has(h.id) ? { ...h, matched: true } : h));
        const need = step.tier === "FULL" ? (c.id === "company" ? SIGNAL_RULES.startTiers.full.company : SIGNAL_RULES.startTiers.full.catalyst) : SIGNAL_RULES.startTiers.standard.company;
        const order = ["Weak", "Neutral", "Good", "Strong", "Very strong"];
        expect(order.indexOf(ratings({ ...input, ruleHits }).ratings[c.id])).toBeGreaterThanOrEqual(order.indexOf(need));
      }
    }
  });

  it("meeting the STANDARD conditions moves the engine tier up", () => {
    const fields = { ...goodCompany, epsBeat: f(true) };
    expect(signalFor(sym(fields)).sizeTier).toBe("STANDARD");
    expect(graduation(sym(fields)).next).toBe("FULL");
  });

  it("is pure and carries the rule version; the line has no amounts", () => {
    const input = sym(carriedRevenue);
    expect(graduation(input)).toEqual(graduation(structuredClone(input)));
    expect(graduation(input).ruleConfigVersion).toBe(SIGNAL_RULES.version);
    for (const fields of [goodCompany, strongCompany, carriedRevenue]) expect(graduation(sym(fields)).line).not.toMatch(/EUR|€/);
  });
});
