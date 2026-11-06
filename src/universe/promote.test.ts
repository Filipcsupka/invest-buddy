import { describe, expect, it } from "vitest";
import type { OHLCV } from "../engine/types";
import { sessionsBetween } from "../data/trading-calendar";
import { cleanSessionRun, isCleanSession, planPromotions, PROMOTE, weekStartOf, type PromoteCandidate } from "./promote";

const all = sessionsBetween("2025-09-01", "2026-10-16");
const recent = all.slice(-PROMOTE.cleanSessions);
const bar = (date: string, over: Partial<OHLCV> = {}): OHLCV => ({ date, open: 100, high: 101, low: 99, close: 100, volume: 1000, ...over });
const clean = (volume = 1000) => all.map((d) => bar(d, { volume }));
const candidate = (ticker: string, over: Partial<PromoteCandidate> = {}): PromoteCandidate => ({ ticker, name: ticker, validFrom: "2026-09-01", bars: clean(), yoyGrowthPct: 20, ...over });
const opts = { today: "2026-10-18", alreadyThisWeek: 0 };

describe("clean sessions (D16)", () => {
  it("counts a session clean when its bar is stored and no D16 check fails", () => {
    expect(isCleanSession(clean(), recent[9])).toBe(true);
    expect(cleanSessionRun(clean(), recent, "2026-01-01")).toBe(10);
  });
  it("does not count a session without its bar", () => {
    const bars = clean().filter((b) => b.date !== recent[9]);
    expect(isCleanSession(bars, recent[9])).toBe(false);
    expect(cleanSessionRun(bars, recent, "2026-01-01")).toBe(0);
  });
  it("stops the run at a session with a D16 fail", () => {
    const bars = clean().map((b) => (b.date === recent[5] ? { ...b, high: 90, low: 95 } : b));
    // high below low fails every later session too, since the checks see the bars up to each session.
    expect(cleanSessionRun(bars, recent, "2026-01-01")).toBe(0);
    const fewRows = clean().slice(-150);
    expect(cleanSessionRun(fewRows, recent, "2026-01-01")).toBe(0);
  });
  it("counts only sessions on or after the day the name joined", () => {
    expect(cleanSessionRun(clean(), recent, recent[6])).toBe(4);
  });
});

describe("planPromotions", () => {
  it("promotes names with 10 clean sessions and lists the rest as waiting", () => {
    const plan = planPromotions([candidate("AAA"), candidate("BBB", { validFrom: recent[3] }), candidate("CCC", { bars: clean().filter((b) => b.date !== recent[9]) })], recent, opts);
    expect(plan.promote.map((p) => p.ticker)).toEqual(["AAA"]);
    expect(plan.waiting).toEqual([{ ticker: "BBB", cleanSessions: 7 }, { ticker: "CCC", cleanSessions: 0 }]);
  });
  it("orders by growth, then dollar volume, then ticker, unknown growth last", () => {
    const plan = planPromotions([
      candidate("LOW", { yoyGrowthPct: 10 }), candidate("NUL", { yoyGrowthPct: null }), candidate("HIB", { yoyGrowthPct: 50 }),
      candidate("HIA", { yoyGrowthPct: 50 }), candidate("VOL", { yoyGrowthPct: 50, bars: clean(5000) }),
    ], recent, opts);
    expect(plan.promote.map((p) => p.ticker)).toEqual(["VOL", "HIA", "HIB", "LOW", "NUL"]);
  });
  it("caps the week and subtracts promotions already made this week", () => {
    const many = Array.from({ length: 15 }, (_, i) => candidate(`T${String(i).padStart(2, "0")}`, { yoyGrowthPct: 100 - i }));
    expect(planPromotions(many, recent, opts).promote).toHaveLength(PROMOTE.weeklyCap);
    expect(planPromotions(many, recent, { ...opts, alreadyThisWeek: 7 }).promote.map((p) => p.ticker)).toEqual(["T00", "T01", "T02"]);
    expect(planPromotions(many, recent, { ...opts, alreadyThisWeek: 12 }).promote).toEqual([]);
    expect(planPromotions(many, recent, { ...opts, cap: 0 }).promote).toEqual([]);
  });
  it("is idempotent: the same input gives the same plan, and a full week promotes nothing more", () => {
    const input = [candidate("AAA"), candidate("BBB", { yoyGrowthPct: 90 })];
    expect(planPromotions(input, recent, opts)).toEqual(planPromotions(input, recent, opts));
    const first = planPromotions(input, recent, { ...opts, cap: 1 });
    expect(first.promote.map((p) => p.ticker)).toEqual(["BBB"]);
    const rest = input.filter((c) => !first.promote.some((p) => p.ticker === c.ticker));
    expect(planPromotions(rest, recent, { ...opts, cap: 1, alreadyThisWeek: 1 }).promote).toEqual([]);
  });
  it("needs enough sessions and a valid cap", () => {
    expect(() => planPromotions([], recent.slice(1), opts)).toThrow(/need 10 sessions/);
    expect(() => planPromotions([], recent, { ...opts, cap: -1 })).toThrow(/cap/);
  });
  it("uses the Monday of the UTC week", () => {
    expect(weekStartOf("2026-10-18")).toBe("2026-10-12");
    expect(weekStartOf("2026-10-19")).toBe("2026-10-19");
  });
});
